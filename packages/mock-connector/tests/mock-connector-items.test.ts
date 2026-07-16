import { describe, expect, it, vi } from "vitest"
import type { Item } from "@real-life-stack/data-interface"
import { MockConnector, type MockConnectorSeed } from "../src/index"

const CREATED_AT = "2026-07-16T00:00:00.000Z"

function item(id: string, title: string): Item {
  return {
    id,
    type: "note",
    createdAt: CREATED_AT,
    createdBy: "seed",
    data: { title },
  }
}

function seed(items: Item[] = []): MockConnectorSeed {
  return {
    items,
    groups: [
      { id: "group-a", name: "A" },
      { id: "group-b", name: "B" },
    ],
    users: [{ id: "did:example:user", displayName: "User" }],
    groupMembers: {
      "group-a": ["did:example:user"],
      "group-b": ["did:example:user"],
    },
    groupItems: {
      "group-a": items.map(({ id }) => id),
      "group-b": [],
    },
  }
}

async function flushNotifications(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe("MockConnector item IDs", () => {
  it("deduplicates constructor seed IDs with first-item-wins semantics", async () => {
    const connector = new MockConnector(seed([
      item("duplicate", "first"),
      item("duplicate", "second"),
    ]))

    expect(await connector.getItems()).toEqual([item("duplicate", "first")])
  })

  it("preserves a supplied ID and returns an existing item unchanged", async () => {
    const connector = new MockConnector(seed())
    connector.setCurrentGroup("group-a")

    const created = await connector.createItem({
      id: "client-id",
      type: "note",
      createdBy: "did:example:user",
      data: { title: "first" },
    })
    const duplicate = await connector.createItem({
      id: "client-id",
      type: "note",
      createdBy: "did:example:other",
      data: { title: "replacement" },
    })

    expect(created.id).toBe("client-id")
    expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(duplicate).toBe(created)
    expect(await connector.getItems()).toEqual([created])
  })

  it("skips collisions when allocating generated IDs", async () => {
    const connector = new MockConnector(seed([item("item-100", "reserved")]))

    const created = await connector.createItem({
      type: "note",
      createdBy: "did:example:user",
      data: { title: "generated" },
    })

    expect(created.id).toBe("item-101")
  })

  it("removes group mappings before a deterministic ID is recreated elsewhere", async () => {
    const connector = new MockConnector(seed())
    connector.setCurrentGroup("group-a")
    await connector.createItem({
      id: "reusable",
      type: "note",
      createdBy: "did:example:user",
      data: {},
    })
    await connector.deleteItem("reusable")

    connector.setCurrentGroup("group-b")
    await connector.createItem({
      id: "reusable",
      type: "note",
      createdBy: "did:example:user",
      data: { recreated: true },
    })

    connector.setCurrentGroup("group-a")
    expect(await connector.getItems()).toEqual([])
    connector.setCurrentGroup("group-b")
    expect((await connector.getItems()).map(({ id }) => id)).toEqual(["reusable"])
  })
})

describe("MockConnector fixture injection", () => {
  it("is idempotent across a real second import and keeps the first item unchanged", async () => {
    const connector = new MockConnector(seed())
    connector.setCurrentGroup("group-a")
    await flushNotifications()
    const observable = connector.observe({})
    const listener = vi.fn()
    observable.subscribe(listener)

    const firstSeed = [item("seed-a", "first"), item("seed-b", "second")]
    const first = connector.injectSeedItems(firstSeed, "group-a")
    await flushNotifications()
    const second = connector.injectSeedItems([
      item("seed-a", "replacement"),
      item("seed-b", "replacement"),
    ], "group-a")
    await flushNotifications()

    expect(second).toEqual(first)
    expect(second[0]).toBe(first[0])
    expect(await connector.getItems()).toEqual(firstSeed)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("deduplicates repeated IDs within one injected batch", async () => {
    const connector = new MockConnector(seed())

    connector.injectSeedItems([
      item("seed-a", "first"),
      item("seed-a", "second"),
    ], "group-a")
    connector.setCurrentGroup("group-a")

    expect(await connector.getItems()).toEqual([item("seed-a", "first")])
  })
})
