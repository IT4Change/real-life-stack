import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Item } from "@real-life-stack/data-interface"

import {
  focusVirtualItemOnce,
  type SelectionFocusVisibleArea,
} from "../../lib/selection-focus"
import { Inbox } from "lucide-react"
import { EmptyState } from "../primitives/empty-state"
import { getItemPreviewAdornments, ItemPreview } from "../preview"
import { lensItems } from "./list-view"
import { GRID_CARD_ESTIMATE, GRID_LANE_GAP, gridLaneLayout, gridLaneRange } from "./grid-lane-layout"

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
  const measuredHeightsRef = useRef(new Map<number, number>())
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [columns, setColumns] = useState(3)
  const [geometryVersion, setGeometryVersion] = useState(0)
  const [viewport, setViewport] = useState({ offset: 0, height: 720 })
  const layout = useMemo(
    () => gridLaneLayout(visibleItems.length, columns, measuredHeightsRef.current),
    [columns, geometryVersion, visibleItems],
  )
  const virtualItems = useMemo(
    () => gridLaneRange(layout, Math.max(0, viewport.offset - 2 * GRID_CARD_ESTIMATE), viewport.offset + viewport.height + 2 * GRID_CARD_ESTIMATE),
    [layout, viewport],
  )

  const updateViewport = useCallback(() => {
    const scrollElement = scrollElementRef.current
    if (!scrollElement) return
    setViewport((current) => {
      const next = { offset: scrollElement.scrollTop, height: scrollElement.clientHeight || 720 }
      return current.offset === next.offset && current.height === next.height ? current : next
    })
  }, [])

  const storeMeasuredSize = useCallback((target: HTMLElement) => {
    // Detachte Elemente (StrictMode-Wegwerf-Mounts, Virtualizer-Unmounts)
    // melden Höhe 0 und dürfen echte Messwerte nie überschreiben.
    if (!target.isConnected) return false
    const index = Number(target.dataset.index)
    if (!Number.isInteger(index)) return false
    const size = target.getBoundingClientRect().height
    if (size <= 0) return false
    const stored = measuredHeightsRef.current.get(index)
    if (stored !== undefined && Math.abs(stored - size) < 0.5) return false
    measuredHeightsRef.current.set(index, size)
    return true
  }, [])

  const measureElement = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    if (storeMeasuredSize(element)) setGeometryVersion((version) => version + 1)
    if (typeof ResizeObserver === "undefined") return
    // EIN Observer mit entry-basiertem Callback — nie die Closure eines
    // einzelnen Elements wiederverwenden; unobserve via Ref-Cleanup.
    const observer = (resizeObserverRef.current ??= new ResizeObserver((entries) => {
      let changed = false
      for (const entry of entries) {
        if (storeMeasuredSize(entry.target as HTMLElement)) changed = true
      }
      if (changed) setGeometryVersion((version) => version + 1)
    }))
    observer.observe(element)
    return () => observer.unobserve(element)
  }, [storeMeasuredSize])

  const selectionVirtualizer = useMemo(() => ({
    scrollToIndex: (index: number) => {
      const placement = layout.placements[index]
      const scrollElement = scrollElementRef.current
      if (!placement || !scrollElement) return
      scrollElement.scrollTo({ top: Math.max(0, placement.start - (scrollElement.clientHeight - placement.size) / 2) })
    },
    scrollBy: (delta: number) => scrollElementRef.current?.scrollBy({ top: delta }),
  }), [layout])

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
    updateViewport()
    const scrollElement = scrollElementRef.current
    if (!scrollElement) return
    scrollElement.addEventListener("scroll", updateViewport, { passive: true })
    return () => scrollElement.removeEventListener("scroll", updateViewport)
  }, [updateViewport])

  useEffect(() => () => resizeObserverRef.current?.disconnect(), [])

  useEffect(() => {
    lastFocusedItemIdRef.current = null
  }, [selectionFocusVisibleArea?.bottomInset, selectionFocusGateKey])

  useEffect(() => {
    const itemIndex = visibleItems.findIndex(({ id }) => id === activeItemId)
    lastFocusedItemIdRef.current = focusVirtualItemOnce(
      lastFocusedItemIdRef.current,
      selectionFocusGateKey && activeItemId ? `${selectionFocusGateKey}:${activeItemId}` : activeItemId,
      itemIndex < 0 ? undefined : itemIndex,
      selectionVirtualizer,
      selectionFocusVisibleArea,
    )
  }, [activeItemId, columns, selectionFocusGateKey, selectionFocusVisibleArea?.bottomInset, selectionVirtualizer, visibleItems])

  if (visibleItems.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Noch keine Einträge"
        description="Erstelle den ersten Eintrag in diesem Space."
      />
    )
  }

  return (
    <div ref={scrollElementRef} onScroll={updateViewport} aria-label="Rasteransicht" data-virtualizer-item-count={visibleItems.length} className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <section className="relative" style={{ height: layout.totalSize }}>
          {virtualItems.map((placement) => {
            const item = visibleItems[placement.index]
            if (!item) return null
            const adornments = getItemPreviewAdornments(item)
            return (
              <div
                key={item.id}
                data-index={placement.index}
                ref={measureElement}
                className="absolute"
                style={{
                  width: `calc((100% - ${(columns - 1) * GRID_LANE_GAP}px) / ${columns})`,
                  left: `calc(${placement.lane} * ((100% - ${(columns - 1) * GRID_LANE_GAP}px) / ${columns} + ${GRID_LANE_GAP}px))`,
                  transform: `translateY(${placement.start}px)`,
                }}
              >
                <ItemPreview item={item} author={null} density="comfortable" active={item.id === activeItemId} {...adornments} onClick={onItemClick ? () => onItemClick(item) : undefined} />
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}
