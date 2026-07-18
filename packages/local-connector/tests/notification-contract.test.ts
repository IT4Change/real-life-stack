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
    // A delayed replay older than the retained frontier must not move either
    // the entry timestamp or the effective read frontier backwards.
    await connector.updateNotificationState({ op: "markRead", keys: { [oldestRemaining]: "2026-07-18T09:00:00.000Z" } })
    const afterLateReplay = await connector.getNotificationState()
    expect(afterLateReplay.readUpToTs).toBe(state.readUpToTs)
    expect(afterLateReplay.readEntryKeys[oldestRemaining]).toBe(keys[oldestRemaining])
    expect(keys[pruned]! <= afterLateReplay.readUpToTs!).toBe(true)
  })

  it("A-T1/T6: keeps personal live reaction parents and excludes activity for deleted groups", async () => {
    const connector = new LocalConnector(seed); await connector.init()
    connector.setCurrentGroup(null)
    const parent = await connector.createItem({ id: "personal-parent", type: "task", createdBy: "alice", data: { title: "Private" } })
    const reaction = await connector.createItem({ id: "personal-reaction", type: "reaction", createdBy: "alice", data: {}, relations: [{ predicate: "reactsTo", target: `item:${parent.id}` }] })
    expect((await connector.getScopedActivity()).find((entry) => entry.entry.targetId === reaction.id)?.subject).toMatchObject({ id: parent.id })
    connector.setCurrentGroup("alpha")
    await connector.createItem({ id: "deleted-group-item", type: "task", createdBy: "alice", data: {} })
    await connector.deleteGroup("alpha")
    expect((await connector.getScopedActivity()).some((entry) => entry.groupId === "alpha")).toBe(false)
  })

  it("A-T3: clear() resets another tab's items, activity, and notification projections", async () => {
    const first = new LocalConnector(seed); await first.init()
    const second = new LocalConnector(seed); await second.init()
    await first.createItem({ id: "before-reset", type: "task", createdBy: "alice", data: {} })
    await first.updateNotificationState({ op: "mute", groupId: "alpha" })
    const items = second.observe({}); const activity = second.observeActivity(); const notification = second.observeNotificationState()
    await (second as any).handleBroadcast({ type: "full-sync", senderId: "first" })
    expect(activity.current).not.toEqual([])
    await first.clear()
    await (second as any).handleBroadcast({ type: "full-sync", senderId: "first" })
    expect(items.current).toEqual([])
    expect(activity.current).toEqual([])
    expect(notification.current).toEqual({ readEntryKeys: {}, mutedGroupIds: {} })
  })
})
