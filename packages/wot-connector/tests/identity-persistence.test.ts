import { afterEach, describe, expect, it, vi } from "vitest"

import { deleteIndexedDatabase } from "../src/identity-persistence.js"

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
})
