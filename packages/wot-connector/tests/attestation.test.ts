import { describe, it, expect, beforeEach, vi } from "vitest"
import type { MessageEnvelope, MessageType, DeliveryReceipt } from "@real-life/wot-core"

/**
 * Tests for attestation features the WoT Connector must implement:
 *
 * 1. issueConfirmation → send attestation via relay (not just store locally)
 * 2. Incoming attestation → verify signature → store → send ACK
 * 3. Incoming attestation-ack → update delivery status to 'acknowledged'
 * 4. resendAttestation → reconstruct envelope from stored attestation → resend
 *
 * Tests validate the logic in isolation using the same patterns as
 * AttestationService.ts in the Demo App.
 */

// --- Types ---

interface StoredAttestation {
  id: string
  fromDid: string
  toDid: string
  claim: string
  tagsJson: string | null
  createdAt: string
  proofJson: string
}

interface AttestationMetadata {
  attestationId: string
  accepted: boolean
  acceptedAt: string | null
  deliveryStatus: string
}

// --- Fake implementations ---

function createFakeMessaging() {
  const sent: MessageEnvelope[] = []

  return {
    send: vi.fn(async (envelope: MessageEnvelope): Promise<DeliveryReceipt> => {
      sent.push(envelope)
      return { messageId: envelope.id, status: "delivered", timestamp: new Date().toISOString() }
    }),
    _sent: sent,
  }
}

function createFakePersonalDoc(
  attestations: Record<string, StoredAttestation> = {},
  metadata: Record<string, AttestationMetadata> = {},
) {
  return {
    attestations: { ...attestations },
    attestationMetadata: { ...metadata },
  }
}

// --- Logic to test (extracted from what the connector should implement) ---

/**
 * Send attestation via relay after creating it.
 * This is what issueConfirmation should do AFTER storing locally.
 */
async function sendAttestation(
  attestation: StoredAttestation,
  messaging: ReturnType<typeof createFakeMessaging>,
): Promise<DeliveryReceipt> {
  const proof = JSON.parse(attestation.proofJson)
  const tags = attestation.tagsJson ? JSON.parse(attestation.tagsJson) : undefined

  const envelope: MessageEnvelope = {
    v: 1,
    id: attestation.id,
    type: "attestation" as MessageType,
    fromDid: attestation.fromDid,
    toDid: attestation.toDid,
    createdAt: attestation.createdAt,
    encoding: "json",
    payload: JSON.stringify({
      id: attestation.id,
      from: attestation.fromDid,
      to: attestation.toDid,
      claim: attestation.claim,
      tags,
      createdAt: attestation.createdAt,
      proof,
    }),
    signature: proof.proofValue,
  }

  return messaging.send(envelope)
}

/**
 * Handle incoming attestation-ack message.
 * Updates the delivery status to 'acknowledged'.
 */
function handleAttestationAck(
  envelope: MessageEnvelope,
  deliveryStatuses: Map<string, string>,
): boolean {
  if (envelope.type !== "attestation-ack") return false

  try {
    const { attestationId } = JSON.parse(envelope.payload)
    if (!attestationId) return false
    deliveryStatuses.set(attestationId, "acknowledged")
    return true
  } catch {
    return false
  }
}

/**
 * Handle incoming attestation: verify signature, return attestation data.
 * Returns null if signature is invalid or message is malformed.
 */
async function handleIncomingAttestation(
  envelope: MessageEnvelope,
  myDid: string,
  verifyFn: (data: string, signature: string, fromDid: string) => Promise<boolean>,
): Promise<{ attestation: any; ackEnvelope: MessageEnvelope } | null> {
  if (envelope.type !== "attestation" || envelope.toDid !== myDid) return null

  try {
    const attestation = JSON.parse(envelope.payload)
    if (!attestation.id || !attestation.from || !attestation.to || !attestation.proof) return null

    // Verify signature
    const dataToVerify = JSON.stringify({
      from: attestation.from,
      to: attestation.to,
      claim: attestation.claim,
      tags: attestation.tags,
      createdAt: attestation.createdAt,
    })
    const isValid = await verifyFn(dataToVerify, attestation.proof.proofValue, attestation.from)
    if (!isValid) return null

    // Construct ACK envelope
    const ackEnvelope: MessageEnvelope = {
      v: 1,
      id: `ack-${attestation.id}`,
      type: "attestation-ack" as MessageType,
      fromDid: myDid,
      toDid: attestation.from,
      createdAt: new Date().toISOString(),
      encoding: "json",
      payload: JSON.stringify({ attestationId: attestation.id }),
      signature: "",
    }

    return { attestation, ackEnvelope }
  } catch {
    return null
  }
}

/**
 * Retry an attestation delivery: reconstruct envelope from stored attestation and resend.
 */
async function resendAttestation(
  attestationId: string,
  doc: ReturnType<typeof createFakePersonalDoc>,
  messaging: ReturnType<typeof createFakeMessaging>,
): Promise<string> {
  const att = doc.attestations[attestationId]
  if (!att) throw new Error("Attestation not found")

  const receipt = await sendAttestation(att, messaging)
  const status = receipt.reason === "queued-in-outbox" ? "queued" : "delivered"

  // Update metadata
  if (doc.attestationMetadata[attestationId]) {
    doc.attestationMetadata[attestationId].deliveryStatus = status
  }

  return status
}

// --- Tests ---

describe("Send Attestation via Relay", () => {
  it("sends attestation envelope with correct structure", async () => {
    const messaging = createFakeMessaging()
    const attestation: StoredAttestation = {
      id: "att-1",
      fromDid: "did:key:alice",
      toDid: "did:key:bob",
      claim: "Is trustworthy",
      tagsJson: JSON.stringify(["trust"]),
      createdAt: "2026-03-16T10:00:00Z",
      proofJson: JSON.stringify({ type: "Ed25519Signature2020", proofValue: "sig123" }),
    }

    await sendAttestation(attestation, messaging)

    expect(messaging.send).toHaveBeenCalledTimes(1)
    const sent = messaging._sent[0]
    expect(sent.type).toBe("attestation")
    expect(sent.fromDid).toBe("did:key:alice")
    expect(sent.toDid).toBe("did:key:bob")
    expect(sent.signature).toBe("sig123")

    const payload = JSON.parse(sent.payload)
    expect(payload.id).toBe("att-1")
    expect(payload.claim).toBe("Is trustworthy")
    expect(payload.tags).toEqual(["trust"])
    expect(payload.proof.proofValue).toBe("sig123")
  })

  it("sends attestation without tags", async () => {
    const messaging = createFakeMessaging()
    const attestation: StoredAttestation = {
      id: "att-2",
      fromDid: "did:key:alice",
      toDid: "did:key:bob",
      claim: "Hello",
      tagsJson: null,
      createdAt: "2026-03-16T10:00:00Z",
      proofJson: JSON.stringify({ type: "Ed25519Signature2020", proofValue: "sig456" }),
    }

    await sendAttestation(attestation, messaging)

    const payload = JSON.parse(messaging._sent[0].payload)
    expect(payload.tags).toBeUndefined()
  })
})

describe("Attestation ACK Handler", () => {
  it("updates delivery status to acknowledged", () => {
    const statuses = new Map<string, string>([["att-1", "delivered"]])

    const envelope: MessageEnvelope = {
      v: 1, id: "ack-att-1", type: "attestation-ack" as MessageType,
      fromDid: "did:key:bob", toDid: "did:key:alice",
      createdAt: new Date().toISOString(), encoding: "json",
      payload: JSON.stringify({ attestationId: "att-1" }),
      signature: "",
    }

    const handled = handleAttestationAck(envelope, statuses)

    expect(handled).toBe(true)
    expect(statuses.get("att-1")).toBe("acknowledged")
  })

  it("ignores non-attestation-ack messages", () => {
    const statuses = new Map<string, string>()

    const envelope: MessageEnvelope = {
      v: 1, id: "msg-1", type: "verification" as MessageType,
      fromDid: "did:key:bob", toDid: "did:key:alice",
      createdAt: new Date().toISOString(), encoding: "json",
      payload: "{}", signature: "",
    }

    const handled = handleAttestationAck(envelope, statuses)

    expect(handled).toBe(false)
    expect(statuses.size).toBe(0)
  })

  it("handles malformed payload gracefully", () => {
    const statuses = new Map<string, string>()

    const envelope: MessageEnvelope = {
      v: 1, id: "ack-1", type: "attestation-ack" as MessageType,
      fromDid: "did:key:bob", toDid: "did:key:alice",
      createdAt: new Date().toISOString(), encoding: "json",
      payload: "not-json", signature: "",
    }

    const handled = handleAttestationAck(envelope, statuses)

    expect(handled).toBe(false)
  })

  it("handles missing attestationId in payload", () => {
    const statuses = new Map<string, string>()

    const envelope: MessageEnvelope = {
      v: 1, id: "ack-1", type: "attestation-ack" as MessageType,
      fromDid: "did:key:bob", toDid: "did:key:alice",
      createdAt: new Date().toISOString(), encoding: "json",
      payload: JSON.stringify({ other: "data" }),
      signature: "",
    }

    const handled = handleAttestationAck(envelope, statuses)

    expect(handled).toBe(false)
  })
})

describe("Incoming Attestation Handler", () => {
  const alwaysValid = async () => true
  const alwaysInvalid = async () => false
  const myDid = "did:key:alice"

  function createAttestationEnvelope(overrides: Partial<{
    id: string, from: string, to: string, claim: string, tags: string[], proofValue: string
  }> = {}): MessageEnvelope {
    const attestation = {
      id: overrides.id ?? "att-1",
      from: overrides.from ?? "did:key:bob",
      to: overrides.to ?? myDid,
      claim: overrides.claim ?? "Is trustworthy",
      tags: overrides.tags ?? ["trust"],
      createdAt: "2026-03-16T10:00:00Z",
      proof: { type: "Ed25519Signature2020", proofValue: overrides.proofValue ?? "sig123" },
    }

    return {
      v: 1, id: attestation.id, type: "attestation" as MessageType,
      fromDid: attestation.from, toDid: attestation.to,
      createdAt: attestation.createdAt, encoding: "json",
      payload: JSON.stringify(attestation), signature: attestation.proof.proofValue,
    }
  }

  it("verifies signature and returns attestation + ACK", async () => {
    const envelope = createAttestationEnvelope()
    const result = await handleIncomingAttestation(envelope, myDid, alwaysValid)

    expect(result).not.toBeNull()
    expect(result!.attestation.id).toBe("att-1")
    expect(result!.attestation.claim).toBe("Is trustworthy")

    // ACK envelope
    expect(result!.ackEnvelope.type).toBe("attestation-ack")
    expect(result!.ackEnvelope.fromDid).toBe(myDid)
    expect(result!.ackEnvelope.toDid).toBe("did:key:bob")
    const ackPayload = JSON.parse(result!.ackEnvelope.payload)
    expect(ackPayload.attestationId).toBe("att-1")
  })

  it("rejects attestation with invalid signature", async () => {
    const envelope = createAttestationEnvelope()
    const result = await handleIncomingAttestation(envelope, myDid, alwaysInvalid)

    expect(result).toBeNull()
  })

  it("ignores attestation addressed to someone else", async () => {
    const envelope = createAttestationEnvelope({ to: "did:key:carla" })
    const result = await handleIncomingAttestation(envelope, myDid, alwaysValid)

    expect(result).toBeNull()
  })

  it("ignores non-attestation messages", async () => {
    const envelope: MessageEnvelope = {
      v: 1, id: "msg-1", type: "verification" as MessageType,
      fromDid: "did:key:bob", toDid: myDid,
      createdAt: new Date().toISOString(), encoding: "json",
      payload: "{}", signature: "",
    }

    const result = await handleIncomingAttestation(envelope, myDid, alwaysValid)

    expect(result).toBeNull()
  })

  it("ignores malformed payload", async () => {
    const envelope: MessageEnvelope = {
      v: 1, id: "att-1", type: "attestation" as MessageType,
      fromDid: "did:key:bob", toDid: myDid,
      createdAt: new Date().toISOString(), encoding: "json",
      payload: "not-json", signature: "",
    }

    const result = await handleIncomingAttestation(envelope, myDid, alwaysValid)

    expect(result).toBeNull()
  })

  it("ignores attestation without proof", async () => {
    const envelope: MessageEnvelope = {
      v: 1, id: "att-1", type: "attestation" as MessageType,
      fromDid: "did:key:bob", toDid: myDid,
      createdAt: new Date().toISOString(), encoding: "json",
      payload: JSON.stringify({ id: "att-1", from: "did:key:bob", to: myDid, claim: "Hi" }),
      signature: "",
    }

    const result = await handleIncomingAttestation(envelope, myDid, alwaysValid)

    expect(result).toBeNull()
  })

  it("calls verifyFn with correct arguments", async () => {
    const verifyFn = vi.fn(async () => true)
    const envelope = createAttestationEnvelope({ claim: "Good person", tags: ["trust"] })

    await handleIncomingAttestation(envelope, myDid, verifyFn)

    expect(verifyFn).toHaveBeenCalledTimes(1)
    const [data, signature, fromDid] = verifyFn.mock.calls[0]
    expect(fromDid).toBe("did:key:bob")
    expect(signature).toBe("sig123")

    // Data should match the signing format
    const parsed = JSON.parse(data)
    expect(parsed.claim).toBe("Good person")
    expect(parsed.tags).toEqual(["trust"])
  })
})

describe("Retry Claim", () => {
  it("reconstructs and resends attestation", async () => {
    const messaging = createFakeMessaging()
    const doc = createFakePersonalDoc(
      {
        "att-1": {
          id: "att-1", fromDid: "did:key:alice", toDid: "did:key:bob",
          claim: "Trustworthy", tagsJson: JSON.stringify(["trust"]),
          createdAt: "2026-03-16T10:00:00Z",
          proofJson: JSON.stringify({ type: "Ed25519Signature2020", proofValue: "sig-original" }),
        },
      },
      {
        "att-1": { attestationId: "att-1", accepted: true, acceptedAt: "2026-03-16T10:00:00Z", deliveryStatus: "failed" },
      },
    )

    const status = await resendAttestation("att-1", doc, messaging)

    expect(status).toBe("delivered")
    expect(messaging.send).toHaveBeenCalledTimes(1)

    const sent = messaging._sent[0]
    expect(sent.id).toBe("att-1") // Same ID as original
    expect(sent.signature).toBe("sig-original") // Original signature reused
    expect(sent.toDid).toBe("did:key:bob")
  })

  it("updates metadata delivery status", async () => {
    const messaging = createFakeMessaging()
    const doc = createFakePersonalDoc(
      {
        "att-1": {
          id: "att-1", fromDid: "did:key:alice", toDid: "did:key:bob",
          claim: "Test", tagsJson: null,
          createdAt: "2026-03-16T10:00:00Z",
          proofJson: JSON.stringify({ type: "Ed25519Signature2020", proofValue: "sig" }),
        },
      },
      {
        "att-1": { attestationId: "att-1", accepted: true, acceptedAt: null, deliveryStatus: "failed" },
      },
    )

    await resendAttestation("att-1", doc, messaging)

    expect(doc.attestationMetadata["att-1"].deliveryStatus).toBe("delivered")
  })

  it("throws for nonexistent attestation", async () => {
    const messaging = createFakeMessaging()
    const doc = createFakePersonalDoc()

    await expect(resendAttestation("att-nope", doc, messaging)).rejects.toThrow("not found")
  })

  it("sets status to queued when offline", async () => {
    const messaging = createFakeMessaging()
    messaging.send.mockResolvedValue({
      messageId: "att-1",
      status: "accepted",
      timestamp: new Date().toISOString(),
      reason: "queued-in-outbox",
    } as any)

    const doc = createFakePersonalDoc(
      {
        "att-1": {
          id: "att-1", fromDid: "did:key:alice", toDid: "did:key:bob",
          claim: "Test", tagsJson: null,
          createdAt: "2026-03-16T10:00:00Z",
          proofJson: JSON.stringify({ type: "Ed25519Signature2020", proofValue: "sig" }),
        },
      },
      {
        "att-1": { attestationId: "att-1", accepted: true, acceptedAt: null, deliveryStatus: "failed" },
      },
    )

    const status = await resendAttestation("att-1", doc, messaging)

    expect(status).toBe("queued")
    expect(doc.attestationMetadata["att-1"].deliveryStatus).toBe("queued")
  })
})
