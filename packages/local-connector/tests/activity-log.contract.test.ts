import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Item } from "@real-life-stack/data-interface"

const idb = vi.hoisted(() => {
  let state: unknown
  const clone = <T>(value: T): T => value === undefined ? value : structuredClone(value)
  return {
    reset: () => { state = undefined },
    get: vi.fn(async () => clone(state)),
    set: vi.fn(async (_key: string, value: unknown) => { state = clone(value) }),
    update: vi.fn(async (_key: string, updater: (value: unknown) => unknown) => { state = clone(updater(clone(state))) }),
    del: vi.fn(async () => { state = undefined }),
  }
})

const channels = vi.hoisted(() => new Set<any>())
vi.mock("idb-keyval", () => ({
  get: idb.get, set: idb.set, update: idb.update, del: idb.del, createStore: vi.fn().mockReturnValue({}),
}))
vi.stubGlobal("BroadcastChannel", class {
  onmessage: ((event: MessageEvent) => void) | null = null
  constructor() { channels.add(this) }
  postMessage(message: unknown) { for (const channel of channels) if (channel !== this) channel.onmessage?.({ data: structuredClone(message) } as MessageEvent) }
  close() { channels.delete(this) }
})

import { LocalConnector } from "../src/local-connector.js"

const seed = {
  items: [] as Item[],
  groups: [{ id: "alpha", name: "Alpha" }, { id: "beta", name: "Beta" }],
  users: [{ id: "user-1", displayName: "User" }],
  groupMembers: { alpha: ["user-1"], beta: ["user-1"] },
  groupItems: { alpha: [], beta: [] },
}

async function ready(): Promise<LocalConnector> {
  const connector = new LocalConnector(seed)
  await connector.init()
  return connector
}

beforeEach(() => { idb.reset(); channels.clear() })

describe("LocalConnector activity-log contract", () => {
  it("14. isolates active scopes, stores overview creates in __personal__, globally limits the union, and retains each source independently", async () => {
    const connector = await ready()
    connector.setCurrentGroup(null)
    await connector.createItem({ id: "personal", type: "task", createdBy: "forged", data: {} })
    connector.setCurrentGroup("alpha")
    expect(await connector.getActivity()).toEqual([])
    await expect(connector.updateItem("personal", { data: { title: "forbidden" } })).rejects.toThrow(/not found/i)
    await connector.createItem({ id: "alpha-item", type: "task", createdBy: "forged", data: {} })
    connector.setCurrentGroup("beta")
    await connector.createItem({ id: "beta-item", type: "task", createdBy: "forged", data: {} })
    connector.setCurrentGroup(null)
    expect(await connector.getActivity({ limit: 1 })).toHaveLength(1)
    expect(await connector.getActivity()).toHaveLength(3)

    connector.setCurrentGroup("alpha")
    for (let i = 0; i < 500; i++) await connector.createItem({ id: `a-${i}`, type: "task", createdBy: "x", data: {} })
    connector.setCurrentGroup("beta")
    for (let i = 0; i < 500; i++) await connector.createItem({ id: `b-${i}`, type: "task", createdBy: "x", data: {} })
    connector.setCurrentGroup(null)
    // personal (1) + independent 500-entry alpha and beta logs
    expect(await connector.getActivity()).toHaveLength(1001)
  })

  it("14. updates an overview activity observable when a visible space is removed", async () => {
    const connector = await ready()
    await connector.createItem({ id: "alpha-item", type: "task", createdBy: "x", data: {} })
    connector.setCurrentGroup(null)
    const observed = connector.observeActivity()
    const changes = vi.fn()
    observed.subscribe(changes)
    await connector.deleteGroup("alpha")
    expect(observed.current).toEqual([])
    expect(changes).toHaveBeenCalled()
  })

  it("16. propagates an atomic item mutation and its activity to another local tab", async () => {
    const first = await ready()
    const second = await ready()
    const items = second.observe({})
    const activity = second.observeActivity()
    await first.createItem({ id: "shared", type: "task", createdBy: "forged", data: { title: "Shared" } })
    await vi.waitFor(() => expect(items.current.map((item) => item.id)).toContain("shared"))
    await vi.waitFor(() => expect(activity.current).toEqual(expect.arrayContaining([expect.objectContaining({ action: "create", targetId: "shared" })])))
  })

  it("17. rejects logged mutations after logout without items or activity side effects (Local has no relation facade)", async () => {
    const connector = await ready()
    const item = await connector.createItem({ id: "one", type: "task", createdBy: "x", data: {} })
    const before = await connector.getActivity()
    await connector.logout()
    await expect(connector.createItem({ id: "two", type: "task", createdBy: "x", data: {} })).rejects.toThrow(/auth/i)
    await expect(connector.updateItem(item.id, { data: {} })).rejects.toThrow(/auth/i)
    await expect(connector.deleteItem(item.id)).rejects.toThrow(/auth/i)
    await expect(connector.moveItemToGroup(item.id, "beta")).rejects.toThrow(/auth/i)
    expect("createRelationRecord" in connector).toBe(false)
    expect(await connector.getItem(item.id)).toEqual(item)
    expect(await connector.getActivity()).toEqual(before)
  })
})
