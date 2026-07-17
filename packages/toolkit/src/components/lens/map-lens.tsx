import { useEffect, useMemo, useRef, useState } from "react"
import type { Item } from "@real-life-stack/data-interface"

import { latLngFromPoint } from "../../lib/geo"
import { getItemColor } from "../../lib/utils"
import {
  focusActiveItemInVisibleArea,
  initialSelectionFocusVisibleAreaState,
  type SelectionFocusVisibleArea,
  type SelectionFocusVisibleAreaState,
} from "../../lib/selection-focus"
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
  /** Shell-owned area covered by a panel while the active marker is focused. */
  selectionFocusVisibleArea?: SelectionFocusVisibleArea
  /** Resets one-time selection and fit gates for a new item-inventory context. */
  viewportResetKey?: string | number
  /** Opens the item through the owning shell's existing detail path. */
  onItemClick?: (item: Item) => void
}

/** Map markers are field-composed and never expose relation records as map items. */
export function mapLensMarkers(items: readonly Item[], activeItemId?: string): MapMarkerSpec[] {
  const markers: MapMarkerSpec[] = []

  for (const item of items) {
    if (item.type === "relation") continue
    const position = latLngFromPoint(item.data.position)
    if (!position) continue
    const { lng, lat } = position

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

/** Selection uses the shared lens gate and panel-aware visible-area semantics. */
export function focusMapLensMarkerOnce(
  selectionFocus: SelectionFocusVisibleAreaState,
  activeItemId: string | null | undefined,
  markers: readonly MapMarkerSpec[],
  visibleArea: SelectionFocusVisibleArea | undefined,
  focus: (marker: MapMarkerSpec, visibleArea: SelectionFocusVisibleArea) => void,
): SelectionFocusVisibleAreaState {
  const marker = markers.find(({ id }) => id === activeItemId) ?? null
  return focusActiveItemInVisibleArea(selectionFocus, activeItemId, marker, visibleArea, focus)
}

export interface MapLensViewportState {
  selectionFocus: SelectionFocusVisibleAreaState
  autoFitted: boolean
}

export function initialMapLensViewportState(): MapLensViewportState {
  return { selectionFocus: initialSelectionFocusVisibleAreaState(), autoFitted: false }
}

export interface MapLensViewportContext {
  initialized: boolean
  resetKey: string | number | undefined
  state: MapLensViewportState
}

export function initialMapLensViewportContext(): MapLensViewportContext {
  return { initialized: false, resetKey: undefined, state: initialMapLensViewportState() }
}

/** A replacement adapter owns a fresh map and must not inherit prior viewport gates. */
export function mapLensViewportStateForAdapter(
  previousAdapter: MapAdapter | null,
  nextAdapter: MapAdapter,
  state: MapLensViewportState,
): MapLensViewportState {
  return previousAdapter === nextAdapter ? state : initialMapLensViewportState()
}

/** Apply selection before the one-time aggregate viewport fit. */
export function updateMapLensViewport(
  adapter: MapAdapter,
  state: MapLensViewportState,
  activeItemId: string | null | undefined,
  markers: readonly MapMarkerSpec[],
  visibleArea?: SelectionFocusVisibleArea,
): MapLensViewportState {
  const activeMarker = markers.find(({ id }) => id === activeItemId)
  const selectionFocus = focusMapLensMarkerOnce(
    state.selectionFocus,
    activeItemId,
    markers,
    visibleArea,
    (marker, focusVisibleArea) => adapter.focusOn(marker.position, {
      animate: false,
      ...(focusVisibleArea.bottomInset ? { bottomInset: focusVisibleArea.bottomInset } : {}),
    }),
  )
  if (activeMarker || state.autoFitted) {
    return { selectionFocus, autoFitted: state.autoFitted }
  }
  return {
    selectionFocus,
    autoFitted: fitMapLensViewport(adapter, markers),
  }
}

/**
 * The MapLens viewport-effect transition. A new reset key invalidates both
 * selection and auto-fit gates before the same render's viewport action runs.
 */
export function updateMapLensViewportForResetKey(
  adapter: MapAdapter,
  context: MapLensViewportContext,
  viewportResetKey: string | number | undefined,
  activeItemId: string | null | undefined,
  markers: readonly MapMarkerSpec[],
  visibleArea?: SelectionFocusVisibleArea,
): MapLensViewportContext {
  const state = !context.initialized || context.resetKey !== viewportResetKey
    ? initialMapLensViewportState()
    : context.state
  return {
    initialized: true,
    resetKey: viewportResetKey,
    state: updateMapLensViewport(adapter, state, activeItemId, markers, visibleArea),
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
  selectionFocusVisibleArea,
  viewportResetKey,
  onItemClick,
}: MapLensProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const initialViewRef = useRef(initialView)
  const [adapter, setAdapter] = useState<MapAdapter | null>(null)
  const adapterOwnerRef = useRef<MapAdapter | null>(null)
  const viewportContextRef = useRef<MapLensViewportContext>(initialMapLensViewportContext())
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
      onMounted: (candidate) => {
        viewportContextRef.current = {
          ...viewportContextRef.current,
          state: mapLensViewportStateForAdapter(
            adapterOwnerRef.current,
            candidate,
            viewportContextRef.current.state,
          ),
        }
        adapterOwnerRef.current = candidate
        setAdapter(candidate)
      },
      onUnmounted: (candidate) => {
        if (adapterOwnerRef.current === candidate) adapterOwnerRef.current = null
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
      viewportContextRef.current = updateMapLensViewportForResetKey(
        adapter,
        viewportContextRef.current,
        viewportResetKey,
        activeItemId,
        markers,
        selectionFocusVisibleArea,
      )
    } catch {
      // Keep the gate armed: a later render may use an adapter that is ready.
    }
  }, [activeItemId, adapter, markers, selectionFocusVisibleArea, viewportResetKey])

  return (
    <section aria-label="Kartenansicht" className="relative h-full min-h-80">
      <div ref={outerRef} className="absolute inset-0" />
    </section>
  )
}
