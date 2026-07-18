import { describe, expect, it, vi } from "vitest"
import { createObservable } from "@real-life-stack/data-interface"
import { WotConnector } from "../src/wot-connector.js"
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
})
