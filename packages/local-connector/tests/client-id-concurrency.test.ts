import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Item } from "@real-life-stack/data-interface"

const idb = vi.hoisted(() => {
  let state: unknown
  let transactionQueue = Promise.resolve()

  const clone = <T>(value: T): T => value === undefined ? value : structuredClone(value)

  return {
    reset(): void {
      state = undefined
      transactionQueue = Promise.resolve()
    },
    get: vi.fn(async () => clone(state)),
    set: vi.fn(async (_key: string, value: unknown) => {
      state = clone(value)
    }),
    update: vi.fn((_key: string, updater: (value: unknown) => unknown) => {
      const transaction = transactionQueue.then(() => {
        state = clone(updater(clone(state)))
      })
      transactionQueue = transaction.catch(() => {})
      return transaction
    }),
    del: vi.fn(async () => {
      state = undefined
    }),
  }
})

vi.mock("idb-keyval", () => ({
  get: idb.get,
  set: idb.set,
  update: idb.update,
  del: idb.del,
  createStore: vi.fn().mockReturnValue({}),
}))

vi.stubGlobal("BroadcastChannel", class {
  onmessage = null
  postMessage() {}
  close() {}
})

import { LocalConnector } from "../src/local-connector.js"

const seed = {
  items: [] as Item[],
  groups: [{ id: "g1", name: "Test Group" }],
  users: [{ id: "user-1", displayName: "Alice" }],
  groupMembers: { g1: ["user-1"] },
  groupItems: { g1: [] },
}

async function initializedConnector(): Promise<LocalConnector> {
  const connector = new LocalConnector(seed)
  await connector.init()
  return connector
}

beforeEach(() => {
  idb.reset()
})

describe("LocalConnector item transaction concurrency", () => {
  it("keeps the first client-ID write across connector instances", async () => {
    const first = await initializedConnector()
    const second = await initializedConnector()

    const firstWrite = first.createItem({
      id: "shared-id",
      type: "note",
      createdBy: "user-1",
      data: { writer: "first" },
    })
    const secondWrite = second.createItem({
      id: "shared-id",
      type: "note",
      createdBy: "user-1",
      data: { writer: "second" },
    })

    const [firstResult, secondResult] = await Promise.all([firstWrite, secondWrite])
    expect(firstResult.data).toEqual({ writer: "first" })
    expect(secondResult).toEqual(firstResult)
    expect(await first.getItem("shared-id")).toEqual(firstResult)
    expect(await second.getItem("shared-id")).toEqual(firstResult)

    const reader = await initializedConnector()
    expect(await reader.getItems()).toEqual([firstResult])
    expect(reader.getItemGroupId("shared-id")).toBe("g1")
  })

  it("allocates distinct generated IDs across connector instances", async () => {
    const first = await initializedConnector()
    const second = await initializedConnector()

    const [firstResult, secondResult] = await Promise.all([
      first.createItem({ type: "note", createdBy: "user-1", data: { writer: "first" } }),
      second.createItem({ type: "note", createdBy: "user-1", data: { writer: "second" } }),
    ])

    expect(firstResult.id).toBe("item-100")
    expect(secondResult.id).toBe("item-101")
    const reader = await initializedConnector()
    expect((await reader.getItems()).map(({ id }) => id)).toEqual(["item-100", "item-101"])
  })

  it("does not let a stale non-item persistence overwrite a committed item", async () => {
    const writer = await initializedConnector()
    const staleInstance = await initializedConnector()
    const staleItems = staleInstance.observe({})
    expect(staleItems.current).toEqual([])

    const created = await writer.createItem({
      id: "durable-id",
      type: "note",
      createdBy: "user-1",
      data: { writer: "first" },
    })
    await staleInstance.logout()

    expect(await staleInstance.getItem("durable-id")).toEqual(created)
    expect(staleItems.current).toEqual([created])
    const reader = await initializedConnector()
    expect(await reader.getItem("durable-id")).toEqual(created)
  })
})
