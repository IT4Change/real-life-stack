import { describe, it, expect } from "vitest"
import type { ConfirmationView } from "@real-life-stack/data-interface"

/**
 * Pure projection: PersonalDoc verifications/attestations -> ConfirmationView[].
 *
 * The projection is intentionally backend-agnostic and must NOT carry any
 * delivery, outbox, QR, or challenge concerns into ConfirmationView. Those
 * stay on the existing SignedClaim path.
 *
 * These tests exercise the pure mapper that the WoTConnector's
 * getConfirmations() / observeConfirmations() implementation will use.
 */

import { parseConfirmationTags, projectConfirmations } from "../src/confirmations.js"

// --- Doc fixtures (mirror @real-life/adapter-yjs shape; kept local + minimal) ---

interface VerificationDocLike {
  id: string
  fromDid: string
  toDid: string
  timestamp: string
  proofJson?: string | null
  locationJson?: string | null
}

interface AttestationDocLike {
  id: string
  attestationId?: string
  fromDid: string
  toDid: string
  claim: string
  tagsJson: string | null
  context?: string | null
  createdAt: string
  vcJws?: string
}

interface AttestationMetadataDocLike {
  attestationId: string
  accepted: boolean
  acceptedAt?: string | null
  deliveryStatus?: string | null
}

interface PersonalDocLike {
  verifications?: Record<string, VerificationDocLike>
  attestations?: Record<string, AttestationDocLike>
  attestationMetadata?: Record<string, AttestationMetadataDocLike>
}

// --- Tests ---

describe("projectConfirmations — empty/missing inputs", () => {
  it("returns an empty array for an empty PersonalDoc", () => {
    const result = projectConfirmations({})
    expect(result).toEqual([])
  })

  it("returns an empty array when verifications/attestations are undefined", () => {
    const result = projectConfirmations({
      verifications: undefined,
      attestations: undefined,
      attestationMetadata: undefined,
    } as PersonalDocLike)
    expect(result).toEqual([])
  })
})

describe("projectConfirmations — verification mapping", () => {
  it("maps a PersonalDoc verification to a ConfirmationView with physical-meeting claim", () => {
    const doc: PersonalDocLike = {
      verifications: {
        "ver-1": {
          id: "ver-1",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          timestamp: "2026-04-12T08:00:00Z",
          proofJson: JSON.stringify({ type: "Ed25519Signature2020", proofValue: "sig" }),
        },
      },
    }

    const result = projectConfirmations(doc)
    expect(result).toHaveLength(1)

    const [view] = result as ConfirmationView[]
    expect(view.id).toBe("ver-1")
    expect(view.issuerId).toBe("did:key:alice")
    expect(view.subjectId).toBe("did:key:bob")
    expect(view.claim).toBe("physical-meeting")
    expect(view.tags).toEqual(["verification"])
    expect(view.schema).toBe("wot:verification")
    expect(view.trustLevel).toBe("signed-attested")
    expect(view.source).toBe("wot")
    expect(view.createdAt).toBe("2026-04-12T08:00:00Z")
    expect(view.isAccepted).toBe(true)
  })

  it("projects every verification, preserving issuer/subject DIDs", () => {
    const doc: PersonalDocLike = {
      verifications: {
        "ver-1": {
          id: "ver-1",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          timestamp: "2026-04-12T08:00:00Z",
        },
        "ver-2": {
          id: "ver-2",
          fromDid: "did:key:carla",
          toDid: "did:key:dave",
          timestamp: "2026-04-13T09:00:00Z",
        },
      },
    }

    const result = projectConfirmations(doc) as ConfirmationView[]
    const byId = new Map(result.map((v) => [v.id, v]))

    expect(byId.size).toBe(2)
    expect(byId.get("ver-1")?.issuerId).toBe("did:key:alice")
    expect(byId.get("ver-1")?.subjectId).toBe("did:key:bob")
    expect(byId.get("ver-2")?.issuerId).toBe("did:key:carla")
    expect(byId.get("ver-2")?.subjectId).toBe("did:key:dave")
    for (const v of result) {
      expect(v.claim).toBe("physical-meeting")
      expect(v.tags).toEqual(["verification"])
      expect(v.schema).toBe("wot:verification")
      expect(v.trustLevel).toBe("signed-attested")
      expect(v.source).toBe("wot")
      expect(v.isAccepted).toBe(true)
    }
  })
})

describe("projectConfirmations — attestation mapping", () => {
  it("maps a PersonalDoc attestation to a ConfirmationView with parsed tags", () => {
    const doc: PersonalDocLike = {
      attestations: {
        "att-1": {
          id: "att-1",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          claim: "is trustworthy",
          tagsJson: JSON.stringify(["trust", "neighbour"]),
          createdAt: "2026-04-14T10:30:00Z",
          vcJws: "vc-jws-token",
        },
      },
      attestationMetadata: {
        "att-1": {
          attestationId: "att-1",
          accepted: true,
          acceptedAt: "2026-04-14T10:31:00Z",
          deliveryStatus: "delivered",
        },
      },
    }

    const result = projectConfirmations(doc) as ConfirmationView[]
    expect(result).toHaveLength(1)

    const [view] = result
    expect(view.id).toBe("att-1")
    expect(view.issuerId).toBe("did:key:alice")
    expect(view.subjectId).toBe("did:key:bob")
    expect(view.claim).toBe("is trustworthy")
    expect(view.tags).toEqual(["trust", "neighbour"])
    expect(view.schema).toBe("wot:attestation")
    expect(view.trustLevel).toBe("signed-attested")
    expect(view.source).toBe("wot")
    expect(view.createdAt).toBe("2026-04-14T10:30:00Z")
    expect(view.isAccepted).toBe(true)
  })

  it("uses isAccepted=false when attestation metadata says accepted=false", () => {
    const doc: PersonalDocLike = {
      attestations: {
        "att-2": {
          id: "att-2",
          fromDid: "did:key:carla",
          toDid: "did:key:dave",
          claim: "knows about cooking",
          tagsJson: JSON.stringify(["skill"]),
          createdAt: "2026-04-15T12:00:00Z",
        },
      },
      attestationMetadata: {
        "att-2": {
          attestationId: "att-2",
          accepted: false,
        },
      },
    }

    const [view] = projectConfirmations(doc) as ConfirmationView[]
    expect(view.isAccepted).toBe(false)
  })

  it("defaults isAccepted to false when metadata is missing entirely", () => {
    const doc: PersonalDocLike = {
      attestations: {
        "att-3": {
          id: "att-3",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          claim: "great host",
          tagsJson: null,
          createdAt: "2026-04-16T13:00:00Z",
        },
      },
    }

    const [view] = projectConfirmations(doc) as ConfirmationView[]
    expect(view.isAccepted).toBe(false)
  })

  it("omits tags when tagsJson is null", () => {
    const doc: PersonalDocLike = {
      attestations: {
        "att-4": {
          id: "att-4",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          claim: "hello",
          tagsJson: null,
          createdAt: "2026-04-17T14:00:00Z",
        },
      },
      attestationMetadata: {
        "att-4": { attestationId: "att-4", accepted: true },
      },
    }

    const [view] = projectConfirmations(doc) as ConfirmationView[]
    expect(view.tags).toBeUndefined()
  })

  it("tolerates malformed tagsJson (treats as absent rather than throwing)", () => {
    const doc: PersonalDocLike = {
      attestations: {
        "att-5": {
          id: "att-5",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          claim: "broken-tags",
          tagsJson: "{not valid json",
          createdAt: "2026-04-18T15:00:00Z",
        },
      },
      attestationMetadata: {
        "att-5": { attestationId: "att-5", accepted: true },
      },
    }

    expect(() => projectConfirmations(doc)).not.toThrow()
    const [view] = projectConfirmations(doc) as ConfirmationView[]
    expect(view.id).toBe("att-5")
    expect(view.tags).toBeUndefined()
  })

  it("uses the shared safe tag parser for malformed legacy claim tags", () => {
    expect(parseConfirmationTags("{not valid json")).toBeUndefined()
    expect(parseConfirmationTags(JSON.stringify(["skill", "garden"]))).toEqual(["skill", "garden"])
  })
})

describe("projectConfirmations — combined mapping", () => {
  it("projects both verifications and attestations into one list", () => {
    const doc: PersonalDocLike = {
      verifications: {
        "ver-1": {
          id: "ver-1",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          timestamp: "2026-04-12T08:00:00Z",
        },
      },
      attestations: {
        "att-1": {
          id: "att-1",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          claim: "is trustworthy",
          tagsJson: JSON.stringify(["trust"]),
          createdAt: "2026-04-14T10:30:00Z",
        },
      },
      attestationMetadata: {
        "att-1": { attestationId: "att-1", accepted: true },
      },
    }

    const result = projectConfirmations(doc) as ConfirmationView[]
    expect(result).toHaveLength(2)

    const schemas = result.map((v) => v.schema).sort()
    expect(schemas).toEqual(["wot:attestation", "wot:verification"])

    for (const v of result) {
      expect(v.source).toBe("wot")
      expect(v.trustLevel).toBe("signed-attested")
    }
  })
})

describe("projectConfirmations — must not leak delivery/outbox/QR concerns", () => {
  it("never adds deliveryStatus or other transport fields to ConfirmationView", () => {
    const doc: PersonalDocLike = {
      attestations: {
        "att-1": {
          id: "att-1",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          claim: "is trustworthy",
          tagsJson: JSON.stringify(["trust"]),
          createdAt: "2026-04-14T10:30:00Z",
        },
      },
      attestationMetadata: {
        "att-1": {
          attestationId: "att-1",
          accepted: true,
          deliveryStatus: "failed",
        },
      },
    }

    const [view] = projectConfirmations(doc) as ConfirmationView[]
    const forbiddenFields = [
      "deliveryStatus",
      "delivery",
      "outbox",
      "outboxPending",
      "challenge",
      "challengeCode",
      "qr",
      "vcJws",
      "proofJson",
    ]
    for (const field of forbiddenFields) {
      expect(view).not.toHaveProperty(field)
    }
  })

  it("does not surface ClaimDeliveryStatus values inside tags", () => {
    const doc: PersonalDocLike = {
      attestations: {
        "att-1": {
          id: "att-1",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          claim: "trust",
          tagsJson: JSON.stringify(["trust"]),
          createdAt: "2026-04-14T10:30:00Z",
        },
      },
      attestationMetadata: {
        "att-1": {
          attestationId: "att-1",
          accepted: true,
          deliveryStatus: "failed",
        },
      },
    }

    const [view] = projectConfirmations(doc) as ConfirmationView[]
    const delivery = ["sending", "queued", "delivered", "acknowledged", "failed"]
    for (const status of delivery) {
      expect(view.tags ?? []).not.toContain(status)
    }
  })
})

describe("connector-flow regression — malformed tags must not block the projection", () => {
  // Simulates the WoTConnector.syncClaimsFromPersonalDoc() flow that drives
  // confirmationsObs. If a single legacy attestation has malformed tagsJson,
  // the confirmation projection must still publish a fresh value covering
  // every verification and attestation, including the malformed one (with
  // tags treated as absent).

  function runConnectorProjection(doc: PersonalDocLike): ConfirmationView[] {
    let published: ConfirmationView[] | undefined
    const observableSet = (value: ConfirmationView[]) => {
      published = value
    }
    observableSet(projectConfirmations(doc))
    return published ?? []
  }

  it("publishes a confirmation list when one attestation has malformed tagsJson", () => {
    const doc: PersonalDocLike = {
      verifications: {
        "ver-1": {
          id: "ver-1",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          timestamp: "2026-04-12T08:00:00Z",
        },
      },
      attestations: {
        "att-good": {
          id: "att-good",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          claim: "good",
          tagsJson: JSON.stringify(["ok"]),
          createdAt: "2026-04-14T10:30:00Z",
        },
        "att-broken": {
          id: "att-broken",
          fromDid: "did:key:alice",
          toDid: "did:key:bob",
          claim: "broken-tags",
          tagsJson: "{not valid json",
          createdAt: "2026-04-15T11:00:00Z",
        },
      },
      attestationMetadata: {
        "att-good": { attestationId: "att-good", accepted: true },
        "att-broken": { attestationId: "att-broken", accepted: true },
      },
    }

    const published = runConnectorProjection(doc)
    const ids = published.map((v) => v.id).sort()
    expect(ids).toEqual(["att-broken", "att-good", "ver-1"])

    const broken = published.find((v) => v.id === "att-broken")
    expect(broken).toBeDefined()
    expect(broken!.tags).toBeUndefined()
    expect(broken!.claim).toBe("broken-tags")
    expect(broken!.isAccepted).toBe(true)
  })

  it("parseConfirmationTags is safe on the legacy path (returns undefined for malformed JSON)", () => {
    expect(parseConfirmationTags("{not valid json")).toBeUndefined()
    expect(parseConfirmationTags(null)).toBeUndefined()
    expect(parseConfirmationTags(undefined)).toBeUndefined()
    expect(parseConfirmationTags(JSON.stringify(["a", "b"]))).toEqual(["a", "b"])
    // Non-array / non-string-array shapes are rejected without throwing
    expect(parseConfirmationTags(JSON.stringify({ not: "array" }))).toBeUndefined()
    expect(parseConfirmationTags(JSON.stringify([1, 2, 3]))).toBeUndefined()
  })
})
