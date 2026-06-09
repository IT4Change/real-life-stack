import type { Item } from "@real-life-stack/data-interface"

/**
 * Map legacy column IDs to the current spec enum.
 *
 * Pre-spec demos used `todo` / `doing` as Kanban column IDs. After the
 * task/v1 enum landed (open | in-progress | done | archived), persisted
 * items with the old IDs would silently fall out of `itemsByColumn`
 * (default columns no longer carry those keys). This helper is the
 * read-time defense: legacy values get folded into the spec ID, and the
 * next `onMoveItem` call writes the new ID back, so items heal on first
 * interaction. Unknown values pass through unchanged — they're handled
 * by the column lookup like any other unmatched status.
 */
export function normalizeStatus(status: string): string {
  if (status === "todo") return "open"
  if (status === "doing") return "in-progress"
  return status
}

export interface ColumnReorderUpdate {
  id: string
  data: Record<string, unknown>
}

/**
 * Compute the item updates for dropping `item` into the `newStatus`
 * column at `position`.
 *
 * `items` is the pool that defines the target column's current membership
 * (all tasks for a merged board, one group's tasks for a grouped board).
 * The dragged `item` is passed explicitly because it may come from outside
 * that pool — e.g. an external drop moving a task between groups.
 *
 * Returns one update per item in the target column: the dragged item gets
 * the new status, and every column member gets its `order` reassigned to
 * its index. Status matching runs through normalizeStatus so legacy items
 * (pre task/v1-enum) count as members of the column they are displayed in.
 */
export function computeColumnReorder(
  items: Item[],
  item: Item,
  newStatus: string,
  position: number,
): ColumnReorderUpdate[] {
  const columnItems = items
    .filter((t) => {
      const s = normalizeStatus((t.data.status as string) ?? "open")
      return s === newStatus && t.id !== item.id
    })
    .sort((a, b) => ((a.data.order as number) ?? 0) - ((b.data.order as number) ?? 0))

  columnItems.splice(position, 0, item)
  return columnItems.map((t, i) => ({
    id: t.id,
    data: { ...t.data, status: newStatus, order: i },
  }))
}
