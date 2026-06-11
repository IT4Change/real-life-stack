import { describe, it, expect, beforeEach, vi } from "vitest"
import type { RlsSpaceDoc, SerializedItem } from "../src/types.js"
import type { Item, ItemFilter } from "@real-life-stack/data-interface"

/**
 * We can't easily instantiate a real WotConnector in unit tests because
 * it depends on WotIdentity, WebSocket, Automerge, IndexedDB, etc.
 *
 * Instead, we test the core item logic (serialize → CRDT doc → deserialize)
 * by simulating what the connector does internally:
 *   - A doc with `items: Record<string, SerializedItem>`
 *   - transact() mutates the doc
 *   - getItems/getItem deserialize from the doc
 *
 * This validates the data flow contract that any CRDT adapter must satisfy.
 * When we migrate to Yjs, these same tests must still pass.
 */

import { serializeItem, deserializeItem } from "../src/serialization.js"
import { matchesFilter } from "@real-life-stack/data-interface"

// --- Fake SpaceHandle simulating the CRDT doc layer ---

class FakeSpaceHandle {
  private doc: RlsSpaceDoc

  constructor(name = "Test Space") {
    this.doc = {
      _type: "rls",
      items: {},
      metadata: { name, modules: ["feed", "kanban", "calendar", "map"] },
    }
  }

  getDoc(): RlsSpaceDoc {
    return this.doc
  }

  transact(fn: (doc: RlsSpaceDoc) => void): void {
    fn(this.doc)
  }

  onRemoteUpdate(_cb: () => void): () => void {
    return () => {}
  }

  close(): void {}
}

// --- Helper: simulate connector's item operations on a handle ---

function createItemOnHandle(
  handle: FakeSpaceHandle,
  input: Omit<Item, "id" | "createdAt">,
): Item {
  const id = crypto.randomUUID()
  const newItem: Item = { ...input, id, createdAt: new Date().toISOString() }
  const serialized = serializeItem(newItem)
  handle.transact((doc) => {
    doc.items[id] = serialized
  })
  return newItem
}

function getItemsFromHandle(handle: FakeSpaceHandle, filter?: ItemFilter): Item[] {
  const doc = handle.getDoc()
  const items = Object.values(doc.items).map(deserializeItem)
  if (!filter) return items
  return items.filter((item) => matchesFilter(item, filter))
}

function getItemFromHandle(handle: FakeSpaceHandle, id: string): Item | null {
  const doc = handle.getDoc()
  const serialized = doc.items[id]
  if (!serialized) return null
  return deserializeItem(serialized)
}

function updateItemOnHandle(
  handle: FakeSpaceHandle,
  id: string,
  updates: Partial<Item>,
): Item {
  handle.transact((doc) => {
    const existing = doc.items[id]
    if (!existing) throw new Error(`Item ${id} not found`)

    if (updates.type) existing.type = updates.type
    if (updates.data) {
      for (const [key, value] of Object.entries(updates.data)) {
        existing.data[key] =
          typeof value === "object" && value !== null
            ? JSON.parse(JSON.stringify(value))
            : (value as any)
      }
    }
    if (updates.relations !== undefined) existing.relations = updates.relations
    if (updates.schema !== undefined) existing.schema = updates.schema
    if (updates.schemaVersion !== undefined) existing.schemaVersion = updates.schemaVersion
    if (updates.tags !== undefined) existing.tags = updates.tags
    if (updates["@context"] !== undefined) existing["@context"] = updates["@context"]
  })
  return getItemFromHandle(handle, id)!
}

function deleteItemOnHandle(handle: FakeSpaceHandle, id: string): void {
  handle.transact((doc) => {
    delete doc.items[id]
  })
}

// --- Tests ---

describe("Item CRUD (CRDT-agnostic contract)", () => {
  let handle: FakeSpaceHandle

  beforeEach(() => {
    handle = new FakeSpaceHandle()
  })

  describe("createItem", () => {
    it("creates an item with generated id and timestamp", () => {
      const item = createItemOnHandle(handle, {
        type: "task",
        createdBy: "did:key:z6MkTest",
        data: { title: "Test Task", status: "open" },
      })

      expect(item.id).toBeDefined()
      expect(typeof item.createdAt).toBe("string")
      expect(item.type).toBe("task")
      expect(item.data.title).toBe("Test Task")
    })

    it("persists item in the doc", () => {
      const item = createItemOnHandle(handle, {
        type: "task",
        createdBy: "did:key:z6MkTest",
        data: { title: "Persisted" },
      })

      const doc = handle.getDoc()
      expect(doc.items[item.id]).toBeDefined()
      expect(doc.items[item.id].type).toBe("task")
    })

    it("stores createdAt as ISO string in doc", () => {
      const item = createItemOnHandle(handle, {
        type: "task",
        createdBy: "user-1",
        data: {},
      })

      const doc = handle.getDoc()
      expect(typeof doc.items[item.id].createdAt).toBe("string")
      expect(doc.items[item.id].createdAt).toBe(item.createdAt)
    })
  })

  describe("getItems", () => {
    it("returns empty array when no items", () => {
      const items = getItemsFromHandle(handle)
      expect(items).toEqual([])
    })

    it("returns all items without filter", () => {
      createItemOnHandle(handle, { type: "task", createdBy: "u1", data: { title: "A" } })
      createItemOnHandle(handle, { type: "event", createdBy: "u1", data: { title: "B" } })

      const items = getItemsFromHandle(handle)
      expect(items).toHaveLength(2)
    })

    it("filters by type", () => {
      createItemOnHandle(handle, { type: "task", createdBy: "u1", data: {} })
      createItemOnHandle(handle, { type: "event", createdBy: "u1", data: {} })
      createItemOnHandle(handle, { type: "task", createdBy: "u1", data: {} })

      const tasks = getItemsFromHandle(handle, { type: "task" })
      expect(tasks).toHaveLength(2)
      expect(tasks.every((t) => t.type === "task")).toBe(true)
    })

    it("filters by createdBy", () => {
      createItemOnHandle(handle, { type: "task", createdBy: "alice", data: {} })
      createItemOnHandle(handle, { type: "task", createdBy: "bob", data: {} })

      const aliceItems = getItemsFromHandle(handle, { createdBy: "alice" })
      expect(aliceItems).toHaveLength(1)
      expect(aliceItems[0].createdBy).toBe("alice")
    })

    it("filters by hasField", () => {
      createItemOnHandle(handle, { type: "task", createdBy: "u1", data: { title: "A", status: "open" } })
      createItemOnHandle(handle, { type: "task", createdBy: "u1", data: { title: "B" } })

      const withStatus = getItemsFromHandle(handle, { hasField: ["status"] })
      expect(withStatus).toHaveLength(1)
      expect(withStatus[0].data.status).toBe("open")
    })

    it("returns createdAt as ISO string", () => {
      createItemOnHandle(handle, { type: "task", createdBy: "u1", data: {} })

      const items = getItemsFromHandle(handle)
      expect(typeof items[0].createdAt).toBe("string")
    })
  })

  describe("getItem", () => {
    it("returns null for nonexistent id", () => {
      const item = getItemFromHandle(handle, "nonexistent")
      expect(item).toBeNull()
    })

    it("returns the item by id", () => {
      const created = createItemOnHandle(handle, {
        type: "task",
        createdBy: "u1",
        data: { title: "Find me" },
      })

      const found = getItemFromHandle(handle, created.id)
      expect(found).not.toBeNull()
      expect(found!.data.title).toBe("Find me")
    })
  })

  describe("updateItem", () => {
    it("updates data fields", () => {
      const item = createItemOnHandle(handle, {
        type: "task",
        createdBy: "u1",
        data: { title: "Original", status: "open" },
      })

      const updated = updateItemOnHandle(handle, item.id, {
        data: { status: "done" },
      })

      expect(updated.data.status).toBe("done")
      expect(updated.data.title).toBe("Original") // untouched
    })

    it("updates type", () => {
      const item = createItemOnHandle(handle, {
        type: "task",
        createdBy: "u1",
        data: {},
      })

      const updated = updateItemOnHandle(handle, item.id, { type: "event" })
      expect(updated.type).toBe("event")
    })

    it("updates relations", () => {
      const item = createItemOnHandle(handle, {
        type: "task",
        createdBy: "u1",
        data: {},
      })

      const updated = updateItemOnHandle(handle, item.id, {
        relations: [{ predicate: "assignedTo", target: "global:did:key:z6MkBob" }],
      })

      expect(updated.relations).toHaveLength(1)
      expect(updated.relations![0].predicate).toBe("assignedTo")
    })

    it("updates top-level tags (spec 07-tags.md)", () => {
      const item = createItemOnHandle(handle, {
        type: "task",
        createdBy: "u1",
        data: { title: "Beete vorbereiten" },
        tags: ["garten"],
      })

      const updated = updateItemOnHandle(handle, item.id, {
        tags: ["garten", "urn:rls:tag:permakultur"],
      })

      expect(updated.tags).toEqual(["garten", "urn:rls:tag:permakultur"])
      expect(updated.data.title).toBe("Beete vorbereiten") // untouched
    })

    it("clears top-level tags when set to empty array", () => {
      const item = createItemOnHandle(handle, {
        type: "task",
        createdBy: "u1",
        data: {},
        tags: ["legacy"],
      })

      const updated = updateItemOnHandle(handle, item.id, { tags: [] })

      expect(updated.tags).toEqual([])
    })

    it("updates @context (spec 06-schema-composition.md)", () => {
      const item = createItemOnHandle(handle, {
        type: "event",
        createdBy: "u1",
        data: { start: "2026-07-15T18:00:00Z" },
        "@context": [
          "https://real-life-stack.org/vocab/base/v1",
          "https://real-life-stack.org/vocab/event/v1",
        ],
      })

      const updated = updateItemOnHandle(handle, item.id, {
        "@context": [
          "https://real-life-stack.org/vocab/base/v1",
          "https://real-life-stack.org/vocab/event/v1",
          "https://real-life-stack.org/vocab/place/v1",
        ],
      })

      expect(updated["@context"]).toEqual([
        "https://real-life-stack.org/vocab/base/v1",
        "https://real-life-stack.org/vocab/event/v1",
        "https://real-life-stack.org/vocab/place/v1",
      ])
    })

    it("deep-clones nested objects to avoid CRDT reference errors", () => {
      const item = createItemOnHandle(handle, {
        type: "task",
        createdBy: "u1",
        data: { meta: { priority: 1 } },
      })

      const nestedObj = { priority: 3, tags: ["urgent"] }
      updateItemOnHandle(handle, item.id, { data: { meta: nestedObj } })

      // Mutating the original object should not affect the stored item
      nestedObj.priority = 99
      const stored = getItemFromHandle(handle, item.id)!
      expect((stored.data.meta as any).priority).toBe(3)
    })

    it("throws for nonexistent item", () => {
      expect(() => updateItemOnHandle(handle, "nope", { data: {} })).toThrow("not found")
    })
  })

  describe("deleteItem", () => {
    it("removes item from doc", () => {
      const item = createItemOnHandle(handle, {
        type: "task",
        createdBy: "u1",
        data: { title: "Delete me" },
      })

      deleteItemOnHandle(handle, item.id)

      expect(getItemFromHandle(handle, item.id)).toBeNull()
      expect(getItemsFromHandle(handle)).toHaveLength(0)
    })

    it("does not affect other items", () => {
      const item1 = createItemOnHandle(handle, { type: "task", createdBy: "u1", data: { title: "Keep" } })
      const item2 = createItemOnHandle(handle, { type: "task", createdBy: "u1", data: { title: "Delete" } })

      deleteItemOnHandle(handle, item2.id)

      expect(getItemsFromHandle(handle)).toHaveLength(1)
      expect(getItemFromHandle(handle, item1.id)).not.toBeNull()
    })
  })
})

describe("Space doc schema", () => {
  it("initializes with correct structure", () => {
    const handle = new FakeSpaceHandle("Mein Bereich")
    const doc = handle.getDoc()

    expect(doc._type).toBe("rls")
    expect(doc.items).toEqual({})
    expect(doc.metadata.name).toBe("Mein Bereich")
    expect(doc.metadata.modules).toEqual(["feed", "kanban", "calendar", "map"])
  })

  it("supports multiple items of different types", () => {
    const handle = new FakeSpaceHandle()

    createItemOnHandle(handle, { type: "task", createdBy: "u1", data: { title: "Task" } })
    createItemOnHandle(handle, { type: "event", createdBy: "u1", data: { title: "Event", start: "2026-04-01" } })
    createItemOnHandle(handle, { type: "note", createdBy: "u1", data: { content: "Hello" } })

    const doc = handle.getDoc()
    expect(Object.keys(doc.items)).toHaveLength(3)

    const tasks = getItemsFromHandle(handle, { type: "task" })
    const events = getItemsFromHandle(handle, { type: "event" })
    const notes = getItemsFromHandle(handle, { type: "note" })

    expect(tasks).toHaveLength(1)
    expect(events).toHaveLength(1)
    expect(notes).toHaveLength(1)
  })
})

describe("Observable notification contract", () => {
  it("notifyAllObservers re-filters from doc (simulated)", () => {
    const handle = new FakeSpaceHandle()

    // Create items
    createItemOnHandle(handle, { type: "task", createdBy: "u1", data: { status: "open" } })
    createItemOnHandle(handle, { type: "task", createdBy: "u1", data: { status: "done" } })
    createItemOnHandle(handle, { type: "event", createdBy: "u1", data: {} })

    // Simulate what notifyAllObservers does:
    // For each cached filter, re-read + re-filter from the doc
    const filters: ItemFilter[] = [
      { type: "task" },
      { type: "event" },
      { hasField: ["status"] },
      {},
    ]

    const results = filters.map((f) => getItemsFromHandle(handle, f))

    expect(results[0]).toHaveLength(2) // tasks
    expect(results[1]).toHaveLength(1) // events
    expect(results[2]).toHaveLength(2) // items with status field
    expect(results[3]).toHaveLength(3) // all items
  })
})
