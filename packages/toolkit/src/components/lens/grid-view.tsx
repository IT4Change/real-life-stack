import { useEffect, useRef } from "react"
import type { Item } from "@real-life-stack/data-interface"

import {
  focusActiveItemOnce,
  selectionFocusScrollMarginBlockEnd,
  type SelectionFocusVisibleArea,
} from "../../lib/selection-focus"
import { getItemPreviewAdornments, ItemPreview } from "../preview"
import { lensItems } from "./list-view"

export interface GridViewProps {
  items: readonly Item[]
  activeItemId?: string
  /** Shell-owned obstruction below the scrollable lens, e.g. a mobile drawer. */
  selectionFocusVisibleArea?: SelectionFocusVisibleArea
  onItemClick?: (item: Item) => void
}

/** A read-only grid composed from comfortable ItemPreview cards. */
export function GridView({ items, activeItemId, selectionFocusVisibleArea, onItemClick }: GridViewProps) {
  const visibleItems = lensItems(items)
  const activeItem = visibleItems.find(({ id }) => id === activeItemId)
  const activeElementRef = useRef<HTMLDivElement>(null)
  const lastFocusedItemIdRef = useRef<string | null>(null)
  const scrollMarginBlockEnd = selectionFocusScrollMarginBlockEnd(selectionFocusVisibleArea)

  useEffect(() => {
    lastFocusedItemIdRef.current = null
  }, [selectionFocusVisibleArea?.bottomInset])

  useEffect(() => {
    lastFocusedItemIdRef.current = focusActiveItemOnce(
      lastFocusedItemIdRef.current,
      activeItemId,
      activeItem ? activeElementRef.current : null,
      (element) => element.scrollIntoView({ block: "center" }),
    )
  }, [activeItem, activeItemId, selectionFocusVisibleArea?.bottomInset])

  if (visibleItems.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Einträge vorhanden.</p>
  }

  return (
    <section aria-label="Rasteransicht" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
              density="comfortable"
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
