import type { Item } from "@real-life-stack/data-interface"
import { normalizeStatus } from "./kanban-board"

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
