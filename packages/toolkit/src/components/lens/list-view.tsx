import { useEffect, useRef } from "react"
import type { Item } from "@real-life-stack/data-interface"

import {
  focusActiveItemOnce,
  selectionFocusScrollMarginBlockEnd,
  type SelectionFocusVisibleArea,
} from "../../lib/selection-focus"
import { getItemPreviewAdornments, ItemPreview } from "../preview"

export interface ListViewProps {
  items: readonly Item[]
  activeItemId?: string
  /** Shell-owned obstruction below the scrollable lens, e.g. a mobile drawer. */
  selectionFocusVisibleArea?: SelectionFocusVisibleArea
  onItemClick?: (item: Item) => void
}

/** The shared lens rule: relation records describe connections, not cards. */
export function lensItems(items: readonly Item[]): Item[] {
  return items.filter(({ type }) => type !== "relation")
}

/**
 * A read-only, type-agnostic projection of every domain item.
 * Filtering belongs to the calling shell; this component deliberately has no
 * filter controls of its own.
 */
export function ListView({ items, activeItemId, selectionFocusVisibleArea, onItemClick }: ListViewProps) {
  const visibleItems = lensItems(items)
  const activeItem = visibleItems.find(({ id }) => id === activeItemId)
  const activeElementRef = useRef<HTMLDivElement>(null)
  const lastFocusedItemIdRef = useRef<string | null>(null)
  const scrollMarginBlockEnd = selectionFocusScrollMarginBlockEnd(selectionFocusVisibleArea)

  useEffect(() => {
    lastFocusedItemIdRef.current = focusActiveItemOnce(
      lastFocusedItemIdRef.current,
      activeItemId,
      activeItem ? activeElementRef.current : null,
      (element) => element.scrollIntoView({ block: "center" }),
    )
  }, [activeItem, activeItemId])

  if (visibleItems.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Einträge vorhanden.</p>
  }

  return (
    <section aria-label="Listenansicht" className="space-y-2">
      {visibleItems.map((item) => {
        const adornments = getItemPreviewAdornments(item)
        return (
          <div
            key={item.id}
            ref={item.id === activeItemId ? activeElementRef : undefined}
            style={item.id === activeItemId ? { scrollMarginBlockEnd } : undefined}
          >
            <ItemPreview
              item={item}
              author={null}
              density="compact"
              active={item.id === activeItemId}
              {...adornments}
              onClick={onItemClick ? () => onItemClick(item) : undefined}
            />
          </div>
        )
      })}
    </section>
  )
}
