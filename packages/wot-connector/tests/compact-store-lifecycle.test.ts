import { describe, expect, it, vi } from "vitest"
import { TracedCompactStorageManager } from "@real-life/wot-core"

describe("TracedCompactStorageManager lifecycle", () => {
  it("forwards close to the underlying IndexedDB manager", () => {
    const inner = { close: vi.fn() }
    const traced = new TracedCompactStorageManager(inner as any)

    traced.close()

    expect(inner.close).toHaveBeenCalledOnce()
  })
})
