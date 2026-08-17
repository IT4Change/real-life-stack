import { describe, expect, it } from "vitest"
import {
  NON_STANDALONE_ITEM_TYPES,
  isProject,
  isResource,
  isStandaloneItemType,
  SYSTEM_ITEM_TYPES,
  type GeoJSONGeometry,
  type Item,
  type KnownItemType,
  type ProfileItemData,
} from "../src/index.js"

function item(type: string, data: Record<string, unknown> = {}): Item {
  return {
    id: `item-${type}`,
    type,
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "did:key:test",
    data,
  }
}

describe("canonical item types", () => {
  it("narrows project and resource items", () => {
    const project = item("project", { title: "RLS" })
    const resource = item("resource", { title: "Workshop", kind: "space" })

    expect(isProject(project)).toBe(true)
    expect(isProject(resource)).toBe(false)
    expect(isResource(resource)).toBe(true)
    expect(isResource(project)).toBe(false)
  })

  it("covers the new catalog entries and canonical data shapes", () => {
    const knownTypes: KnownItemType[] = ["project", "resource", "relation"]
    const profile: ProfileItemData = { displayName: "Ada", avatarUrl: "ada.jpg" }
    const geometry: GeoJSONGeometry = {
      type: "Polygon",
      coordinates: [[[13.4, 52.5], [13.5, 52.5], [13.5, 52.6], [13.4, 52.5]]],
    }

    expect(knownTypes).toEqual(["project", "resource", "relation"])
    expect(profile.displayName).toBe("Ada")
    expect(geometry.type).toBe("Polygon")
  })
})

describe("isStandaloneItemType", () => {
  it("accepts every type that stands on its own as a card", () => {
    for (const type of ["post", "event", "place", "task", "person", "project", "resource", "statement"]) {
      expect(isStandaloneItemType(type)).toBe(true)
    }
  })

  it("rejects the types that only exist inside another item's card", () => {
    // System types speak for someone (comment/reaction/relation), `feature`
    // is a data-level geometry marker — spec 06.
    for (const type of ["comment", "reaction", "relation", "feature"]) {
      expect(isStandaloneItemType(type)).toBe(false)
    }
  })

  it("derives the exclusion set instead of listing it twice", () => {
    for (const type of SYSTEM_ITEM_TYPES) {
      expect(NON_STANDALONE_ITEM_TYPES).toContain(type)
    }
  })

  it("treats a connector's own type as card-worthy (open catalog)", () => {
    expect(isStandaloneItemType("quest")).toBe(true)
  })
})
