/**
 * Client-side list filter for items already loaded into the UI.
 *
 * Distinct from `ItemFilter` in @real-life-stack/data-interface: that one is
 * the **query** filter (what the connector hands back — `hasField`, `type`,
 * `limit`, …). This one is the **display** filter (what the view chooses to
 * show from what it already has).
 *
 * The filter dimensions are intentionally generic: search across
 * `data.title` / `data.description`, assignee membership via the
 * `assignedTo` relation, and tags. None of these are Kanban-specific —
 * the same logic applies to any item list in any module.
 */

import type { Item, Relation } from "@real-life-stack/data-interface"

export interface ItemListFilter {
  /** Free-text search; matches data.title and data.description. */
  searchText: string
  /** Restrict to items assigned to this specific user id. */
  assignedTo: string | null
  /** Restrict to items where the current user is in the assignee set. */
  myItemsOnly: boolean
  /** AND-filter: every tag must be present on the item. */
  tags: string[]
}

function getAssigneeIds(item: Item): string[] {
  return (item.relations ?? [])
    .filter((r: Relation) => r.predicate === "assignedTo")
    .map((r: Relation) => r.target.replace(/^global:/, ""))
}

export function applyItemListFilter(
  items: Item[],
  filter: ItemListFilter,
  currentUserId?: string,
): Item[] {
  return items.filter((item) => {
    if (filter.searchText) {
      const q = filter.searchText.toLowerCase()
      const title = String(item.data.title ?? "").toLowerCase()
      const description = String(item.data.description ?? "").toLowerCase()
      if (!title.includes(q) && !description.includes(q)) return false
    }

    if (filter.myItemsOnly && currentUserId) {
      const assignees = getAssigneeIds(item)
      if (!assignees.includes(currentUserId)) return false
    }

    if (filter.assignedTo) {
      const assignees = getAssigneeIds(item)
      if (!assignees.includes(filter.assignedTo)) return false
    }

    if (filter.tags.length > 0) {
      const itemTags = (item.data.tags as string[]) ?? []
      if (!filter.tags.every((t) => itemTags.includes(t))) return false
    }

    return true
  })
}
