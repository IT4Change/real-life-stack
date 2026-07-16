import { describe, expect, it } from "vitest"
import type { Attestation } from "@real-life/wot-core/types"

import {
  parseConfirmationTags,
  projectAttestationConfirmations,
} from "../src/confirmations.js"

function attestation(overrides: Partial<Attestation> = {}): Attestation {
  return {
    id: "urn:uuid:11111111-1111-4111-8111-111111111111",
    from: "did:key:alice",
    to: "did:key:bob",
    claim: "hat im Garten geholfen",
    tags: ["commons"],
    createdAt: "2026-04-14T10:30:00Z",
    vcJws: "header.payload.signature",
    isVerification: false,
    ...overrides,
  }
}

describe("projectAttestationConfirmations", () => {
  it("projects ordinary signed attestations without transport concerns", () => {
    const source = attestation()
    const [view] = projectAttestationConfirmations([source], {
      [source.id]: { attestationId: source.id, accepted: true },
    })

    expect(view).toEqual({
      id: source.id,
      issuerId: "did:key:alice",
      subjectId: "did:key:bob",
      claim: "hat im Garten geholfen",
      tags: ["commons"],
      schema: "wot:attestation",
      trustLevel: "signed-attested",
      source: "wot",
      createdAt: "2026-04-14T10:30:00Z",
      isAccepted: true,
    })
    for (const forbidden of ["deliveryStatus", "outbox", "vcJws", "challenge", "qr"]) {
      expect(view).not.toHaveProperty(forbidden)
    }
  })

  it("derives verification schema only from the VC-derived marker", () => {
    const verification = attestation({
      id: "urn:uuid:22222222-2222-4222-8222-222222222222",
      claim: "in-person verifiziert",
      tags: undefined,
      isVerification: true,
    })
    const forgedLabel = attestation({
      id: "urn:uuid:33333333-3333-4333-8333-333333333333",
      claim: "in-person verifiziert",
      tags: undefined,
      isVerification: false,
    })

    const [verificationView, ordinaryView] = projectAttestationConfirmations([
      verification,
      forgedLabel,
    ])
    expect(verificationView.schema).toBe("wot:verification")
    expect(verificationView.tags).toEqual(["verification"])
    expect(ordinaryView.schema).toBe("wot:attestation")
    expect(ordinaryView.tags).toBeUndefined()
  })

  it("defaults acceptance to false and respects metadata changes", () => {
    const source = attestation()
    expect(projectAttestationConfirmations([source])[0].isAccepted).toBe(false)
    expect(projectAttestationConfirmations([source], {
      [source.id]: { attestationId: source.id, accepted: false },
    })[0].isAccepted).toBe(false)
    expect(projectAttestationConfirmations([source], {
      [source.id]: { attestationId: source.id, accepted: true },
    })[0].isAccepted).toBe(true)
  })

  it("projects verification and ordinary attestation together", () => {
    const result = projectAttestationConfirmations([
      attestation({ id: "attestation" }),
      attestation({ id: "verification", isVerification: true }),
    ])
    expect(result.map((entry) => entry.schema).sort()).toEqual([
      "wot:attestation",
      "wot:verification",
    ])
  })
})

describe("parseConfirmationTags", () => {
  it("accepts string arrays and rejects malformed or unsafe shapes", () => {
    expect(parseConfirmationTags(JSON.stringify(["a", "b"]))).toEqual(["a", "b"])
    expect(parseConfirmationTags("{broken")).toBeUndefined()
    expect(parseConfirmationTags(JSON.stringify([1, 2]))).toBeUndefined()
    expect(parseConfirmationTags(JSON.stringify({ tag: "a" }))).toBeUndefined()
    expect(parseConfirmationTags(null)).toBeUndefined()
  })
})
