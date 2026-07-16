import { describe, expect, it, vi } from "vitest"
import type { Attestation, DeliveryReceipt } from "@real-life/wot-core/types"

const wireMocks = vi.hoisted(() => ({
  sendAttestationInbox: vi.fn(),
}))

vi.mock("../src/attestation-wire.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/attestation-wire.js")>(),
  sendAttestationInbox: wireMocks.sendAttestationInbox,
}))

import { WotConnector } from "../src/wot-connector.js"

const attestation: Attestation = {
  id: "urn:uuid:11111111-1111-4111-8111-111111111111",
  from: "did:key:alice",
  to: "did:key:bob",
  claim: "Alice met Bob",
  createdAt: "2026-07-16T10:00:00.000Z",
  vcJws: "header.payload.signature",
}

function receipt(status: DeliveryReceipt["status"]): DeliveryReceipt {
  return {
    messageId: "11111111-1111-4111-8111-111111111111",
    status,
    timestamp: "2026-07-16T10:00:01.000Z",
  }
}

describe("WotConnector attestation delivery state", () => {
  it("marks a direct failed receipt as failed and releases its correlation", async () => {
    wireMocks.sendAttestationInbox.mockResolvedValue({
      envelope: { id: receipt("failed").messageId },
      receipt: receipt("failed"),
    })
    const statuses: string[] = []
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      outboxAdapter: {},
      outboxStore: null,
      identity: {},
      protocolCrypto: {},
      deliveryMessageIds: new Map<string, string>(),
      inFlightDeliveryMessageIds: new Set<string>(),
      setDeliveryStatus: vi.fn(async (_attestationId: string, status: string) => {
        statuses.push(status)
      }),
    })

    await (WotConnector.prototype as any).deliverAttestation.call(
      fake,
      attestation,
      new Uint8Array(32),
    )

    expect(statuses).toEqual(["sending", "failed"])
    expect(fake.deliveryMessageIds.size).toBe(0)
  })

  it.each(["accepted", "delivered", "failed"] as const)(
    "removes terminal %s receipt correlations from the runtime map",
    async (status) => {
      const deliveryMessageIds = new Map([[receipt(status).messageId, attestation.id]])
      const setDeliveryStatus = vi.fn(async () => {})
      const fake = Object.assign(Object.create(WotConnector.prototype), {
        outboxStore: null,
        deliveryMessageIds,
        inFlightDeliveryMessageIds: new Set<string>(),
        setDeliveryStatus,
      })

      await (WotConnector.prototype as any).applyTransportDeliveryReceipt.call(
        fake,
        receipt(status),
      )

      expect(deliveryMessageIds.size).toBe(0)
      expect(setDeliveryStatus).toHaveBeenCalledWith(
        attestation.id,
        status === "failed" ? "failed" : "delivered",
      )
    },
  )

  it("keeps a queued correlation until the outbox reaches a terminal receipt", async () => {
    const queuedReceipt = {
      ...receipt("accepted"),
      reason: "queued-in-outbox",
    }
    const deliveryMessageIds = new Map([[queuedReceipt.messageId, attestation.id]])
    const setDeliveryStatus = vi.fn(async () => {})
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      outboxStore: null,
      deliveryMessageIds,
      inFlightDeliveryMessageIds: new Set<string>(),
      setDeliveryStatus,
    })

    await (WotConnector.prototype as any).applyTransportDeliveryReceipt.call(
      fake,
      queuedReceipt,
    )

    expect(deliveryMessageIds.get(queuedReceipt.messageId)).toBe(attestation.id)
    expect(setDeliveryStatus).toHaveBeenCalledWith(attestation.id, "queued")
  })
})
