import { useEffect, useRef, useState } from "react"
import { useWindowVirtualizer } from "@tanstack/react-virtual"
import type { Item } from "@real-life-stack/data-interface"

import {
  focusVirtualItemOnce,
  type SelectionFocusVisibleArea,
} from "../../lib/selection-focus"
import { getItemPreviewAdornments, ItemPreview } from "../preview"
import { lensItems } from "./list-view"

export interface GridViewProps {
  items: readonly Item[]
  activeItemId?: string
  /** Shell-owned obstruction below the scrollable lens, e.g. a mobile drawer. */
  selectionFocusVisibleArea?: SelectionFocusVisibleArea
  /** Re-arms the one-time focus gate when a parent changes this projection. */
  selectionFocusGateKey?: string
  onItemClick?: (item: Item) => void
}

function gridColumnsForWidth(width: number): number {
  if (width >= 1280) return 4
  if (width >= 1024) return 3
  if (width >= 640) return 2
  return 1
}

/** A read-only grid composed from comfortable ItemPreview cards. */
export function GridView({ items, activeItemId, selectionFocusVisibleArea, selectionFocusGateKey, onItemClick }: GridViewProps) {
  const visibleItems = lensItems(items)
  const lastFocusedItemIdRef = useRef<string | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const [columns, setColumns] = useState(3)
  const rows = Array.from({ length: Math.ceil(visibleItems.length / columns) }, (_, rowIndex) =>
    visibleItems.slice(rowIndex * columns, (rowIndex + 1) * columns),
  )
  const virtualizer = useWindowVirtualizer<HTMLDivElement>({
    count: rows.length,
    estimateSize: () => 172,
    initialRect: { width: 1024, height: 720 },
    overscan: 2,
    measureElement: (element) => element.getBoundingClientRect().height,
    getItemKey: (index) => rows[index]?.map(({ id }) => id).join(":") ?? index,
    scrollMargin,
  })

  useEffect(() => {
    const updateLayout = () => {
      setColumns(gridColumnsForWidth(window.innerWidth))
      const section = sectionRef.current
      if (section) setScrollMargin(section.getBoundingClientRect().top + window.scrollY)
    }
    updateLayout()
    window.addEventListener("resize", updateLayout)
    return () => window.removeEventListener("resize", updateLayout)
  }, [])

  useEffect(() => {
    lastFocusedItemIdRef.current = null
  }, [selectionFocusVisibleArea?.bottomInset])

  useEffect(() => {
    const itemIndex = visibleItems.findIndex(({ id }) => id === activeItemId)
    lastFocusedItemIdRef.current = focusVirtualItemOnce(
      lastFocusedItemIdRef.current,
      selectionFocusGateKey && activeItemId ? `${selectionFocusGateKey}:${activeItemId}` : activeItemId,
      itemIndex < 0 ? undefined : Math.floor(itemIndex / columns),
      virtualizer,
      selectionFocusVisibleArea,
    )
  }, [activeItemId, columns, selectionFocusGateKey, selectionFocusVisibleArea?.bottomInset, virtualizer, visibleItems])

  if (visibleItems.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Einträge vorhanden.</p>
  }

  return (
    <section ref={sectionRef} aria-label="Rasteransicht" data-virtualizer-item-count={visibleItems.length} className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualRow) => {
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
          >
            {rows[virtualRow.index]?.map((item) => {
              const adornments = getItemPreviewAdornments(item)
              return <ItemPreview key={item.id} item={item} author={null} density="comfortable" active={item.id === activeItemId} {...adornments} onClick={onItemClick ? () => onItemClick(item) : undefined} />
            })}
          </div>
        )
      })}
    </section>
  )
}
