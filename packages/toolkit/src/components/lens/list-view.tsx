import { useEffect, useRef, useState } from "react"
import { useWindowVirtualizer } from "@tanstack/react-virtual"
import type { Item } from "@real-life-stack/data-interface"

import {
  focusVirtualItemOnce,
  type SelectionFocusVisibleArea,
} from "../../lib/selection-focus"
import { getItemPreviewAdornments, ItemPreview } from "../preview"

export interface ListViewProps {
  items: readonly Item[]
  activeItemId?: string
  /** Shell-owned obstruction below the scrollable lens, e.g. a mobile drawer. */
  selectionFocusVisibleArea?: SelectionFocusVisibleArea
  /** Re-arms the one-time focus gate when a parent changes this projection. */
  selectionFocusGateKey?: string
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
export function ListView({ items, activeItemId, selectionFocusVisibleArea, selectionFocusGateKey, onItemClick }: ListViewProps) {
  const visibleItems = lensItems(items)
  const lastFocusedItemIdRef = useRef<string | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const virtualizer = useWindowVirtualizer<HTMLDivElement>({
    count: visibleItems.length,
    estimateSize: () => 72,
    initialRect: { width: 1024, height: 720 },
    overscan: 4,
    measureElement: (element) => element.getBoundingClientRect().height,
    getItemKey: (index) => visibleItems[index]?.id ?? index,
    scrollMargin,
  })

  useEffect(() => {
    const updateScrollMargin = () => {
      const section = sectionRef.current
      if (section) setScrollMargin(section.getBoundingClientRect().top + window.scrollY)
    }
    updateScrollMargin()
    window.addEventListener("resize", updateScrollMargin)
    return () => window.removeEventListener("resize", updateScrollMargin)
  }, [])

  useEffect(() => {
    lastFocusedItemIdRef.current = null
  }, [selectionFocusVisibleArea?.bottomInset])

  useEffect(() => {
    lastFocusedItemIdRef.current = focusVirtualItemOnce(
      lastFocusedItemIdRef.current,
      selectionFocusGateKey && activeItemId ? `${selectionFocusGateKey}:${activeItemId}` : activeItemId,
      (() => {
        const itemIndex = visibleItems.findIndex(({ id }) => id === activeItemId)
        return itemIndex < 0 ? undefined : itemIndex
      })(),
      virtualizer,
      selectionFocusVisibleArea,
    )
  }, [activeItemId, selectionFocusGateKey, selectionFocusVisibleArea?.bottomInset, virtualizer, visibleItems])

  if (visibleItems.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Einträge vorhanden.</p>
  }

  return (
    <section ref={sectionRef} aria-label="Listenansicht" data-virtualizer-item-count={visibleItems.length} className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = visibleItems[virtualItem.index]
        if (!item) return null
        const adornments = getItemPreviewAdornments(item)
        return (
          <div
            key={item.id}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 w-full pb-2"
            style={{ transform: `translateY(${virtualItem.start - scrollMargin}px)` }}
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
