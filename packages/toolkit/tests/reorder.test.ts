import { describe, it, expect } from "vitest"
import type { Item } from "@real-life-stack/data-interface"
import { computeColumnReorder, normalizeStatus } from "../src/components/kanban/reorder"

function makeTask(id: string, status: string, order: number): Item {
  return {
    id,
    type: "task",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "u1",
    data: { title: id, status, order },
  }
}

/** Convenience: map update list to "id@order" strings for readable asserts. */
function sequence(updates: { id: string; data: Record<string, unknown> }[]): string[] {
  return updates.map((u) => `${u.id}@${u.data.order}`)
}

describe("normalizeStatus", () => {
  it("maps legacy column ids to the task/v1 enum", () => {
    expect(normalizeStatus("todo")).toBe("open")
    expect(normalizeStatus("doing")).toBe("in-progress")
  })

  it("passes spec ids and unknown values through unchanged", () => {
    expect(normalizeStatus("open")).toBe("open")
    expect(normalizeStatus("done")).toBe("done")
    expect(normalizeStatus("custom-column")).toBe("custom-column")
  })
})

describe("computeColumnReorder", () => {
  it("moves an item within its column and reindexes the whole column", () => {
    const a = makeTask("a", "open", 0)
    const b = makeTask("b", "open", 1)
    const c = makeTask("c", "open", 2)

    // Drag c to the top of "open"
    const updates = computeColumnReorder([a, b, c], c, "open", 0)

    expect(sequence(updates)).toEqual(["c@0", "a@1", "b@2"])
    expect(updates.every((u) => u.data.status === "open")).toBe(true)
  })

  it("moves an item into a different column at the given position", () => {
    const a = makeTask("a", "open", 0)
    const x = makeTask("x", "done", 0)
    const y = makeTask("y", "done", 1)

    // Drag a between x and y in "done"
    const updates = computeColumnReorder([a, x, y], a, "done", 1)

    expect(sequence(updates)).toEqual(["x@0", "a@1", "y@2"])
    const aUpdate = updates.find((u) => u.id === "a")
    expect(aUpdate?.data.status).toBe("done")
  })

  it("drops into an empty column with order 0", () => {
    const a = makeTask("a", "open", 0)

    const updates = computeColumnReorder([a], a, "done", 0)

    expect(sequence(updates)).toEqual(["a@0"])
    expect(updates[0].data.status).toBe("done")
  })

  it("clamps a position beyond the column length to the end", () => {
    const a = makeTask("a", "open", 0)
    const b = makeTask("b", "open", 1)
    const c = makeTask("c", "done", 0)

    // position 99 on a column with one member → c lands at the end
    const updates = computeColumnReorder([a, b, c], a, "done", 99)

    expect(sequence(updates)).toEqual(["c@0", "a@1"])
  })

  it("inserts an external item that is not part of the pool", () => {
    // Grouped boards: the dragged item comes from another group, so the
    // target pool does not contain it.
    const x = makeTask("x", "open", 0)
    const y = makeTask("y", "open", 1)
    const external = makeTask("ext", "open", 5)

    const updates = computeColumnReorder([x, y], external, "open", 1)

    expect(sequence(updates)).toEqual(["x@0", "ext@1", "y@2"])
  })

  it("counts legacy-status items as members of their displayed column", () => {
    // KanbanBoard displays "todo" items in the "open" column via
    // normalizeStatus. Reordering must use the same membership, otherwise
    // legacy items keep stale order values.
    const legacy = makeTask("legacy", "todo", 0)
    const a = makeTask("a", "open", 1)
    const b = makeTask("b", "open", 2)

    // Drag b to the top of "open" — legacy must be reindexed too
    const updates = computeColumnReorder([legacy, a, b], b, "open", 0)

    expect(sequence(updates)).toEqual(["b@0", "legacy@1", "a@2"])
    // Self-healing: the legacy item gets the spec status written back
    const legacyUpdate = updates.find((u) => u.id === "legacy")
    expect(legacyUpdate?.data.status).toBe("open")
  })

  it("treats items without a status as members of the open column", () => {
    const noStatus: Item = {
      id: "n",
      type: "task",
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "u1",
      data: { title: "n", order: 0 },
    }
    const a = makeTask("a", "open", 1)

    const updates = computeColumnReorder([noStatus, a], a, "open", 0)

    expect(sequence(updates)).toEqual(["a@0", "n@1"])
  })

  it("does not touch items in other columns", () => {
    const a = makeTask("a", "open", 0)
    const b = makeTask("b", "open", 1)
    const other = makeTask("other", "done", 0)

    const updates = computeColumnReorder([a, b, other], b, "open", 0)

    expect(updates.map((u) => u.id)).not.toContain("other")
  })

  it("preserves the rest of the item data in updates", () => {
    const a = makeTask("a", "open", 0)
    a.data.priority = "high"
    a.data.description = "Beete vorbereiten"

    const updates = computeColumnReorder([a], a, "done", 0)

    expect(updates[0].data.priority).toBe("high")
    expect(updates[0].data.description).toBe("Beete vorbereiten")
  })
})
