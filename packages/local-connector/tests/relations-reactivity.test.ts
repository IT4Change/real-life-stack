import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Item } from "@real-life-stack/data-interface"

// Mock idb-keyval (no IndexedDB in Node)
vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn(async (_key: string, updater: (value: unknown) => unknown) => { updater(undefined) }),
  del: vi.fn().mockResolvedValue(undefined),
  createStore: vi.fn().mockReturnValue({}),
}))

// Mock BroadcastChannel (not available in Node)
vi.stubGlobal("BroadcastChannel", class {
  onmessage = null
  postMessage() {}
  close() {}
})

import { LocalConnector } from "../src/local-connector.js"

function makeItem(overrides: Partial<Item> & { type: string; createdBy: string }): Omit<Item, "id" | "createdAt"> {
  return {
    data: {},
    ...overrides,
  }
}

describe("LocalConnector — Relations Reactivity", () => {
  let connector: LocalConnector

  beforeEach(async () => {
    connector = new LocalConnector({
      items: [],
      groups: [{ id: "g1", name: "Test Group" }],
      users: [{ id: "user-1", displayName: "Alice" }],
      groupMembers: { g1: ["user-1"] },
    })
    await connector.init()
    await connector.authenticate("local", {})
  })

  it("preserves client IDs and returns duplicates unchanged", async () => {
    const created = await connector.createItem({
      id: "client-id",
      type: "note",
      createdBy: "user-1",
      data: { title: "first" },
    })
    const duplicate = await connector.createItem({
      id: "client-id",
      type: "note",
      createdBy: "user-1",
      data: { title: "replacement" },
    })

    expect(created.id).toBe("client-id")
    expect(duplicate).toEqual(created)
    expect(await connector.getItems()).toEqual([created])
  })

  it("skips occupied generated IDs", async () => {
    await connector.createItem({
      id: "item-100",
      type: "note",
      createdBy: "user-1",
      data: {},
    })

    const generated = await connector.createItem({
      type: "note",
      createdBy: "user-1",
      data: {},
    })

    expect(generated.id).toBe("item-101")
  })

  it("observeRelatedItems returns comments via reverse lookup", async () => {
    const post = await connector.createItem(
      makeItem({ type: "post", createdBy: "user-1", data: { title: "Hello" } })
    )

    await connector.createItem(
      makeItem({
        type: "comment",
        createdBy: "user-1",
        data: { content: "Nice post!" },
        relations: [{ predicate: "commentOn", target: `item:${post.id}` }],
      })
    )

    const observable = connector.observeRelatedItems(post.id, "commentOn", { direction: "to" })
    expect(observable.current).toHaveLength(1)
    expect(observable.current[0].data.content).toBe("Nice post!")
  })

  it("observeRelatedItems fires when a new comment is added", async () => {
    const post = await connector.createItem(
      makeItem({ type: "post", createdBy: "user-1", data: { title: "Hello" } })
    )

    const observable = connector.observeRelatedItems(post.id, "commentOn", { direction: "to" })
    expect(observable.current).toHaveLength(0)

    const updates: Item[][] = []
    observable.subscribe((items) => updates.push(items))

    await connector.createItem(
      makeItem({
        type: "comment",
        createdBy: "user-1",
        data: { content: "First!" },
        relations: [{ predicate: "commentOn", target: `item:${post.id}` }],
      })
    )

    expect(updates.length).toBeGreaterThan(0)
    const lastUpdate = updates[updates.length - 1]
    expect(lastUpdate).toHaveLength(1)
    expect(lastUpdate[0].data.content).toBe("First!")
  })

  it("observeRelatedItems fires when a comment is deleted", async () => {
    const post = await connector.createItem(
      makeItem({ type: "post", createdBy: "user-1", data: { title: "Hello" } })
    )

    const comment = await connector.createItem(
      makeItem({
        type: "comment",
        createdBy: "user-1",
        data: { content: "Will be deleted" },
        relations: [{ predicate: "commentOn", target: `item:${post.id}` }],
      })
    )

    const observable = connector.observeRelatedItems(post.id, "commentOn", { direction: "to" })
    expect(observable.current).toHaveLength(1)

    const updates: Item[][] = []
    observable.subscribe((items) => updates.push(items))

    await connector.deleteItem(comment.id)

    const lastUpdate = updates[updates.length - 1]
    expect(lastUpdate).toHaveLength(0)
  })

  it("getRelatedItems with direction 'to' finds incoming relations", async () => {
    const post = await connector.createItem(
      makeItem({ type: "post", createdBy: "user-1", data: { title: "Target" } })
    )

    await connector.createItem(
      makeItem({
        type: "comment",
        createdBy: "user-1",
        data: { content: "I point to the post" },
        relations: [{ predicate: "commentOn", target: `item:${post.id}` }],
      })
    )

    // Default (forward) — post has no outgoing commentOn relations
    const forward = await connector.getRelatedItems(post.id, "commentOn")
    expect(forward).toHaveLength(0)

    // Reverse — find items pointing to post
    const reverse = await connector.getRelatedItems(post.id, "commentOn", { direction: "to" })
    expect(reverse).toHaveLength(1)
    expect(reverse[0].data.content).toBe("I point to the post")
  })

  it("multiple observeRelatedItems for different posts are independent", async () => {
    const post1 = await connector.createItem(
      makeItem({ type: "post", createdBy: "user-1", data: { title: "Post 1" } })
    )
    const post2 = await connector.createItem(
      makeItem({ type: "post", createdBy: "user-1", data: { title: "Post 2" } })
    )

    const obs1 = connector.observeRelatedItems(post1.id, "commentOn", { direction: "to" })
    const obs2 = connector.observeRelatedItems(post2.id, "commentOn", { direction: "to" })

    await connector.createItem(
      makeItem({
        type: "comment",
        createdBy: "user-1",
        data: { content: "Only for post 1" },
        relations: [{ predicate: "commentOn", target: `item:${post1.id}` }],
      })
    )

    expect(obs1.current).toHaveLength(1)
    expect(obs2.current).toHaveLength(0)
  })
})
