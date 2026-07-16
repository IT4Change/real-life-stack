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
      pendingDeliveryReceipts: new Map<string, DeliveryReceipt>(),
      setDeliveryStatus: vi.fn(async (_attestationId: string, status: string) => {
        statuses.push(status)
        return true
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
      const setDeliveryStatus = vi.fn(async (_attestationId: string, _status: string) => {})
      const fake = Object.assign(Object.create(WotConnector.prototype), {
        outboxStore: null,
        deliveryMessageIds,
        inFlightDeliveryMessageIds: new Set<string>(),
        pendingDeliveryReceipts: new Map<string, DeliveryReceipt>(),
        setDeliveryStatus: vi.fn(async (...args: Parameters<typeof setDeliveryStatus>) => {
          await setDeliveryStatus(...args)
          return true
        }),
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
    const setDeliveryStatus = vi.fn(async (_attestationId: string, _status: string) => {})
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      outboxStore: null,
      deliveryMessageIds,
      inFlightDeliveryMessageIds: new Set<string>(),
      pendingDeliveryReceipts: new Map<string, DeliveryReceipt>(),
      setDeliveryStatus: vi.fn(async (...args: Parameters<typeof setDeliveryStatus>) => {
        await setDeliveryStatus(...args)
        return true
      }),
    })

    await (WotConnector.prototype as any).applyTransportDeliveryReceipt.call(
      fake,
      queuedReceipt,
    )

    expect(deliveryMessageIds.get(queuedReceipt.messageId)).toBe(attestation.id)
    expect(setDeliveryStatus).toHaveBeenCalledWith(attestation.id, "queued")
  })

  it("persists an early terminal receipt after storage init before releasing its correlation", async () => {
    const terminalReceipt = receipt("delivered")
    const deliveryMessageIds = new Map([[terminalReceipt.messageId, attestation.id]])
    const pendingDeliveryReceipts = new Map<string, DeliveryReceipt>()
    const events: string[] = []
    const clearAttestationCorrelation = vi.fn(async () => {
      events.push("correlation-cleared")
    })
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      storage: null as object | null,
      outboxStore: {
        setAttestationCorrelation: vi.fn(async () => {}),
        clearAttestationCorrelation,
        getAttestationCorrelations: vi.fn(async () => []),
      },
      deliveryMessageIds,
      inFlightDeliveryMessageIds: new Set<string>(),
      pendingDeliveryReceipts,
      setDeliveryStatus: vi.fn(async (_attestationId: string, status: string) => {
        if (!fake.storage) return false
        events.push(`status-persisted:${status}`)
        return true
      }),
    })

    await (WotConnector.prototype as any).applyTransportDeliveryReceipt.call(
      fake,
      terminalReceipt,
    )

    expect(events).toEqual([])
    expect(deliveryMessageIds.get(terminalReceipt.messageId)).toBe(attestation.id)
    expect(pendingDeliveryReceipts.get(terminalReceipt.messageId)).toBe(terminalReceipt)
    expect(clearAttestationCorrelation).not.toHaveBeenCalled()

    fake.storage = {}
    await (WotConnector.prototype as any).retryPendingDeliveryReceipts.call(fake)

    expect(events).toEqual(["status-persisted:delivered", "correlation-cleared"])
    expect(deliveryMessageIds.has(terminalReceipt.messageId)).toBe(false)
    expect(pendingDeliveryReceipts.has(terminalReceipt.messageId)).toBe(false)
  })
})
