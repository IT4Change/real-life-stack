import { describe, expect, it } from "vitest"
import {
  contactDisplayName,
  hasContactData,
  isProject,
  isResource,
  type ContactData,
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

describe("contact/v1 helpers", () => {
  it("hasContactData is true for items with non-empty familyName, regardless of type", () => {
    expect(hasContactData(item("person", { familyName: "Hornbach" }))).toBe(true)
    expect(hasContactData(item("post", { familyName: "Hornbach" }))).toBe(true)
  })

  it("hasContactData is false for missing, empty, or non-string familyName", () => {
    expect(hasContactData(item("person", {}))).toBe(false)
    expect(hasContactData(item("person", { familyName: "" }))).toBe(false)
    expect(hasContactData(item("person", { familyName: null }))).toBe(false)
    expect(hasContactData(item("person", { familyName: 42 }))).toBe(false)
  })

  it("contactDisplayName prefers 'family, given' when both present", () => {
    expect(contactDisplayName(item("person", { familyName: "Hornbach", givenName: "Jan" }))).toBe(
      "Hornbach, Jan",
    )
  })

  it("contactDisplayName falls back to family, then displayName, then organization", () => {
    expect(contactDisplayName(item("person", { familyName: "Hornbach" }))).toBe("Hornbach")
    expect(contactDisplayName(item("person", { displayName: "Anton T." }))).toBe("Anton T.")
    expect(contactDisplayName(item("person", { organization: "Hornbach AG" }))).toBe(
      "Hornbach AG",
    )
    expect(contactDisplayName(item("person", {}))).toBe("(kein Name)")
  })

  it("ContactData interface accepts arrays of email and phone", () => {
    const contact: ContactData = {
      familyName: "Hornbach",
      givenName: "Jan",
      email: ["jan@hornbach.com", "jan.private@example.org"],
      phone: ["+49 6348 60 0", "+49 170 111 22 33"],
    }
    expect(contact.email?.length).toBe(2)
    expect(contact.phone?.length).toBe(2)
  })
})
