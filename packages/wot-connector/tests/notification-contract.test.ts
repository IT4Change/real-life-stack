import { describe, expect, it, vi } from "vitest"
import { createObservable } from "@real-life-stack/data-interface"
import { WotConnector } from "../src/wot-connector.js"
import { CrossGroupIndex } from "../src/CrossGroupIndex.js"
import { serializeItem } from "../src/serialization.js"
import type { RlsSpaceDoc } from "../src/types.js"
import * as Y from "yjs"

const personalDoc: any = {}
vi.mock("@real-life/adapter-yjs", () => ({
  getYjsPersonalDoc: () => personalDoc,
  changeYjsPersonalDoc: (fn: (doc: any) => void) => fn(personalDoc),
  onYjsPersonalDocChange: () => () => {},
}))

function connector(): any {
  const value = Object.create(WotConnector.prototype)
  value.handleReady = Promise.resolve(); value.docLogStore = { resolveConnectDeviceId: vi.fn(async () => "device-a") }
  value.currentUserObs = createObservable({ id: "did:alice" }); value.notificationStateObs = createObservable({ readEntryKeys: {}, mutedGroupIds: {} })
  value.scopedActivityObservables = new Map(); value.activityObservables = new Map(); value.activityDirty = false
  value.scopedActivityRefreshGeneration = new Map(); value.crossGroupIndex = { getGroupDocuments: () => [] }
  value.currentHandle = null; value.currentGroupId = null
  value.privateSpaceId = "private"; value.getUser = vi.fn(async (id: string) => ({ id, displayName: id }))
  return value
}

function item(id: string, type: string, createdBy: string, data: Record<string, unknown> = {}) {
  return serializeItem({ id, type, createdBy, createdAt: "2026-07-18T10:00:00.000Z", data })
}
function doc(id: string, actor: string, itemType = "task"): RlsSpaceDoc {
  return { _type: "rls", metadata: { name: id, modules: [] }, items: { same: item("same", itemType, actor, { start: "2026-07-18", position: { coordinates: [] } }) }, activity: { [id]: { id, ts: `2026-07-18T10:00:0${id === "b" ? "2" : "1"}.000Z`, actor, action: "create", targetId: "same", targetType: itemType } } }
}
function handle(id: string, value: RlsSpaceDoc, members: string[]) {
  const remote = new Set<() => void>()
  return { getDoc: () => value, info: () => ({ id, type: id === "private" ? "personal" : "shared", members }), onRemoteUpdate: (cb: () => void) => { remote.add(cb); return () => remote.delete(cb) }, close: vi.fn(), remote }
}

describe("Notification contracts — WotConnector", () => {
  it("re-login keeps previously handed-out observables live (stable contract)", async () => {
    const c = connector()
    personalDoc.notificationState = { lastSeenByDevice: {}, readUpToByDevice: {}, readEntryKeys: {}, mutedGroupIds: { before: true } }
    const stateObs = c.observeNotificationState()
    const scopedObs = c.observeScopedActivity()
    // logout path (identity-scoped reset — real production snippet drives it)
    c.activityDirty = false
    for (const observable of c.scopedActivityObservables.values()) observable.set([])
    c.notificationStateUnsub?.(); c.notificationStateUnsub = null
    c.notificationStateObs.set({ readEntryKeys: {}, mutedGroupIds: {} })
    expect(stateObs.current.mutedGroupIds).toEqual({})
    // re-login: bootstrap rebinds because the state was observed before
    personalDoc.notificationState = { lastSeenByDevice: {}, readUpToByDevice: {}, readEntryKeys: {}, mutedGroupIds: { after: true } }
    if (c.notificationStateObserved && !c.notificationStateUnsub) {
      c.notificationStateObs.set(c.readNotificationState())
    }
    expect(stateObs.current.mutedGroupIds).toEqual({ after: true })
    // the scoped observable handed out before is still the registered instance
    expect(c.observeScopedActivity()).toBe(scopedObs)
  })

  it("A-T3 guard: patch ops never reassign whole records (only addressed keys)", async () => {
    const c = connector()
    const topLevelSets: string[] = []
    const inner: any = { lastSeenByDevice: {}, readUpToByDevice: {}, readEntryKeys: { keep: "2026-07-18T10:00:00.000Z" }, mutedGroupIds: {} }
    personalDoc.notificationState = new Proxy(inner, {
      set(target, prop, value) {
        if (typeof prop === "string") topLevelSets.push(prop)
        return Reflect.set(target, prop, value)
      },
    })
    await c.updateNotificationState({ op: "markSeen", ts: "2026-07-18T12:00:00.000Z" })
    await c.updateNotificationState({ op: "markRead", keys: { added: "2026-07-18T11:00:00.000Z" } })
    await c.updateNotificationState({ op: "mute", groupId: "alpha" })
    // On the 0.1.4 proxy a record reassignment means delete-all + rewrite —
    // patch ops must mutate nested keys only.
    expect(topLevelSets).toEqual([])
    expect(inner.lastSeenByDevice["device-a"]).toBe("2026-07-18T12:00:00.000Z")
    expect(inner.readEntryKeys).toMatchObject({ keep: "2026-07-18T10:00:00.000Z", added: "2026-07-18T11:00:00.000Z" })
    expect(inner.mutedGroupIds.alpha).toBe(true)
    personalDoc.notificationState = undefined
  })

  it("A-T3/T4: writes only addressed shared-map keys and moves the frontier only when pruning", async () => {
    const c = connector(); personalDoc.notificationState = { lastSeenByDevice: {}, readUpToByDevice: {}, readEntryKeys: { keep: "2026-07-18T10:00:00.000Z" }, mutedGroupIds: {} }
    await c.updateNotificationState({ op: "markRead", keys: { added: "2026-07-18T11:00:00.000Z" } })
    await c.updateNotificationState({ op: "markRead", keys: { added: "2026-07-18T09:00:00.000Z" } })
    expect(personalDoc.notificationState.readEntryKeys).toMatchObject({ keep: "2026-07-18T10:00:00.000Z", added: "2026-07-18T11:00:00.000Z" })
    expect((await c.getNotificationState()).readUpToTs).toBeUndefined()
    const keys = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`k-${String(i).padStart(3, "0")}`, `2026-07-18T12:00:${String(i % 60).padStart(2, "0")}.000Z`]))
    await c.updateNotificationState({ op: "markRead", keys })
    const state = await c.getNotificationState()
    expect(Object.keys(state.readEntryKeys)).toHaveLength(500)
    expect(state.readUpToTs).toBeDefined()
  })

  it("A-T6: ignores an older scoped refresh that resolves after a newer one", async () => {
    const c = connector()
    const pending: Array<(entries: any[]) => void> = []
    c.getScopedActivity = vi.fn(() => new Promise<any[]>((resolve) => pending.push(resolve)))
    const observable = createObservable<any[]>([])
    c.scopedActivityObservables.set("", observable)
    c.scopedActivityRefreshGeneration = new Map()
    c.refreshScopedActivity("", observable, undefined)
    c.refreshScopedActivity("", observable, undefined)
    pending[1]!([{ entry: { id: "new" } }])
    await Promise.resolve()
    pending[0]!([{ entry: { id: "old" } }])
    await Promise.resolve()
    expect(observable.current).toEqual([{ entry: { id: "new" } }])
  })

  it("A-T1/T2/T6: drives CrossGroupIndex's real group-doc getter, retaining private docs and distinct same IDs", async () => {
    const sharedA = handle("alpha", doc("a", "did:alice"), ["did:alice"])
    const sharedB = handle("beta", doc("b", "did:bob", "event"), ["did:bob"])
    const privateHandle = handle("private", doc("p", "did:alice"), ["did:alice"])
    const handles = new Map([["alpha", sharedA], ["beta", sharedB], ["private", privateHandle]])
    const spaces = [{ id: "alpha", type: "shared" }, { id: "beta", type: "shared" }, { id: "private", type: "personal" }]
    const replication = { watchSpaces: () => ({ getValue: () => spaces, subscribe: () => () => {} }), openSpace: async (id: string) => handles.get(id)! }
    const index = new CrossGroupIndex<RlsSpaceDoc, any>(replication as any, d => new Map(Object.entries(d.items ?? {})), value => value.type, { groupFilter: () => true })
    index.start(); await vi.waitFor(() => expect(index.getGroupDocuments()).toHaveLength(3))
    const c = connector(); c.currentGroupId = "alpha"; c.crossGroupIndex = index
    const entries = await c.getScopedActivity()
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ groupId: "alpha", actor: expect.objectContaining({ id: "did:alice" }), subject: expect.objectContaining({ moduleHints: { hasPosition: true, hasStart: true, hasStatus: true, hasStatement: false } }) }),
      expect.objectContaining({ groupId: "beta", actor: expect.objectContaining({ id: "did:bob" }) }),
      expect.objectContaining({ groupId: "private", isPersonal: true }),
    ]))
    expect(new Set(entries.map((entry: any) => JSON.stringify([entry.groupId, entry.entry.targetId]))).size).toBe(3)
    index.stop()
  })

  it("A-T3: independently encoded PersonalDoc map updates converge in either merge order", () => {
    const make = () => new Y.Doc()
    const write = (doc: Y.Doc, device: string, ts: string) => {
      const state = doc.getMap("notificationState")
      let slots = state.get("lastSeenByDevice") as Y.Map<string> | undefined
      if (!slots) { slots = new Y.Map(); state.set("lastSeenByDevice", slots) }
      slots.set(device, ts)
    }
    const seed = make(); write(seed, "seed", "2026-07-18T10:00:00.000Z")
    const a = make(), b = make(); const base = Y.encodeStateAsUpdate(seed); Y.applyUpdate(a, base); Y.applyUpdate(b, base)
    write(a, "device-a", "2026-07-18T12:00:00.000Z"); write(b, "device-b", "2026-07-18T11:00:00.000Z")
    const updateA = Y.encodeStateAsUpdate(a), updateB = Y.encodeStateAsUpdate(b)
    Y.applyUpdate(a, updateB); Y.applyUpdate(b, updateA)
    const slotsA = a.getMap("notificationState").get("lastSeenByDevice") as Y.Map<string>
    const slotsB = b.getMap("notificationState").get("lastSeenByDevice") as Y.Map<string>
    expect(Object.fromEntries(slotsA.entries())).toEqual({ seed: "2026-07-18T10:00:00.000Z", "device-a": "2026-07-18T12:00:00.000Z", "device-b": "2026-07-18T11:00:00.000Z" })
    expect(Object.fromEntries(slotsB.entries())).toEqual(Object.fromEntries(slotsA.entries()))
  })
})
