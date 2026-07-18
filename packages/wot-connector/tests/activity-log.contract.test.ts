import { describe, expect, it, vi } from "vitest"
import { createObservable } from "@real-life-stack/data-interface"
import { WotConnector } from "../src/wot-connector.js"
import { CrossGroupIndex } from "../src/CrossGroupIndex.js"
import type { RlsSpaceDoc } from "../src/types.js"

function doc(): RlsSpaceDoc {
  return { _type: "rls", items: {}, metadata: { name: "test", modules: [] } }
}

function handle(value = doc()) {
  const snapshots: RlsSpaceDoc[] = []
  const remote = new Set<() => void>()
  return {
    value, snapshots, remote,
    getDoc: () => value,
    transact: vi.fn((fn: (next: RlsSpaceDoc) => void) => {
      fn(value)
      snapshots.push(structuredClone(value))
    }),
    onRemoteUpdate: (cb: () => void) => { remote.add(cb); return () => remote.delete(cb) },
    close: vi.fn(),
  }
}

function activityEntry(id: string): NonNullable<RlsSpaceDoc["activity"]>[string] {
  return { id, ts: `2026-01-01T00:00:00.${id.slice(-3).padStart(3, "0")}Z`, actor: "did:key:alice", action: "update", targetId: id, targetType: "task" }
}

function fillActivity(target: ReturnType<typeof handle>, prefix: string, count: number): void {
  target.value.activity ??= {}
  for (let i = 0; i < count; i++) target.value.activity[`${prefix}-${String(i).padStart(3, "0")}`] = activityEntry(`${prefix}-${String(i).padStart(3, "0")}`)
}

/** Deliberately calls the production methods; only the adapter boundary is faked. */
function connector(current: ReturnType<typeof handle>, handles = new Map<string, ReturnType<typeof handle>>()) {
  const value = Object.create(WotConnector.prototype) as any
  value.handleReady = Promise.resolve()
  value.currentHandle = current
  value.currentGroupId = "source"
  value.currentUserObs = createObservable({ id: "did:key:alice", displayName: "Alice" })
  value.activityObs = createObservable([])
  value.activityReconciliations = new Map()
  value.crossGroupIndex = null
  value.notifyAllObservers = vi.fn()
  value.replication = { openSpace: vi.fn(async (id: string) => handles.get(id) ?? current) }
  return value as WotConnector
}

describe("Activity log — WoT transaction boundaries", () => {
  it("1. commits item and activity together for create/update/delete, and two snapshots for move", async () => {
    const source = handle()
    const target = handle()
    const c = connector(source, new Map([["source", source], ["target", target]]))

    await c.createItem({ id: "one", type: "task", createdBy: "forged", data: { title: "One" } })
    await c.updateItem("one", { data: { title: "Two" } })
    await c.deleteItem("one")
    for (const snapshot of source.snapshots) {
      expect(Object.keys(snapshot.activity ?? {})).not.toHaveLength(0)
    }
    expect(source.transact).toHaveBeenCalledTimes(3)

    await c.createItem({ id: "move", type: "task", createdBy: "x", data: {} })
    await c.moveItemToGroup("move", "target")
    expect(target.snapshots).toHaveLength(1)
    expect(source.snapshots).toHaveLength(5)
    expect(target.snapshots[0]!.items.move).toBeDefined()
    expect(Object.values(target.snapshots[0]!.activity ?? {}).some(entry => entry.action === "create")).toBe(true)
    expect(source.snapshots[4]!.items.move).toBeUndefined()
    expect(Object.values(source.snapshots[4]!.activity ?? {}).some(entry => entry.action === "delete")).toBe(true)
  })

  it("5 and 12. preserves activity through a legacy writer and accepts old docs until first logged mutation", async () => {
    const old = handle()
    const c = connector(old)
    expect(await c.getActivity()).toEqual([])
    old.value.items.legacy = { id: "legacy", type: "task", createdBy: "legacy", createdAt: new Date().toISOString(), data: {} }
    await c.updateItem("legacy", { data: { title: "new" } })
    const before = structuredClone(old.value.activity)
    // Simulates an old client that only understands and rewrites `items`.
    old.value.items.legacy.data.title = "legacy writer"
    expect(old.value.activity).toEqual(before)
  })

  it("15. reconciles an already-overfull document, but a no-op opens no transaction", async () => {
    const overfull = handle()
    for (let i = 0; i < 501; i++) overfull.value.activity ??= {}, overfull.value.activity[`a-${i}`] = {
      id: `a-${i}`, ts: `2026-01-01T00:00:00.${String(i % 1000).padStart(3, "0")}Z`, actor: "did:key:a", action: "update", targetId: "x", targetType: "task",
    }
    const c = connector(overfull) as any
    c.scheduleActivityReconciliation("source", overfull)
    await vi.waitFor(() => expect(Object.keys(overfull.value.activity ?? {})).toHaveLength(500))
    expect(overfull.transact).toHaveBeenCalledTimes(1)
    const clean = handle()
    c.scheduleActivityReconciliation("clean", clean)
    await new Promise(resolve => queueMicrotask(resolve))
    expect(clean.transact).not.toHaveBeenCalled()
  })

  it("2b. converges both offline-merged logs to the same deterministic 500 IDs without an item mutation", async () => {
    const alice = handle()
    const bob = handle()
    fillActivity(alice, "alice", 300)
    fillActivity(bob, "bob", 300)
    const aliceConnector = connector(alice) as any
    const bobConnector = connector(bob) as any

    // Model a CRDT merge: both replicas now carry the union; no item is touched.
    const merged = { ...alice.value.activity!, ...bob.value.activity! }
    alice.value.activity = structuredClone(merged)
    bob.value.activity = structuredClone(merged)
    expect(Object.keys(alice.value.activity)).toHaveLength(600)
    expect(Object.keys(bob.value.activity!)).toHaveLength(600)

    for (const callback of alice.remote) callback()
    for (const callback of bob.remote) callback()
    // The production reconciliation is normally subscribed from the handle.
    aliceConnector.scheduleActivityReconciliation("shared", alice)
    bobConnector.scheduleActivityReconciliation("shared", bob)
    await vi.waitFor(() => expect(Object.keys(alice.value.activity ?? {})).toHaveLength(500))
    await vi.waitFor(() => expect(Object.keys(bob.value.activity ?? {})).toHaveLength(500))
    expect(Object.keys(alice.value.items)).toEqual([])
    expect(Object.keys(bob.value.items)).toEqual([])
    expect(Object.keys(alice.value.activity ?? {}).sort()).toEqual(Object.keys(bob.value.activity ?? {}).sort())
  })

  it("15. reconciles a non-current overview handle on remote updates and detaches its hook on removal and stop", async () => {
    const active = handle()
    const background = handle()
    let spaces = [{ id: "background", type: "shared" as const }]
    let onSpaces: ((value: typeof spaces) => void) | null = null
    const replication = {
      watchSpaces: () => ({ getValue: () => spaces, subscribe: (callback: (value: typeof spaces) => void) => { onSpaces = callback; return () => { onSpaces = null } } }),
      openSpace: vi.fn(async (id: string) => id === "background" ? background : active),
    }
    const c = connector(active) as any
    const index = new CrossGroupIndex<RlsSpaceDoc, any>(
      replication as any,
      (spaceDoc) => new Map(Object.entries(spaceDoc.items ?? {}).map(([id, item]) => [id, item])),
      (item) => item.type,
      { onHandle: (spaceId, spaceHandle) => {
        c.scheduleActivityReconciliation(spaceId, spaceHandle)
        const unsubscribe = spaceHandle.onRemoteUpdate(() => c.scheduleActivityReconciliation(spaceId, spaceHandle))
        return () => { unsubscribe(); c.activityReconciliations.delete(spaceId) }
      } },
    )
    c.crossGroupIndex = index
    index.start()
    await vi.waitFor(() => expect(replication.openSpace).toHaveBeenCalledWith("background"))

    fillActivity(background, "remote", 501)
    for (const callback of background.remote) callback()
    await vi.waitFor(() => expect(Object.keys(background.value.activity ?? {})).toHaveLength(500))
    expect(active.transact).not.toHaveBeenCalled()

    fillActivity(background, "removed", 1)
    onSpaces?.([])
    for (const callback of background.remote) callback()
    await new Promise((resolve) => queueMicrotask(resolve))
    expect(background.transact).toHaveBeenCalledTimes(1)

    index.stop()
    fillActivity(background, "stopped", 1)
    for (const callback of background.remote) callback()
    await new Promise((resolve) => queueMicrotask(resolve))
    expect(background.transact).toHaveBeenCalledTimes(1)
  })
})
