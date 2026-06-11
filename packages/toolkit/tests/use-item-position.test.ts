import { describe, it, expect } from "vitest"
import type { Item } from "@real-life-stack/data-interface"
import { extractItemPosition } from "../src/hooks/use-item-position"

function makeItem(position: unknown): Item {
  return {
    id: "item-1",
    type: "place",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "user-1",
    data: { position },
  }
}

describe("extractItemPosition", () => {
  it("returns null position for null/undefined items", () => {
    expect(extractItemPosition(null)).toEqual({ isPlace: false, point: null })
    expect(extractItemPosition(undefined)).toEqual({ isPlace: false, point: null })
  })

  it("returns null position when data.position is absent", () => {
    const item: Item = {
      id: "item-1",
      type: "post",
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "user-1",
      data: {},
    }
    expect(extractItemPosition(item)).toEqual({ isPlace: false, point: null })
  })

  it("recognizes a GeoJSON Point", () => {
    const item = makeItem({ type: "Point", coordinates: [13.4, 52.5] })
    expect(extractItemPosition(item)).toEqual({ isPlace: true, point: [13.4, 52.5] })
  })

  it("recognizes a LineString and returns the first vertex", () => {
    const item = makeItem({
      type: "LineString",
      coordinates: [[13.4, 52.5], [13.5, 52.6]],
    })
    expect(extractItemPosition(item)).toEqual({ isPlace: true, point: [13.4, 52.5] })
  })

  it("recognizes a Polygon and returns the first ring's first vertex", () => {
    const item = makeItem({
      type: "Polygon",
      coordinates: [[[13.4, 52.5], [13.5, 52.5], [13.5, 52.6], [13.4, 52.5]]],
    })
    expect(extractItemPosition(item)).toEqual({ isPlace: true, point: [13.4, 52.5] })
  })

  it("marks unknown geometry types as non-place", () => {
    const item = makeItem({ type: "MultiPoint", coordinates: [[0, 0]] })
    expect(extractItemPosition(item)).toEqual({ isPlace: false, point: null })
  })

  it("returns isPlace=true but point=null when coordinates are malformed", () => {
    const item = makeItem({ type: "Point", coordinates: ["13.4", "52.5"] })
    expect(extractItemPosition(item)).toEqual({ isPlace: true, point: null })
  })

  it("treats lat/lng object (legacy) as non-place — only GeoJSON counts", () => {
    const item = makeItem({ lat: 52.5, lng: 13.4 })
    expect(extractItemPosition(item)).toEqual({ isPlace: false, point: null })
  })
})
