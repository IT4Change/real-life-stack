import { useEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
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
  const scrollElementRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(3)
  const rows = Array.from({ length: Math.ceil(visibleItems.length / columns) }, (_, rowIndex) =>
    visibleItems.slice(rowIndex * columns, (rowIndex + 1) * columns),
  )
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rows.length,
    estimateSize: () => 172,
    initialRect: { width: 1024, height: 720 },
    overscan: 2,
    getScrollElement: () => scrollElementRef.current,
    measureElement: (element) => element.getBoundingClientRect().height,
    getItemKey: (index) => rows[index]?.map(({ id }) => id).join(":") ?? index,
  })
  const selectionVirtualizer = useMemo(() => ({
    scrollToIndex: virtualizer.scrollToIndex,
    scrollBy: (delta: number) => virtualizer.scrollToOffset((virtualizer.scrollOffset ?? 0) + delta),
  }), [virtualizer])

  useEffect(() => {
    const updateLayout = () => {
      setColumns(gridColumnsForWidth(scrollElementRef.current?.clientWidth ?? window.innerWidth))
    }
    updateLayout()
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateLayout)
      return () => window.removeEventListener("resize", updateLayout)
    }
    const observer = new ResizeObserver(updateLayout)
    if (scrollElementRef.current) observer.observe(scrollElementRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    lastFocusedItemIdRef.current = null
  }, [selectionFocusVisibleArea?.bottomInset, selectionFocusGateKey])

  useEffect(() => {
    const itemIndex = visibleItems.findIndex(({ id }) => id === activeItemId)
    lastFocusedItemIdRef.current = focusVirtualItemOnce(
      lastFocusedItemIdRef.current,
      selectionFocusGateKey && activeItemId ? `${selectionFocusGateKey}:${activeItemId}` : activeItemId,
      itemIndex < 0 ? undefined : Math.floor(itemIndex / columns),
      selectionVirtualizer,
      selectionFocusVisibleArea,
    )
  }, [activeItemId, columns, selectionFocusGateKey, selectionFocusVisibleArea?.bottomInset, selectionVirtualizer, visibleItems])

  if (visibleItems.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Einträge vorhanden.</p>
  }

  return (
    <div ref={scrollElementRef} aria-label="Rasteransicht" data-virtualizer-item-count={visibleItems.length} className="h-full overflow-y-auto">
      <section className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 grid w-full gap-3"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rows[virtualRow.index]?.map((item) => {
                const adornments = getItemPreviewAdornments(item)
                return <ItemPreview key={item.id} item={item} author={null} density="comfortable" active={item.id === activeItemId} {...adornments} onClick={onItemClick ? () => onItemClick(item) : undefined} />
              })}
            </div>
          )
        })}
      </section>
    </div>
  )
}
