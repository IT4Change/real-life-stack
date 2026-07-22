import { afterEach, describe, expect, it, vi } from "vitest"

import { deleteIndexedDatabase, wipeIdentityPersistence } from "../src/identity-persistence.js"

describe("identity persistence wipe", () => {
  afterEach(() => vi.useRealTimers())

  it("terminates a delete that neither succeeds nor reports blocked", async () => {
    vi.useFakeTimers()
    const request = {} as IDBOpenDBRequest
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: { deleteDatabase: vi.fn(() => request) },
    })

    const deletion = deleteIndexedDatabase("wot-outbox:did:key:stuck")
    const timeout = expect(deletion).rejects.toThrow(
      "delete timed out — connection still open: wot-outbox:did:key:stuck",
    )
    await vi.advanceTimersByTimeAsync(5_000)

    await timeout
  })

  it("runs the legacy sweep even when a DID delete fails", async () => {
    // Privacy-Vertrag: ein fehlgeschlagenes DID-Delete darf die neun Legacy-
    // Datenbanken NIE ueberspringen (nur eine echte Cancellation stoppt).
    const deleted: string[] = []
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {
        deleteDatabase: vi.fn((name: string) => {
          const request = {} as IDBOpenDBRequest & { onsuccess?: () => void; onerror?: () => void; error?: Error }
          queueMicrotask(() => {
            if (name.startsWith("wot-outbox:")) {
              request.error = new Error("simulated delete failure")
              request.onerror?.()
            } else {
              deleted.push(name)
              request.onsuccess?.()
            }
          })
          return request
        }),
      },
    })

    await expect(wipeIdentityPersistence("did:key:legacy-sweep")).rejects.toThrow("nicht gelöscht")
    const legacyDeleted = deleted.filter((name) => !name.includes("did:key:legacy-sweep"))
    expect(legacyDeleted.length).toBeGreaterThan(0) // Legacy-Sweep lief trotz DID-Fehler
  })

  it("stops an abandoned wipe before it can delete databases from a newer session", async () => {
    let cancelled = false
    const requests: Array<{ onsuccess?: () => void }> = []
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {
        deleteDatabase: vi.fn(() => {
          const request: { onsuccess?: () => void } = {}
          requests.push(request)
          return request
        }),
      },
    })

    const wipe = wipeIdentityPersistence("did:key:relogin", {
      isCancelled: () => cancelled,
    })
    await vi.waitFor(() => expect(requests).toHaveLength(1))

    // Re-login invalidates the generation while the old delete is still pending.
    cancelled = true
    requests[0].onsuccess?.()

    await expect(wipe).rejects.toMatchObject({
      failures: [expect.objectContaining({ message: "wipe cancelled by newer session" })],
    })
    expect((indexedDB.deleteDatabase as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })
})
