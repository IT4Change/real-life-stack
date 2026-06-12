import { describe, it, expect } from "vitest"
import type { Item } from "@real-life-stack/data-interface"
import { applyFilterBarValue } from "../src/hooks/use-filterable-items"
import { emptyFilterBarValue } from "../src/components/filter/types"

function makeItem(id: string, type: string, tags?: string[] | undefined): Item {
  const item: Item = {
    id,
    type,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "user-1",
    data: {},
  }
  if (tags !== undefined) item.tags = tags
  return item
}

const items: Item[] = [
  makeItem("a", "post", ["garten", "permakultur"]),
  makeItem("b", "event", ["workshop"]),
  makeItem("c", "task", ["garten"]),
  makeItem("d", "post", []),
  makeItem("e", "post"), // tags property entirely missing — exercises `item.tags ?? []`
]

describe("applyFilterBarValue", () => {
  it("returns a copy of the items list when no filter is set", () => {
    const result = applyFilterBarValue(items, emptyFilterBarValue)
    expect(result).toHaveLength(items.length)
    expect(result).not.toBe(items)
  })

  it("AND-filters tags: every selected tag must be present", () => {
    const result = applyFilterBarValue(items, { tags: ["garten"], types: [] })
    expect(result.map((i) => i.id).sort()).toEqual(["a", "c"])
  })

  it("AND across multiple tags drops items missing any of them", () => {
    const result = applyFilterBarValue(items, {
      tags: ["garten", "permakultur"],
      types: [],
    })
    expect(result.map((i) => i.id)).toEqual(["a"])
  })

  it("OR-filters types: items matching any selected type pass", () => {
    const result = applyFilterBarValue(items, { tags: [], types: ["post", "task"] })
    expect(result.map((i) => i.id).sort()).toEqual(["a", "c", "d", "e"])
  })

  it("combines tag AND + type OR", () => {
    const result = applyFilterBarValue(items, {
      tags: ["garten"],
      types: ["post"],
    })
    expect(result.map((i) => i.id)).toEqual(["a"])
  })

  it("returns an empty array when no item matches", () => {
    const result = applyFilterBarValue(items, {
      tags: ["urn:nope"],
      types: [],
    })
    expect(result).toEqual([])
  })

  it("treats items with empty tag arrays as non-matching when tags are required", () => {
    const result = applyFilterBarValue(items, { tags: ["garten"], types: [] })
    expect(result.find((i) => i.id === "d")).toBeUndefined()
  })

  it("treats items with missing tags property as non-matching when tags are required", () => {
    const result = applyFilterBarValue(items, { tags: ["garten"], types: [] })
    expect(result.find((i) => i.id === "e")).toBeUndefined()
  })
})
