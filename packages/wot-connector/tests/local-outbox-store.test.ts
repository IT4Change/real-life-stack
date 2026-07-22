import { IDBFactory } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { WireMessage } from "@real-life/wot-core/ports"

import { LocalOutboxStore } from "../src/local-outbox-store.js"

const message = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "inbox/1.0",
} as unknown as WireMessage

describe("LocalOutboxStore attestation correlation", () => {
  afterEach(() => vi.useRealTimers())

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

  it("does not reopen its IndexedDB connection after close", async () => {
    const store = new LocalOutboxStore("outbox-close-is-terminal")
    await store.open()
    await store.close()

    await expect(store.getPending()).rejects.toThrow("LocalOutboxStore is closed")
  })

  it("resolves close only after an operation already using the connection settles", async () => {
    const store = new LocalOutboxStore("outbox-close-waits-for-operation")
    await store.open()
    let release!: () => void
    ;(store as any).getAll = () => new Promise((resolve) => { release = () => resolve([]) })

    const pendingRead = store.getPending()
    const closing = store.close()
    let closeSettled = false
    void closing.then(() => { closeSettled = true })
    await Promise.resolve()
    expect(closeSettled).toBe(false)

    release()
    await pendingRead
    await closing
    expect(closeSettled).toBe(true)
  })

  it("bounds a never-settling operation, closes anyway, and remains terminal", async () => {
    const store = new LocalOutboxStore("outbox-close-times-out")
    await store.open()
    vi.useFakeTimers()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    ;(store as any).getAll = () => new Promise(() => {})

    void store.getPending()
    const closing = store.close()
    let closeSettled = false
    void closing.then(() => { closeSettled = true })

    await vi.advanceTimersByTimeAsync(2_000)
    expect(closeSettled).toBe(true)
    await closing
    expect(warn).toHaveBeenCalledWith(
      "[LocalOutboxStore] close timed out waiting for active operations — closing anyway: outbox",
    )
    await expect(store.getPending()).rejects.toThrow("LocalOutboxStore is closed")
  })
})
