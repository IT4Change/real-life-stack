import { useEffect, useMemo, useRef, useState } from "react"
import type { Item } from "@real-life-stack/data-interface"

import { getItemColor } from "../../lib/utils"
import { focusActiveItemOnce } from "../../lib/selection-focus"
import type { MapAdapter, MapBounds, MapMarkerSpec, MapMountOptions } from "../map"

/** A single selected marker is close enough to read without a street-level jump. */
export const SINGLE_MARKER_ZOOM = 16

export interface MapLensProps {
  /** Unfiltered candidate items from the owning shell. Only valid Point items become markers. */
  items: readonly Item[]
  /** Factory creates a fresh adapter for every effect mount, including StrictMode replays. */
  createAdapter: () => MapAdapter
  /** Applied only while mounting the adapter; later prop changes never reset the user's view. */
  initialView: MapMountOptions
  /** Shell-owned selection. A rendered marker is focused before the one-time auto-fit runs. */
  activeItemId?: string
  /** Opens the item through the owning shell's existing detail path. */
  onItemClick?: (item: Item) => void
}

/** Map markers are field-composed and never expose relation records as map items. */
export function mapLensMarkers(items: readonly Item[], activeItemId?: string): MapMarkerSpec[] {
  const markers: MapMarkerSpec[] = []

  for (const item of items) {
    if (item.type === "relation") continue
    const position = item.data.position as { type?: unknown; coordinates?: unknown } | undefined
    if (position?.type !== "Point" || !Array.isArray(position.coordinates)) continue
    const [lng, lat] = position.coordinates
    if (typeof lng !== "number" || !Number.isFinite(lng)) continue
    if (typeof lat !== "number" || !Number.isFinite(lat)) continue

    markers.push({
      id: item.id,
      position: [lng, lat],
      label: typeof item.data.title === "string" ? item.data.title : item.id,
      color: getItemColor(item, { groupColor: "#64748b" }),
      icon: typeof item.data.icon === "string" ? item.data.icon : item.tags?.[0],
      selected: item.id === activeItemId,
      glowColor: "#64748b",
    })
  }

  return markers
}

export function mapLensBounds(markers: readonly MapMarkerSpec[]): MapBounds | null {
  if (markers.length === 0) return null

  let west = markers[0]!.position[0]
  let east = west
  let south = markers[0]!.position[1]
  let north = south
  for (const { position: [lng, lat] } of markers.slice(1)) {
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return { west, east, south, north }
}

/** Returns whether a viewport action actually ran, so the caller can preserve its one-time gate on failure. */
export function fitMapLensViewport(adapter: MapAdapter, markers: readonly MapMarkerSpec[]): boolean {
  if (markers.length === 0) return false
  if (markers.length === 1) {
    adapter.setView({ center: markers[0]!.position, zoom: SINGLE_MARKER_ZOOM })
    return true
  }

  const bounds = mapLensBounds(markers)
  if (!bounds) return false
  adapter.fitBounds(bounds)
  return true
}

/** Selection uses the shared lens gate, so a missing marker never consumes its first focus. */
export function focusMapLensMarkerOnce(
  lastFocusedItemId: string | null,
  activeItemId: string | null | undefined,
  markers: readonly MapMarkerSpec[],
  focus: (marker: MapMarkerSpec) => void,
): string | null {
  const marker = markers.find(({ id }) => id === activeItemId) ?? null
  return focusActiveItemOnce(lastFocusedItemId, activeItemId, marker, focus)
}

/** Apply selection before the one-time aggregate viewport fit. */
export function updateMapLensViewport(
  adapter: MapAdapter,
  lastFocusedItemId: string | null,
  autoFitted: boolean,
  activeItemId: string | null | undefined,
  markers: readonly MapMarkerSpec[],
): { lastFocusedItemId: string | null; autoFitted: boolean } {
  const activeMarker = markers.find(({ id }) => id === activeItemId)
  const nextFocusedItemId = focusMapLensMarkerOnce(
    lastFocusedItemId,
    activeItemId,
    markers,
    (marker) => adapter.focusOn(marker.position, { animate: false }),
  )
  if (activeMarker || autoFitted) {
    return { lastFocusedItemId: nextFocusedItemId, autoFitted }
  }
  return {
    lastFocusedItemId: nextFocusedItemId,
    autoFitted: fitMapLensViewport(adapter, markers),
  }
}

interface MountMapLensAdapterOptions {
  outer: Pick<HTMLElement, "appendChild">
  createInnerContainer: () => HTMLElement
  createAdapter: () => MapAdapter
  initialView: MapMountOptions
  onMounted: (adapter: MapAdapter) => void
  onUnmounted: (adapter: MapAdapter) => void
}

/**
 * Own one adapter mount. The injected inner-container factory makes the
 * StrictMode race testable without jsdom and prevents a late first mount from
 * claiming the second effect run's DOM node.
 */
export function mountMapLensAdapter({
  outer,
  createInnerContainer,
  createAdapter,
  initialView,
  onMounted,
  onUnmounted,
}: MountMapLensAdapterOptions): () => void {
  const inner = createInnerContainer()
  outer.appendChild(inner)
  const adapter = createAdapter()
  let cancelled = false
  let mounted = false

  void adapter.mount(inner, initialView).then(
    () => {
      if (cancelled) {
        void adapter.unmount()
        return
      }
      mounted = true
      onMounted(adapter)
    },
    (error: unknown) => {
      if (!cancelled) console.error("MapLens adapter mount failed", error)
    },
  )

  return () => {
    cancelled = true
    if (mounted) {
      void adapter.unmount()
      onUnmounted(adapter)
    }
    inner.remove()
  }
}

/**
 * A small, read-only map projection. It deliberately has no filter controls:
 * filter ownership stays with the app shell and this lens only renders its
 * supplied Point items.
 */
export function MapLens({
  items,
  createAdapter,
  initialView,
  activeItemId,
  onItemClick,
}: MapLensProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const initialViewRef = useRef(initialView)
  const [adapter, setAdapter] = useState<MapAdapter | null>(null)
  const autoFittedRef = useRef(false)
  const lastFocusedItemIdRef = useRef<string | null>(null)
  const markers = useMemo(() => mapLensMarkers(items, activeItemId), [activeItemId, items])
  const itemsByMarkerId = useMemo(
    () => new Map(items.filter(({ type }) => type !== "relation").map((item) => [item.id, item])),
    [items],
  )

  useEffect(() => {
    const outer = outerRef.current
    if (!outer) return
    return mountMapLensAdapter({
      outer,
      createInnerContainer: () => {
        const inner = document.createElement("div")
        inner.style.height = "100%"
        inner.style.width = "100%"
        return inner
      },
      createAdapter,
      initialView: initialViewRef.current,
      onMounted: setAdapter,
      onUnmounted: (candidate) => {
        setAdapter((current) => current === candidate ? null : current)
      },
    })
  }, [createAdapter])

  useEffect(() => {
    if (!adapter) return
    adapter.setMarkers(markers)
  }, [adapter, markers])

  useEffect(() => {
    if (!adapter || !onItemClick) return
    return adapter.observeMarkerClicks((markerId) => {
      const item = itemsByMarkerId.get(markerId)
      if (item) onItemClick(item)
    })
  }, [adapter, itemsByMarkerId, onItemClick])

  useEffect(() => {
    if (!adapter) return
    try {
      const next = updateMapLensViewport(
        adapter,
        lastFocusedItemIdRef.current,
        autoFittedRef.current,
        activeItemId,
        markers,
      )
      lastFocusedItemIdRef.current = next.lastFocusedItemId
      autoFittedRef.current = next.autoFitted
    } catch {
      // Keep the gate armed: a later render may use an adapter that is ready.
    }
  }, [activeItemId, adapter, markers])

  return (
    <section aria-label="Kartenansicht" className="relative h-full min-h-80">
      <div ref={outerRef} className="absolute inset-0" />
    </section>
  )
}
