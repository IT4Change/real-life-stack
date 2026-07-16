// Pure projection of verified WoT Attestation views into RLS Confirmations.
// Transport, delivery, outbox, QR, and challenge concerns stay outside.

import type { ConfirmationView } from "@real-life-stack/data-interface"
import type { Attestation } from "@real-life/wot-core/types"

export interface AttestationMetadataLike {
  attestationId: string
  accepted: boolean
}

export function projectAttestationConfirmations(
  attestations: readonly Attestation[],
  metadata: Readonly<Record<string, AttestationMetadataLike | undefined>> = {},
): ConfirmationView[] {
  return attestations.map((attestation) => {
    const verification = attestation.isVerification === true
    const tags = attestation.tags ?? (verification ? ["verification"] : undefined)
    const view: ConfirmationView = {
      id: attestation.id,
      issuerId: attestation.from,
      subjectId: attestation.to,
      claim: attestation.claim,
      schema: verification ? "wot:verification" : "wot:attestation",
      trustLevel: "signed-attested",
      source: "wot",
      createdAt: attestation.createdAt,
      isAccepted: metadata[attestation.id]?.accepted ?? false,
    }
    if (tags !== undefined) view.tags = [...tags]
    return view
  })
}

export function parseConfirmationTags(tagsJson: string | null | undefined): string[] | undefined {
  if (!tagsJson) return undefined
  try {
    const parsed = JSON.parse(tagsJson)
    return Array.isArray(parsed) && parsed.every((tag) => typeof tag === "string")
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}
