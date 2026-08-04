import { describe, it, expect, vi } from "vitest"
import { createObservable, shallowEqual, matchesFilter, findRelatedItems, BaseConnector } from "../src/base-connector.js"
import type { Item, ItemFilter } from "../src/index.js"
import { moduleHintsFor } from "../src/index.js"

// Helper: create a minimal Item
function createItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    type: "task",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "user-1",
    data: {},
    ...overrides,
  }
}

describe("createObservable", () => {
  it("has initial value as current", () => {
    const obs = createObservable(42)
    expect(obs.current).toBe(42)
  })

  it("updates current on set", () => {
    const obs = createObservable("hello")
    obs.set("world")
    expect(obs.current).toBe("world")
  })

  it("notifies subscribers on set", () => {
    const obs = createObservable(0)
    const values: number[] = []
    obs.subscribe((v) => values.push(v))

    obs.set(1)
    obs.set(2)
    obs.set(3)

    expect(values).toEqual([1, 2, 3])
  })

  it("does not notify after unsubscribe", () => {
    const obs = createObservable(0)
    const values: number[] = []
    const unsub = obs.subscribe((v) => values.push(v))

    obs.set(1)
    unsub()
    obs.set(2)

    expect(values).toEqual([1])
  })

  it("supports multiple subscribers", () => {
    const obs = createObservable(0)
    const a: number[] = []
    const b: number[] = []
    obs.subscribe((v) => a.push(v))
    obs.subscribe((v) => b.push(v))

    obs.set(5)

    expect(a).toEqual([5])
    expect(b).toEqual([5])
  })

  it("clears all subscribers on destroy", () => {
    const obs = createObservable(0)
    const values: number[] = []
    obs.subscribe((v) => values.push(v))

    obs.destroy()
    obs.set(1)

    expect(values).toEqual([])
  })

  it("is loaded by default (synchronous source)", () => {
    expect(createObservable(0).loaded).toBe(true)
  })

  it("starts unloaded when loaded=false, flips on markLoaded", () => {
    const obs = createObservable<number[]>([], false)
    expect(obs.loaded).toBe(false)
    obs.markLoaded()
    expect(obs.loaded).toBe(true)
  })

  it("markLoaded notifies subscribers even when the value is unchanged (empty result)", () => {
    const obs = createObservable<number[]>([], false)
    let calls = 0
    obs.subscribe(() => calls++)

    obs.set([]) // no-op: value unchanged (shallowEqual) → no notification
    expect(calls).toBe(0)

    obs.markLoaded() // must still notify so consumers learn it loaded (empty)
    expect(calls).toBe(1)
    expect(obs.loaded).toBe(true)
  })

  it("markLoaded is a no-op once already loaded", () => {
    const obs = createObservable(0) // loaded=true
    let calls = 0
    obs.subscribe(() => calls++)

    obs.markLoaded()
    expect(calls).toBe(0)
  })
})

describe("BaseConnector loaded contract", () => {
  class StubConnector extends BaseConnector {
    constructor(private readonly stubItems: Item[] = []) {
      super()
    }
    async getItems() {
      return this.stubItems
    }
    async getItem(id: string) {
      return this.stubItems.find((i) => i.id === id) ?? null
    }
    async createItem() {
      throw new Error("not implemented")
    }
    async updateItem() {
      throw new Error("not implemented")
    }
    async deleteItem() {
      throw new Error("not implemented")
    }
  }

  it("observe() stays unloaded until the first (even empty) load settles", async () => {
    const obs = new StubConnector([]).observe({})
    expect(obs.loaded).toBe(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(obs.loaded).toBe(true)
    expect(obs.current).toEqual([])
  })

  it("observe() surfaces resolved data and flips loaded", async () => {
    const item = createItem({ id: "x" })
    const obs = new StubConnector([item]).observe({})
    expect(obs.loaded).toBe(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(obs.loaded).toBe(true)
    expect(obs.current).toEqual([item])
  })
})

describe("matchesFilter", () => {
  it("matches all items when filter is empty", () => {
    const item = createItem()
    expect(matchesFilter(item, {})).toBe(true)
  })

  it("filters by type", () => {
    const task = createItem({ type: "task" })
    const event = createItem({ type: "event" })

    expect(matchesFilter(task, { type: "task" })).toBe(true)
    expect(matchesFilter(event, { type: "task" })).toBe(false)
  })

  it("filters by createdBy", () => {
    const item = createItem({ createdBy: "user-1" })

    expect(matchesFilter(item, { createdBy: "user-1" })).toBe(true)
    expect(matchesFilter(item, { createdBy: "user-2" })).toBe(false)
  })

  it("filters by hasField — single field", () => {
    const item = createItem({ data: { title: "Hello" } })

    expect(matchesFilter(item, { hasField: ["title"] })).toBe(true)
    expect(matchesFilter(item, { hasField: ["description"] })).toBe(false)
  })

  it("filters by hasField — multiple fields (all must exist)", () => {
    const item = createItem({ data: { title: "Hello", status: "done" } })

    expect(matchesFilter(item, { hasField: ["title", "status"] })).toBe(true)
    expect(matchesFilter(item, { hasField: ["title", "priority"] })).toBe(false)
  })

  it("combines type + createdBy + hasField", () => {
    const item = createItem({
      type: "task",
      createdBy: "user-1",
      data: { title: "Hello", status: "open" },
    })

    expect(matchesFilter(item, { type: "task", createdBy: "user-1", hasField: ["status"] })).toBe(true)
    expect(matchesFilter(item, { type: "event", createdBy: "user-1", hasField: ["status"] })).toBe(false)
    expect(matchesFilter(item, { type: "task", createdBy: "user-2", hasField: ["status"] })).toBe(false)
    expect(matchesFilter(item, { type: "task", createdBy: "user-1", hasField: ["priority"] })).toBe(false)
  })

  it("filters by hasTag — single tag (top-level item.tags)", () => {
    const item = createItem({ tags: ["garten", "permakultur"] })

    expect(matchesFilter(item, { hasTag: ["garten"] })).toBe(true)
    expect(matchesFilter(item, { hasTag: ["bauen"] })).toBe(false)
  })

  it("filters by hasTag — multiple tags (AND, all must be present)", () => {
    const item = createItem({ tags: ["garten", "permakultur"] })

    expect(matchesFilter(item, { hasTag: ["garten", "permakultur"] })).toBe(true)
    expect(matchesFilter(item, { hasTag: ["garten", "bauen"] })).toBe(false)
  })

  it("filters by hasTag — empty array matches every item", () => {
    const tagged = createItem({ tags: ["garten"] })
    const untagged = createItem()

    expect(matchesFilter(tagged, { hasTag: [] })).toBe(true)
    expect(matchesFilter(untagged, { hasTag: [] })).toBe(true)
  })

  it("filters by hasTag — items without tags fail any non-empty hasTag", () => {
    const item = createItem()

    expect(matchesFilter(item, { hasTag: ["garten"] })).toBe(false)
  })

  it("ignores tags inside data — only top-level item.tags counts", () => {
    const item = createItem({ data: { tags: ["legacy"] } })

    expect(matchesFilter(item, { hasTag: ["legacy"] })).toBe(false)
  })

  // bbox = [west, south, east, north]; Berlin-ish box around [13.4, 52.5].
  const BERLIN_BBOX: [number, number, number, number] = [13.0, 52.3, 13.8, 52.7]
  const pointItem = (lng: number, lat: number) =>
    createItem({ data: { position: { type: "Point", coordinates: [lng, lat] } } })

  it("filters by bbox — Point inside the box matches", () => {
    expect(matchesFilter(pointItem(13.4, 52.5), { bbox: BERLIN_BBOX })).toBe(true)
  })

  it("filters by bbox — Point outside the box (lng or lat) is excluded", () => {
    expect(matchesFilter(pointItem(8.68, 50.11), { bbox: BERLIN_BBOX })).toBe(false) // Frankfurt
    expect(matchesFilter(pointItem(13.4, 53.9), { bbox: BERLIN_BBOX })).toBe(false) // north of box
    expect(matchesFilter(pointItem(14.5, 52.5), { bbox: BERLIN_BBOX })).toBe(false) // east of box
  })

  it("filters by bbox — items without a position are excluded", () => {
    expect(matchesFilter(createItem(), { bbox: BERLIN_BBOX })).toBe(false)
  })

  it("filters by bbox — uses the first vertex of non-Point geometries", () => {
    const line = createItem({
      data: { position: { type: "LineString", coordinates: [[13.4, 52.5], [99, 99]] } },
    })
    expect(matchesFilter(line, { bbox: BERLIN_BBOX })).toBe(true)
  })

  it("filters by bbox — west > east wraps across the antimeridian", () => {
    const wrap: [number, number, number, number] = [170, -10, -170, 10] // 170°E → -170°E
    expect(matchesFilter(pointItem(179, 0), { bbox: wrap })).toBe(true)
    expect(matchesFilter(pointItem(-179, 0), { bbox: wrap })).toBe(true)
    expect(matchesFilter(pointItem(0, 0), { bbox: wrap })).toBe(false)
  })

  it("combines bbox with type/hasField", () => {
    const event = createItem({
      type: "event",
      data: { position: { type: "Point", coordinates: [13.4, 52.5] }, title: "x" },
    })
    expect(matchesFilter(event, { type: "event", hasField: ["position"], bbox: BERLIN_BBOX })).toBe(true)
    expect(matchesFilter(event, { type: "task", bbox: BERLIN_BBOX })).toBe(false)
  })
})

describe("moduleHintsFor — hasStatement schema hint", () => {
  it("derives hasStatement from the statement/v1 vocabulary, not the type", () => {
    const withSchema = {
      id: "s1", type: "statement", createdAt: "t", createdBy: "u",
      "@context": ["https://real-life-stack.org/vocab/base/v1", "https://real-life-stack.org/vocab/statement/v1"],
      data: { title: "These" },
    } as never
    const withoutSchema = { id: "s2", type: "statement", createdAt: "t", createdBy: "u", data: { title: "Alt" } } as never
    expect(moduleHintsFor(withSchema).hasStatement).toBe(true)
    expect(moduleHintsFor(withoutSchema).hasStatement).toBe(false)
  })

  it("passes persisted hints through unchanged (older entries without the field stay undefined)", () => {
    const legacy = { hasPosition: false, hasStart: false, hasStatus: true }
    expect(moduleHintsFor(legacy).hasStatement).toBeUndefined()
  })
})

describe("matchesFilter — hasSchema (spec 06: schema-based module activation)", () => {
  const statement = {
    id: "s1",
    type: "statement",
    createdAt: "2026-08-05T00:00:00.000Z",
    createdBy: "u1",
    "@context": ["https://real-life-stack.org/vocab/base/v1", "https://real-life-stack.org/vocab/statement/v1"],
    data: { title: "These" },
  } as never

  it("matches when every listed vocabulary is active", () => {
    expect(matchesFilter(statement, { hasSchema: ["https://real-life-stack.org/vocab/statement/v1"] })).toBe(true)
    expect(matchesFilter(statement, { hasSchema: ["https://real-life-stack.org/vocab/base/v1", "https://real-life-stack.org/vocab/statement/v1"] })).toBe(true)
  })

  it("rejects when a listed vocabulary is missing or @context is absent", () => {
    expect(matchesFilter(statement, { hasSchema: ["https://real-life-stack.org/vocab/event/v1"] })).toBe(false)
    const bare = { ...statement, "@context": undefined } as never
    expect(matchesFilter(bare, { hasSchema: ["https://real-life-stack.org/vocab/statement/v1"] })).toBe(false)
  })

  it("an empty hasSchema list matches every item", () => {
    expect(matchesFilter(statement, { hasSchema: [] })).toBe(true)
  })
})

describe("findRelatedItems", () => {
  const post = createItem({ id: "post-1", type: "post" })
  const comment1 = createItem({
    id: "comment-1",
    type: "comment",
    createdAt: "2026-01-01T00:00:00.000Z",
    relations: [{ predicate: "commentOn", target: "item:post-1" }],
  })
  const comment2 = createItem({
    id: "comment-2",
    type: "comment",
    createdAt: "2026-01-02T00:00:00.000Z",
    relations: [{ predicate: "commentOn", target: "item:post-1" }],
  })
  const task = createItem({
    id: "task-1",
    type: "task",
    relations: [{ predicate: "assignedTo", target: "global:user-1" }],
  })
  const allItems = [post, comment1, comment2, task]

  it("forward lookup (default) — finds targets of item's relations", () => {
    const result = findRelatedItems("task-1", allItems, "assignedTo")
    expect(result).toEqual([])  // user-1 is not an item
  })

  it("reverse lookup (to) — finds items pointing to me", () => {
    const result = findRelatedItems("post-1", allItems, "commentOn", { direction: "to" })
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.id)).toContain("comment-1")
    expect(result.map((i) => i.id)).toContain("comment-2")
  })

  it("reverse lookup without predicate — finds all items pointing to me", () => {
    const result = findRelatedItems("post-1", allItems, undefined, { direction: "to" })
    expect(result).toHaveLength(2)
  })

  it("reverse lookup returns empty for unrelated item", () => {
    const result = findRelatedItems("task-1", allItems, "commentOn", { direction: "to" })
    expect(result).toEqual([])
  })

  it("both direction — forward + reverse", () => {
    const itemWithRelation = createItem({
      id: "post-2",
      type: "post",
      relations: [{ predicate: "relatedTo", target: "item:post-1" }],
    })
    const comment3 = createItem({
      id: "comment-3",
      type: "comment",
      relations: [{ predicate: "commentOn", target: "item:post-2" }],
    })
    const items = [post, itemWithRelation, comment3]

    const result = findRelatedItems("post-2", items, undefined, { direction: "both" })
    // Forward: post-1 (via relatedTo), Reverse: comment-3 (via commentOn)
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.id)).toContain("post-1")
    expect(result.map((i) => i.id)).toContain("comment-3")
  })
})

describe("shallowEqual", () => {
  it("returns true for identical primitives", () => {
    expect(shallowEqual(42, 42)).toBe(true)
    expect(shallowEqual("hello", "hello")).toBe(true)
    expect(shallowEqual(true, true)).toBe(true)
    expect(shallowEqual(null, null)).toBe(true)
    expect(shallowEqual(undefined, undefined)).toBe(true)
  })

  it("returns false for different primitives", () => {
    expect(shallowEqual(42, 43)).toBe(false)
    expect(shallowEqual("a", "b")).toBe(false)
    expect(shallowEqual(null, undefined)).toBe(false)
  })

  it("returns true for same array reference", () => {
    const arr = [1, 2, 3]
    expect(shallowEqual(arr, arr)).toBe(true)
  })

  it("returns true for arrays with same elements", () => {
    const a = { id: "1" }
    const b = { id: "2" }
    expect(shallowEqual([a, b], [a, b])).toBe(true)
  })

  it("returns false for arrays with different length", () => {
    expect(shallowEqual([1, 2], [1, 2, 3])).toBe(false)
  })

  it("returns false for arrays with different elements", () => {
    const a = { id: "1" }
    const b = { id: "1" } // Same content but different reference
    expect(shallowEqual([a], [b])).toBe(false)
  })

  it("returns false for different objects (always)", () => {
    expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(false)
  })
})

describe("createObservable — shallow comparison", () => {
  it("does not fire subscribers when set with same primitive value", () => {
    const obs = createObservable(42)
    const values: number[] = []
    obs.subscribe((v) => values.push(v))

    obs.set(42)

    expect(values).toEqual([])
  })

  it("does not fire when set with same array (same element references)", () => {
    const item1 = { id: "1" }
    const item2 = { id: "2" }
    const obs = createObservable([item1, item2])
    const updates: unknown[][] = []
    obs.subscribe((v) => updates.push(v))

    obs.set([item1, item2])

    expect(updates).toEqual([])
  })

  it("fires when array length changes", () => {
    const item1 = { id: "1" }
    const obs = createObservable([item1])
    const updates: unknown[][] = []
    obs.subscribe((v) => updates.push(v))

    obs.set([item1, { id: "2" }])

    expect(updates).toHaveLength(1)
  })

  it("fires when null changes to value", () => {
    const obs = createObservable<string | null>(null)
    const values: (string | null)[] = []
    obs.subscribe((v) => values.push(v))

    obs.set("hello")

    expect(values).toEqual(["hello"])
  })

  it("does not fire when null stays null", () => {
    const obs = createObservable<string | null>(null)
    const values: (string | null)[] = []
    obs.subscribe((v) => values.push(v))

    obs.set(null)

    expect(values).toEqual([])
  })
})

