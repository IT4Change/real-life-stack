// mapPersonalDocConfirmations: pure projection of PersonalDoc verifications and
// attestations into generic ConfirmationView[]. This module must stay free of
// any transport, delivery, outbox, QR, or challenge concerns — those live on
// the existing SignedClaim path.

import type { ConfirmationView } from "@real-life-stack/data-interface"

export interface VerificationDocLike {
  id: string
  fromDid: string
  toDid: string
  timestamp: string
}

export interface AttestationDocLike {
  id: string
  fromDid: string
  toDid: string
  claim: string
  tagsJson: string | null
  createdAt: string
}

export interface AttestationMetadataDocLike {
  attestationId: string
  accepted: boolean
}

export interface PersonalDocConfirmationsLike {
  verifications?: Record<string, VerificationDocLike> | undefined
  attestations?: Record<string, AttestationDocLike> | undefined
  attestationMetadata?: Record<string, AttestationMetadataDocLike> | undefined
}

export function mapPersonalDocConfirmations(doc: PersonalDocConfirmationsLike): ConfirmationView[] {
  const out: ConfirmationView[] = []

  const verifications = doc.verifications ?? {}
  for (const v of Object.values(verifications)) {
    if (!v?.id) continue
    out.push(mapVerification(v))
  }

  const attestations = doc.attestations ?? {}
  const metadata = doc.attestationMetadata ?? {}
  for (const a of Object.values(attestations)) {
    if (!a?.id) continue
    out.push(mapAttestation(a, metadata[a.id]))
  }

  return out
}

export function projectConfirmations(doc: PersonalDocConfirmationsLike): ConfirmationView[] {
  return mapPersonalDocConfirmations(doc)
}

export function parseConfirmationTags(tagsJson: string | null | undefined): string[] | undefined {
  if (!tagsJson) return undefined
  try {
    const parsed = JSON.parse(tagsJson)
    if (Array.isArray(parsed) && parsed.every((t) => typeof t === "string")) {
      return parsed as string[]
    }
    return undefined
  } catch {
    return undefined
  }
}

function mapVerification(v: VerificationDocLike): ConfirmationView {
  return {
    id: v.id,
    issuerId: v.fromDid,
    subjectId: v.toDid,
    claim: "physical-meeting",
    tags: ["verification"],
    schema: "wot:verification",
    trustLevel: "signed-attested",
    source: "wot",
    createdAt: v.timestamp,
    isAccepted: true,
  }
}

function mapAttestation(
  a: AttestationDocLike,
  meta: AttestationMetadataDocLike | undefined,
): ConfirmationView {
  const tags = parseConfirmationTags(a.tagsJson)
  const view: ConfirmationView = {
    id: a.id,
    issuerId: a.fromDid,
    subjectId: a.toDid,
    claim: a.claim,
    schema: "wot:attestation",
    trustLevel: "signed-attested",
    source: "wot",
    createdAt: a.createdAt,
    isAccepted: meta?.accepted ?? false,
  }
  if (tags !== undefined) view.tags = tags
  return view
}
