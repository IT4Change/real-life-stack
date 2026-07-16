import { IDBFactory } from "fake-indexeddb"
import { beforeEach, describe, expect, it } from "vitest"
import type { WireMessage } from "@real-life/wot-core/ports"

import { LocalOutboxStore } from "../src/local-outbox-store.js"

const message = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "inbox/1.0",
} as unknown as WireMessage

describe("LocalOutboxStore attestation correlation", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: new IDBFactory(),
      writable: true,
    })
  })

  it("restores the durable message-to-attestation correlation after reload", async () => {
    const dbName = "outbox-reload-correlation"
    const firstStore = new LocalOutboxStore(dbName)
    await firstStore.open()
    await firstStore.setAttestationCorrelation(message.id, "urn:uuid:attestation-1")
    await firstStore.enqueue(message)
    await firstStore.close()

    const reloadedStore = new LocalOutboxStore(dbName)
    await reloadedStore.open()

    await expect(reloadedStore.getAttestationCorrelations()).resolves.toEqual([{
      messageId: message.id,
      attestationId: "urn:uuid:attestation-1",
    }])
    await expect(reloadedStore.getPending()).resolves.toHaveLength(1)

    await reloadedStore.close()
  })
})
