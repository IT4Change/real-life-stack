import { describe, expect, it } from "vitest"
import { itemToInsertRow, itemUpdateToRowPatch, profileToUser, rowToGroup, rowToItem } from "../src/row-mapping.js"

describe("row mapping", () => {
  it("maps a full row to an Item with all interface fields", () => {
    const item = rowToItem({
      id: "i1",
      type: "note",
      created_by: "user-1",
      created_at: "2026-08-05T10:00:00+00:00",
      context: ["https://real-life-stack.org/vocab/statement/v1"],
      schema: "note",
      schema_version: 2,
      data: { title: "hi", nested: { deep: true } },
      relations: [{ predicate: "relatesTo", target: "item:x" }],
      tags: ["t1"],
      group_id: "g1",
    })
    expect(item).toEqual({
      id: "i1",
      type: "note",
      createdBy: "user-1",
      createdAt: "2026-08-05T10:00:00.000Z",
      "@context": ["https://real-life-stack.org/vocab/statement/v1"],
      schema: "note",
      schemaVersion: 2,
      data: { title: "hi", nested: { deep: true } },
      relations: [{ predicate: "relatesTo", target: "item:x" }],
      tags: ["t1"],
    })
  })

  it("normalizes NULL columns to ABSENT members (matching the other connectors)", () => {
    const item = rowToItem({
      id: "i2", type: "note", created_by: "u", created_at: "2026-01-01T00:00:00Z",
      context: null, schema: null, schema_version: null, data: {}, relations: null, tags: null, group_id: null,
    })
    expect(item).toEqual({ id: "i2", type: "note", createdBy: "u", createdAt: "2026-01-01T00:00:00.000Z", data: {} })
    expect("tags" in item).toBe(false)
    expect("@context" in item).toBe(false)
    expect("relations" in item).toBe(false)
  })

  it("insert row carries group scope and omits absent optionals", () => {
    const row = itemToInsertRow({ type: "note", createdBy: "u1", data: { a: 1 } }, "g1")
    expect(row).toEqual({ type: "note", created_by: "u1", data: { a: 1 }, group_id: "g1" })
    const withId = itemToInsertRow({ id: "fixed", type: "note", createdBy: "u1", data: {}, tags: ["t"] }, null)
    expect(withId).toEqual({ id: "fixed", type: "note", created_by: "u1", data: {}, tags: ["t"], group_id: null })
  })

  it("update patch NEVER carries identity columns — even when the caller passes them", () => {
    const patch = itemUpdateToRowPatch({
      id: "forged", type: "forged", createdBy: "mallory", createdAt: "1970-01-01",
      data: { title: "new" }, tags: ["t"],
    } as never)
    expect(patch).toEqual({ data: { title: "new" }, tags: ["t"] })
    expect("created_by" in patch).toBe(false)
    expect("id" in patch).toBe(false)
    expect("type" in patch).toBe(false)
  })

  it("update patch clears optional fields with explicit null", () => {
    expect(itemUpdateToRowPatch({ tags: undefined, relations: undefined })).toEqual({ tags: null, relations: null })
  })

  it("maps groups and profiles", () => {
    expect(rowToGroup({ id: "g1", name: "N", data: { a: 1 }, created_by: "u", created_at: "t" }, ["u"]))
      .toEqual({ id: "g1", name: "N", members: ["u"], data: { a: 1 } })
    expect(profileToUser({ id: "u1", display_name: "Alice", avatar_url: null }))
      .toEqual({ id: "u1", displayName: "Alice" })
  })
})
