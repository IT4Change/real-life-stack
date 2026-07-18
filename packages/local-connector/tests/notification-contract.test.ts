import { beforeEach, describe, expect, it, vi } from "vitest"

const idb = vi.hoisted(() => {
  let state: unknown
  const clone = <T>(value: T): T => value === undefined ? value : structuredClone(value)
  return {
    reset: () => { state = undefined },
    get: vi.fn(async () => clone(state)), set: vi.fn(async (_key: string, value: unknown) => { state = clone(value) }),
    update: vi.fn(async (_key: string, updater: (value: unknown) => unknown) => { state = clone(updater(clone(state))) }), del: vi.fn(async () => { state = undefined }),
  }
})
vi.mock("idb-keyval", () => ({ get: idb.get, set: idb.set, update: idb.update, del: idb.del, createStore: vi.fn().mockReturnValue({}) }))
vi.stubGlobal("BroadcastChannel", class { onmessage: ((event: MessageEvent) => void) | null = null; postMessage() {} close() {} })

import { LocalConnector } from "../src/local-connector.js"

const seed = { items: [], groups: [{ id: "alpha", name: "Alpha" }, { id: "beta", name: "Beta" }], users: [{ id: "alice" }], groupMembers: { alpha: ["alice"], beta: ["alice"] }, groupItems: { alpha: [], beta: [] } }

describe("Notification contracts — LocalConnector", () => {
  beforeEach(() => { idb.reset() })

  it("A-T1/T2: scoped activity is an all-space union despite an active workspace", async () => {
    const connector = new LocalConnector(seed); await connector.init()
    connector.setCurrentGroup("alpha"); await connector.createItem({ id: "same", type: "task", createdBy: "x", data: {} })
    connector.setCurrentGroup("beta"); await connector.createItem({ id: "other", type: "task", createdBy: "x", data: {} })
    expect((await connector.getScopedActivity()).map((value) => value.groupId).sort()).toEqual(["alpha", "beta"])
  })

  it("A-T3: persists notification state additively without reseeding", async () => {
    const first = new LocalConnector(seed); await first.init()
    await first.updateNotificationState({ op: "mute", groupId: "alpha" })
    await first.updateNotificationState({ op: "markRead", keys: { [JSON.stringify(["alpha", "entry"])]: "2026-07-18T10:00:00.000Z" } })
    const second = new LocalConnector(seed); await second.init()
    expect(await second.getNotificationState()).toMatchObject({ mutedGroupIds: { alpha: true }, readEntryKeys: { [JSON.stringify(["alpha", "entry"])]: "2026-07-18T10:00:00.000Z" } })
  })

  it("A-T4: prunes read exceptions in (entry.ts, key) order and advances the frontier to the oldest REMAINING ts", async () => {
    const connector = new LocalConnector(seed); await connector.init()
    // Strictly unique, ascending timestamps — a tie would mask off-by-one
    // frontier semantics (removed vs. oldest remaining).
    const keys = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [JSON.stringify(["alpha", String(index).padStart(3, "0")]), `2026-07-18T10:00:00.${String(index).padStart(3, "0")}Z`]))
    await connector.updateNotificationState({ op: "markRead", keys })
    const state = await connector.getNotificationState()
    expect(Object.keys(state.readEntryKeys)).toHaveLength(500)
    const pruned = JSON.stringify(["alpha", "000"])
    const oldestRemaining = JSON.stringify(["alpha", "001"])
    expect(state.readEntryKeys[pruned]).toBeUndefined()
    // Normative: frontier = entry.ts of the oldest REMAINING key …
    expect(state.readUpToTs).toBe(keys[oldestRemaining])
    // … which covers every pruned key: nothing pruned can turn unread again.
    expect(keys[pruned]! <= state.readUpToTs!).toBe(true)
  })
})
