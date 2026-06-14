import { describe, it, expect, vi, beforeEach } from "vitest"
import { get, set } from "idb-keyval"

// Mock idb-keyval (no IndexedDB in Node). `get` is overridden per test
// to simulate an empty / current / outdated persisted store.
vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  createStore: vi.fn().mockReturnValue({}),
}))

vi.stubGlobal("BroadcastChannel", class {
  onmessage = null
  postMessage() {}
  close() {}
})

import { LocalConnector, SEED_VERSION } from "../src/local-connector.js"

const seed = {
  items: [],
  groups: [{ id: "g1", name: "Group 1" }],
  users: [{ id: "user-1", displayName: "Alice (new seed)" }],
  groupMembers: { g1: ["user-1"] },
}

function storedWith(version: number | undefined, displayName: string) {
  const state: Record<string, unknown> = {
    items: [],
    groups: [{ id: "g1", name: "Group 1" }],
    users: [{ id: "user-1", displayName }],
    groupMembers: { g1: ["user-1"] },
    groupItems: {},
    currentUserId: "user-1",
    currentGroupId: "g1",
    nextItemId: 100,
  }
  if (version !== undefined) state.seedVersion = version
  return state
}

describe("LocalConnector — seed versioning", () => {
  beforeEach(() => {
    vi.mocked(get).mockReset().mockResolvedValue(undefined)
    vi.mocked(set).mockReset().mockResolvedValue(undefined)
  })

  it("seeds and persists when no stored state exists", async () => {
    vi.mocked(get).mockResolvedValue(undefined)
    const c = new LocalConnector(seed)
    await c.init()
    expect(set).toHaveBeenCalled()
    expect((await c.getUser("user-1"))?.displayName).toBe("Alice (new seed)")
  })

  it("loads the stored state without re-seeding when the version matches", async () => {
    vi.mocked(get).mockResolvedValue(storedWith(SEED_VERSION, "Alice (stored)"))
    const c = new LocalConnector(seed)
    await c.init()
    expect(set).not.toHaveBeenCalled()
    expect((await c.getUser("user-1"))?.displayName).toBe("Alice (stored)")
  })

  it("re-seeds when the stored version is older", async () => {
    vi.mocked(get).mockResolvedValue(storedWith(SEED_VERSION - 1, "Alice (old seed)"))
    const c = new LocalConnector(seed)
    await c.init()
    expect(set).toHaveBeenCalled()
    expect((await c.getUser("user-1"))?.displayName).toBe("Alice (new seed)")
  })

  it("re-seeds a pre-versioning store (no seedVersion field)", async () => {
    vi.mocked(get).mockResolvedValue(storedWith(undefined, "Alice (legacy)"))
    const c = new LocalConnector(seed)
    await c.init()
    expect(set).toHaveBeenCalled()
    expect((await c.getUser("user-1"))?.displayName).toBe("Alice (new seed)")
  })
})
