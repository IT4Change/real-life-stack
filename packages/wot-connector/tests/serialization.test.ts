import { describe, it, expect } from "vitest"
import { serializeItem, deserializeItem } from "../src/serialization.js"
import type { Item } from "@real-life-stack/data-interface"
import type { SerializedItem } from "../src/types.js"

describe("serializeItem", () => {
  it("preserves createdAt as ISO string", () => {
    const item: Item = {
      id: "item-1",
      type: "task",
      createdAt: "2026-03-16T10:00:00.000Z",
      createdBy: "did:key:z6Mk...",
      data: { title: "Test" },
    }

    const serialized = serializeItem(item)

    expect(serialized.createdAt).toBe("2026-03-16T10:00:00.000Z")
    expect(typeof serialized.createdAt).toBe("string")
  })

  it("preserves all core fields", () => {
    const item: Item = {
      id: "item-1",
      type: "event",
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "did:key:z6Mk...",
      data: { title: "Event", location: "Berlin" },
    }

    const serialized = serializeItem(item)

    expect(serialized.id).toBe("item-1")
    expect(serialized.type).toBe("event")
    expect(serialized.createdBy).toBe("did:key:z6Mk...")
    expect(serialized.data).toEqual({ title: "Event", location: "Berlin" })
  })

  it("includes optional schema fields when present", () => {
    const item: Item = {
      id: "item-1",
      type: "task",
      createdAt: new Date().toISOString(),
      createdBy: "user-1",
      schema: "rls/task",
      schemaVersion: 2,
      data: {},
    }

    const serialized = serializeItem(item)

    expect(serialized.schema).toBe("rls/task")
    expect(serialized.schemaVersion).toBe(2)
  })

  it("omits optional fields when absent", () => {
    const item: Item = {
      id: "item-1",
      type: "task",
      createdAt: new Date().toISOString(),
      createdBy: "user-1",
      data: {},
    }

    const serialized = serializeItem(item)

    expect(serialized.schema).toBeUndefined()
    expect(serialized.schemaVersion).toBeUndefined()
    expect(serialized.relations).toBeUndefined()
  })

  it("includes relations when present", () => {
    const item: Item = {
      id: "item-1",
      type: "task",
      createdAt: new Date().toISOString(),
      createdBy: "user-1",
      data: {},
      relations: [
        { predicate: "assignedTo", target: "global:did:key:z6Mk..." },
      ],
    }

    const serialized = serializeItem(item)

    expect(serialized.relations).toEqual([
      { predicate: "assignedTo", target: "global:did:key:z6Mk..." },
    ])
  })

  it("does not share data reference with original", () => {
    const item: Item = {
      id: "item-1",
      type: "task",
      createdAt: new Date().toISOString(),
      createdBy: "user-1",
      data: { title: "Original" },
    }

    const serialized = serializeItem(item)
    serialized.data.title = "Modified"

    expect(item.data.title).toBe("Original")
  })
})

describe("deserializeItem", () => {
  it("preserves createdAt as ISO string", () => {
    const serialized: SerializedItem = {
      id: "item-1",
      type: "task",
      createdAt: "2026-03-16T10:00:00.000Z",
      createdBy: "did:key:z6Mk...",
      data: {},
    }

    const item = deserializeItem(serialized)

    expect(typeof item.createdAt).toBe("string")
    expect(item.createdAt).toBe("2026-03-16T10:00:00.000Z")
  })

  it("preserves all core fields", () => {
    const serialized: SerializedItem = {
      id: "item-2",
      type: "event",
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "did:key:abc",
      data: { title: "Treffen", location: "Hamburg" },
    }

    const item = deserializeItem(serialized)

    expect(item.id).toBe("item-2")
    expect(item.type).toBe("event")
    expect(item.createdBy).toBe("did:key:abc")
    expect(item.data).toEqual({ title: "Treffen", location: "Hamburg" })
  })

  it("includes optional fields when present", () => {
    const serialized: SerializedItem = {
      id: "item-1",
      type: "task",
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "user-1",
      schema: "rls/task",
      schemaVersion: 3,
      data: {},
      relations: [{ predicate: "blocks", target: "item:item-2" }],
    }

    const item = deserializeItem(serialized)

    expect(item.schema).toBe("rls/task")
    expect(item.schemaVersion).toBe(3)
    expect(item.relations).toEqual([{ predicate: "blocks", target: "item:item-2" }])
  })

  it("does not share data reference with original", () => {
    const serialized: SerializedItem = {
      id: "item-1",
      type: "task",
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "user-1",
      data: { title: "Original" },
    }

    const item = deserializeItem(serialized)
    item.data.title = "Modified"

    expect(serialized.data.title).toBe("Original")
  })
})

describe("roundtrip", () => {
  it("serialize → deserialize preserves all data", () => {
    const original: Item = {
      id: "roundtrip-1",
      type: "task",
      createdAt: "2026-06-15T14:30:00.000Z",
      createdBy: "did:key:z6MkTest",
      schema: "rls/task",
      schemaVersion: 1,
      data: {
        title: "Roundtrip Test",
        status: "open",
        priority: 3,
        nested: { deep: true },
      },
      relations: [
        { predicate: "assignedTo", target: "global:did:key:z6MkOther" },
        { predicate: "blocks", target: "item:other-item" },
      ],
    }

    const result = deserializeItem(serializeItem(original))

    expect(result).toEqual(original)
  })

  it("serialize → deserialize with minimal item", () => {
    const original: Item = {
      id: "minimal",
      type: "note",
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "user-1",
      data: {},
    }

    const result = deserializeItem(serializeItem(original))

    expect(result).toEqual(original)
  })
})
