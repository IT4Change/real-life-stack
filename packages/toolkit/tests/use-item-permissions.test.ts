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

  it("creator-owns fallback: own item is editable + deletable", () => {
    expect(
      resolveItemPermissions(connector(WRITE), makeItem({ createdBy: "user-a" }), "user-a"),
    ).toEqual({ canEdit: true, canDelete: true })
  })

  it("creator-owns fallback: foreign item grants nothing", () => {
    expect(
      resolveItemPermissions(connector(WRITE), makeItem({ createdBy: "user-b" }), "user-a"),
    ).toEqual({ canEdit: false, canDelete: false })
  })

  it("creator-owns fallback: no current user grants nothing", () => {
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

  it("falls back to writable=true when no space id is given", () => {
    const can = vi.fn(() => false)
    expect(resolveCanCreate(connector({ ...WRITE, can }), null, undefined)).toBe(true)
    expect(can).not.toHaveBeenCalled()
  })
})
