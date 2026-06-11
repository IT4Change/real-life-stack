import { useMemo } from "react"
import type { Item } from "@real-life-stack/data-interface"
import type { FilterBarValue } from "../components/filter/types"

/**
 * Pure filter logic — exported for tests and for non-React callers.
 *
 * - Tag filter: AND across the selected tags (item must carry every
 *   selected tag in its top-level `item.tags`).
 * - Type filter: OR across the selected types (item type must be in
 *   the set).
 */
export function applyFilterBarValue(items: readonly Item[], filter: FilterBarValue): Item[] {
  const { tags, types } = filter
  if (tags.length === 0 && types.length === 0) return [...items]

  const tagSet = new Set(tags)
  const typeSet = new Set(types)

  return items.filter((item) => {
    if (tagSet.size > 0) {
      const itemTags = item.tags ?? []
      for (const required of tagSet) {
        if (!itemTags.includes(required)) return false
      }
    }
    if (typeSet.size > 0) {
      if (!typeSet.has(item.type)) return false
    }
    return true
  })
}

/**
 * Apply a shared `FilterBarValue` to a list of items, client-side.
 *
 * Memoised on the items reference and the filter's stringified arrays,
 * so memoised children stay stable across unrelated renders and the
 * caller doesn't have to memoise their filter value.
 *
 * Server-side optimisation (lifting `tags` into a `hasTag` connector
 * filter) is intentionally out of scope here — that's a data-interface
 * concern. This hook is the UI-layer guarantee that the same filter
 * shape applies the same way in every module.
 */
export function useFilterableItems(items: readonly Item[], filter: FilterBarValue): Item[] {
  return useMemo(
    () => applyFilterBarValue(items, filter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, filter.tags.join(" "), filter.types.join(" ")],
  )
}
