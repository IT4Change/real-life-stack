import { describe, expect, it } from "vitest"
import type { Item } from "@real-life-stack/data-interface"
import { selectCollectionItems } from "./collection-view"

const item = (id: string, type: string): Item => ({
  id,
  type,
  createdAt: "2026-08-17T10:00:00Z",
  createdBy: "did:key:z6Mk",
  data: {},
} as Item)

describe("selectCollectionItems", () => {
  it("keeps items that stand on their own", () => {
    const items = [item("a", "post"), item("b", "place"), item("c", "task")]
    expect(selectCollectionItems(items).map((i) => i.id)).toEqual(["a", "b", "c"])
  })

  it("drops helper items that only make sense inside another card", () => {
    // Der Blocker aus dem Review: Diese vier standen als eigene Karten in der
    // Liste, obwohl dieselbe Regel den Feed bereits davor schuetzt.
    const items = [
      item("post", "post"),
      item("k", "comment"),
      item("r", "reaction"),
      item("rel", "relation"),
      item("f", "feature"),
    ]
    expect(selectCollectionItems(items).map((i) => i.id)).toEqual(["post"])
  })

  it("accepts an unknown connector type — the catalog is open", () => {
    expect(selectCollectionItems([item("x", "gartenbeet")]).map((i) => i.id)).toEqual(["x"])
  })

  it("leaves the order to the view", () => {
    const items = [item("b", "post"), item("a", "place")]
    expect(selectCollectionItems(items).map((i) => i.id)).toEqual(["b", "a"])
  })
})
