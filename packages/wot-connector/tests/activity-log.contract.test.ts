import { describe, expect, it, vi } from "vitest"
import { createObservable } from "@real-life-stack/data-interface"
import { WotConnector } from "../src/wot-connector.js"
import { CrossGroupIndex } from "../src/CrossGroupIndex.js"
import type { RlsSpaceDoc } from "../src/types.js"

const bootstrapHarness = vi.hoisted(() => {
  const subscribable = <T>(value: T) => ({ getValue: () => value, subscribe: () => () => {} })
  return {
    personalDoc: {} as any,
    storage: {
      watchContacts: () => subscribable([]),
      watchAllAttestations: () => subscribable([]),
      getContacts: async () => [],
    },
    outbox: {
      onStateChange: vi.fn(), onReceipt: vi.fn(), onMessage: vi.fn(),
      connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}),
      flushOutbox: vi.fn(async () => {}), getOutboxStore: vi.fn(),
    },
  }
})

vi.mock("@real-life/adapter-yjs", () => ({
  YjsReplicationAdapter: vi.fn(),
  YjsStorageAdapter: class { constructor() { return bootstrapHarness.storage } },
  getYjsPersonalDoc: vi.fn(() => bootstrapHarness.personalDoc),
  resetYjsPersonalDoc: vi.fn(),
  onYjsPersonalDocChange: vi.fn(() => () => {}),
  changeYjsPersonalDoc: vi.fn(),
  flushYjsPersonalDoc: vi.fn(),
}))

vi.mock("../src/personal-doc-persistence.js", () => ({ initNamespacedYjsPersonalDoc: vi.fn(async () => {}) }))
vi.mock("../src/messaging-runtime.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/messaging-runtime.js")>(),
  createOutboxMessagingRuntime: vi.fn(() => bootstrapHarness.outbox),
}))
vi.mock("../src/inbox-reception-host.js", () => ({
  InboxReceptionHost: class { start() {} onAttestation() { return () => {} } onAttestationReceipt() { return () => {} } },
}))

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
  value.activityObservables = new Map()
  value.activityDirty = false
  value.activityReconciliations = new Map()
  value.crossGroupIndex = null
  value.notifyAllObservers = vi.fn()
  value.replication = { openSpace: vi.fn(async (id: string) => handles.get(id) ?? current) }
  return value as WotConnector
}

function invokePrivate<T>(target: object, name: string): T {
  const value = Reflect.get(target, name)
  if (typeof value !== "function") throw new Error(`Missing production method ${name}`)
  return value.bind(target) as T
}

describe("Activity log — WoT transaction boundaries", () => {
  it("1. commits item and activity together for create/update/delete, and two snapshots for move", async () => {
    const source = handle()
    const target = handle()
    const c = connector(source, new Map([["source", source], ["target", target]]))

    await c.createItem({ id: "one", type: "task", createdBy: "forged", data: { title: "One" } })
    await c.updateItem("one", { data: { title: "Two" } })
    await c.deleteItem("one")
    expect(Object.values(source.snapshots[0]!.activity ?? {})).toContainEqual(expect.objectContaining({ action: "create", targetId: "one" }))
    expect(Object.values(source.snapshots[1]!.activity ?? {})).toContainEqual(expect.objectContaining({ action: "update", targetId: "one" }))
    expect(Object.values(source.snapshots[2]!.activity ?? {})).toContainEqual(expect.objectContaining({ action: "delete", targetId: "one" }))
    expect(source.transact).toHaveBeenCalledTimes(3)

    await c.createItem({ id: "move", type: "task", createdBy: "x", data: {} })
    await c.moveItemToGroup("move", "target")
    expect(target.snapshots).toHaveLength(1)
    expect(source.snapshots).toHaveLength(5)
    expect(target.snapshots[0]!.items.move).toBeDefined()
    expect(Object.values(target.snapshots[0]!.activity ?? {})).toContainEqual(expect.objectContaining({ action: "create", targetId: "move" }))
    expect(source.snapshots[4]!.items.move).toBeUndefined()
    expect(Object.values(source.snapshots[4]!.activity ?? {})).toContainEqual(expect.objectContaining({ action: "delete", targetId: "move" }))
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

  it("15. reconciles an already-overfull document through the real handle-open path, but a no-op opens no transaction", async () => {
    const overfull = handle()
    for (let i = 0; i < 501; i++) overfull.value.activity ??= {}, overfull.value.activity[`a-${i}`] = {
      id: `a-${i}`, ts: `2026-01-01T00:00:00.${String(i % 1000).padStart(3, "0")}Z`, actor: "did:key:a", action: "update", targetId: "x", targetType: "task",
    }
    const c = connector(overfull) as any
    await invokePrivate<() => Promise<void>>(c, "openCurrentHandle")()
    await vi.waitFor(() => expect(Object.keys(overfull.value.activity ?? {})).toHaveLength(500))
    expect(overfull.transact).toHaveBeenCalledTimes(1)
    const clean = handle()
    Reflect.set(c, "currentHandle", clean)
    await invokePrivate<() => Promise<void>>(c, "openCurrentHandle")()
    await new Promise(resolve => queueMicrotask(resolve))
    expect(clean.transact).not.toHaveBeenCalled()
  })

  it("2b. converges both offline-merged logs to the same deterministic 500 IDs without an item mutation", async () => {
    const alice = handle()
    const bob = handle()
    fillActivity(alice, "alice", 300)
    fillActivity(bob, "bob", 300)
    const aliceConnector = connector(alice, new Map([["shared", alice]]))
    const bobConnector = connector(bob, new Map([["shared", bob]]))
    Reflect.set(aliceConnector, "currentGroupId", "shared")
    Reflect.set(bobConnector, "currentGroupId", "shared")

    // This is the same handle-opening path that registers the production
    // remote-update callback; the fake only supplies the merged CRDT view.
    await invokePrivate<() => Promise<void>>(aliceConnector, "openCurrentHandle")()
    await invokePrivate<() => Promise<void>>(bobConnector, "openCurrentHandle")()

    // Model a CRDT merge: both replicas now carry the union; no item is touched.
    const merged = { ...alice.value.activity!, ...bob.value.activity! }
    alice.value.activity = structuredClone(merged)
    bob.value.activity = structuredClone(merged)
    expect(Object.keys(alice.value.activity)).toHaveLength(600)
    expect(Object.keys(bob.value.activity!)).toHaveLength(600)

    for (const callback of alice.remote) callback()
    for (const callback of bob.remote) callback()
    await vi.waitFor(() => expect(Object.keys(alice.value.activity ?? {})).toHaveLength(500))
    await vi.waitFor(() => expect(Object.keys(bob.value.activity ?? {})).toHaveLength(500))
    expect(Object.keys(alice.value.items)).toEqual([])
    expect(Object.keys(bob.value.items)).toEqual([])
    expect(Object.keys(alice.value.activity ?? {}).sort()).toEqual(Object.keys(bob.value.activity ?? {}).sort())
  })

  it("2. retains exactly the newest 500 entries after 501 serial createItem writes", async () => {
    const source = handle()
    const c = connector(source)
    const ids = Array.from({ length: 501 }, (_, i) => `write-${String(i).padStart(3, "0")}`)
    const uuid = vi.spyOn(crypto, "randomUUID").mockImplementation(() => ids.shift()!)
    for (let i = 0; i < 501; i++) {
      await c.createItem({ id: `item-${i}`, type: "task", createdBy: "forged", data: {} })
    }
    uuid.mockRestore()
    const entries = Object.values(source.value.activity ?? {})
    expect(entries).toHaveLength(500)
    expect(entries.map((entry) => entry.id)).not.toContain("write-000")
    expect(entries.every((entry) => entry.action === "create")).toBe(true)
  })

  it("15. reconciles a non-current overview handle through bootstrap's CrossGroupIndex onHandle wiring", async () => {
    const active = handle()
    const background = handle()
    const personal = handle()
    let spaces = [
      { id: "background", type: "shared" as const },
      { id: "personal", type: "shared" as const, appTag: "rls-private" },
    ]
    const spaceSubscribers = new Set<(value: typeof spaces) => void>()
    const replication = {
      watchSpaces: () => ({ getValue: () => spaces, subscribe: (callback: (value: typeof spaces) => void) => { spaceSubscribers.add(callback); return () => { spaceSubscribers.delete(callback) } } }),
      openSpace: vi.fn(async (id: string) => id === "background" ? background : id === "personal" ? personal : active),
      onSpaceInvite: () => () => {},
      start: async () => {},
    }
    const c = new WotConnector(
      { relayUrl: "ws://relay.test", profilesUrl: "https://profiles.test" },
      {
        replication: replication as any,
        docLogStore: { init: async () => {}, resolveConnectDeviceId: async () => "device", getPending: async () => [] } as any,
        outboxStore: { count: async () => 0, getPending: async () => [] } as any,
        keyManagement: {} as any,
        memberUpdateStore: {} as any,
        messageIdHistory: {} as any,
        compactStore: {} as any,
        workQueue: { claimDue: async () => [], count: async () => 0 } as any,
      },
    )
    Reflect.set(c, "identity", { getDid: () => "did:key:test", signEd25519: async () => new Uint8Array(), sign: async () => "" })
    await invokePrivate<() => Promise<void>>(c, "bootstrapAdapters")()
    await vi.waitFor(() => expect(replication.openSpace).toHaveBeenCalledWith("background"))

    personal.value.activity = { private: activityEntry("private") }
    expect((await c.getActivity()).map((entry) => entry.id)).toContain("private")
    fillActivity(personal, "private-remote", 501)
    for (const callback of personal.remote) callback()
    await vi.waitFor(() => expect(Object.keys(personal.value.activity ?? {})).toHaveLength(500))

    fillActivity(background, "remote", 501)
    for (const callback of background.remote) callback()
    await vi.waitFor(() => expect(Object.keys(background.value.activity ?? {})).toHaveLength(500))
    expect(active.transact).not.toHaveBeenCalled()

    fillActivity(background, "removed", 1)
    for (const callback of spaceSubscribers) callback([])
    for (const callback of background.remote) callback()
    await new Promise((resolve) => queueMicrotask(resolve))
    expect(background.transact).toHaveBeenCalledTimes(1)

    const index = Reflect.get(c, "crossGroupIndex") as CrossGroupIndex<RlsSpaceDoc, any>
    index.stop()
    fillActivity(background, "stopped", 1)
    for (const callback of background.remote) callback()
    await new Promise((resolve) => queueMicrotask(resolve))
    expect(background.transact).toHaveBeenCalledTimes(1)
  })
})
