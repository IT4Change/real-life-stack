import { describe, it, expect, vi } from "vitest"
import type { DataInterface, Item } from "@real-life-stack/data-interface"
import { resolveItemPermissions, resolveCanCreate } from "../src/hooks/use-item-permissions"

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "i1",
    type: "post",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "user-a",
    data: {},
    ...overrides,
  }
}

const WRITE = {
  createItem: async () => ({}),
  updateItem: async () => ({}),
  deleteItem: async () => {},
}

function connector(extra: Record<string, unknown> = {}): DataInterface {
  return extra as unknown as DataInterface
}

describe("resolveItemPermissions", () => {
  it("grants nothing when the connector is not writable", () => {
    expect(resolveItemPermissions(connector({ can: () => true }), makeItem(), "user-a")).toEqual({
      canEdit: false,
      canDelete: false,
    })
  })

  it("grants nothing for a null item", () => {
    expect(resolveItemPermissions(connector(WRITE), null, "user-a")).toEqual({
      canEdit: false,
      canDelete: false,
    })
  })

  it("default: own item is editable + deletable", () => {
    expect(
      resolveItemPermissions(connector(WRITE), makeItem({ createdBy: "user-a" }), "user-a"),
    ).toEqual({ canEdit: true, canDelete: true })
  })

  // Bis rls#262 galt hier creator-owns. Das war weder das technische Modell
  // (Space-Schluessel bzw. Supabase-Policy erlauben es laengst) noch
  // praktisch — die UI blendete nur den Knopf aus. Siehe
  // item-permissions-membership.test.ts fuer die Systemtyp-Ausnahmen.
  it("default: fremdes INHALTS-Item ist bearbeitbar (Mitglieder-Modell)", () => {
    expect(
      resolveItemPermissions(connector(WRITE), makeItem({ createdBy: "user-b" }), "user-a"),
    ).toEqual({ canEdit: true, canDelete: true })
  })

  it("default: fremder Kommentar bleibt unantastbar", () => {
    expect(
      resolveItemPermissions(connector(WRITE), makeItem({ createdBy: "user-b", type: "comment" }), "user-a"),
    ).toEqual({ canEdit: false, canDelete: false })
  })

  it("default: no current user grants nothing", () => {
    expect(resolveItemPermissions(connector(WRITE), makeItem(), undefined)).toEqual({
      canEdit: false,
      canDelete: false,
    })
  })

  it("defers to the connector's authorization model when present", () => {
    const can = vi.fn((ability: string) => ability === "item/edit")
    const item = makeItem({ createdBy: "user-b" }) // not mine — but the connector decides
    expect(resolveItemPermissions(connector({ ...WRITE, can }), item, "user-a")).toEqual({
      canEdit: true,
      canDelete: false,
    })
    expect(can).toHaveBeenCalledWith("item/edit", item)
    expect(can).toHaveBeenCalledWith("item/delete", item)
  })
})

describe("resolveCanCreate", () => {
  it("false when the connector is not writable", () => {
    expect(resolveCanCreate(connector({ can: () => true }), "space-1", undefined)).toBe(false)
  })

  it("true (fallback) for a writable connector without an authorization model", () => {
    expect(resolveCanCreate(connector(WRITE), "space-1", undefined)).toBe(true)
  })

  it("defers to the connector's authorization model, passing space (+ type)", () => {
    const can = vi.fn(() => false)
    expect(resolveCanCreate(connector({ ...WRITE, can }), "space-1", "event")).toBe(false)
    expect(can).toHaveBeenCalledWith("item/create", { space: "space-1", type: "event" })
  })

  it("fails closed for an authorization connector without a space id", () => {
    const can = vi.fn(() => true)
    expect(resolveCanCreate(connector({ ...WRITE, can }), null, undefined)).toBe(false)
    expect(can).not.toHaveBeenCalled()
  })

  it("allows create (fallback) for a writable connector without an auth model + no space", () => {
    expect(resolveCanCreate(connector(WRITE), null, undefined)).toBe(true)
  })
})
