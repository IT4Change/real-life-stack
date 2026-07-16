import { describe, expect, it } from "vitest"
import {
  isProject,
  isResource,
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
