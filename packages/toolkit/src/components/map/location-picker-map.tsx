"use client"

import * as React from "react"
import type { MapAdapter, LngLat } from "./adapter"

export interface LocationPickerMapProps {
  /** Currently picked position, or null. */
  position: { lat: number; lng: number } | null
  /** Called when the user clicks the map to (re)pick a position. */
  onPositionChange: (pos: { lat: number; lng: number }) => void
  /**
   * Factory for a fresh `MapAdapter`. The app supplies the concrete library
   * (e.g. `() => new MapLibreMapAdapter()`); this component stays
   * library-agnostic. Only the first factory is used — the map mounts once.
   */
  createAdapter: () => MapAdapter
  /** CSS height of the map. Default "12rem". */
  height?: string
  /** Center used when no position is set yet, as [lng, lat]. */
  defaultCenter?: LngLat
  /** Zoom used when no position is set yet. */
  defaultZoom?: number
}

const PICK_MARKER_ID = "rls-location-pick"
const PICK_MARKER_COLOR = "#2563eb"

/**
 * Small inline map for picking a single position. Fills the `renderLocationMap`
 * slot of the ContentComposer. A map click sets the position; an externally set
 * position (e.g. from address geocoding) drops the marker and recenters only
 * when the point is off-screen, so picking a visible spot does not jump.
 *
 * Spec: docs/spec/modules/shared-components.md → Location-Widget (b).
 */
export function LocationPickerMap({
  position,
  onPositionChange,
  createAdapter,
  height = "12rem",
  defaultCenter = [13.4, 52.5],
  defaultZoom = 12,
}: LocationPickerMapProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [adapter, setAdapter] = React.useState<MapAdapter | null>(null)

  // Keep the latest callback / factory without re-mounting the map.
  const onChangeRef = React.useRef(onPositionChange)
  React.useEffect(() => {
    onChangeRef.current = onPositionChange
  }, [onPositionChange])
  const createRef = React.useRef(createAdapter)
  // Capture the initial view once (position if known, else the default).
  const initialRef = React.useRef<{ center: LngLat; zoom: number }>({
    center: position ? [position.lng, position.lat] : defaultCenter,
    zoom: position ? 15 : defaultZoom,
  })

  // Mount once. Fresh inner div per effect run keeps StrictMode's double-mount
  // from racing for the same container (same pattern as MapView).
  React.useEffect(() => {
    if (!containerRef.current) return
    const inner = document.createElement("div")
    inner.style.height = "100%"
    inner.style.width = "100%"
    containerRef.current.appendChild(inner)

    let cancelled = false
    let mounted = false
    const ad = createRef.current()
    ad.mount(inner, initialRef.current).then(
      () => {
        if (cancelled) {
          ad.unmount().catch(() => {})
          return
        }
        mounted = true
        ad.observeClicks((e) => {
          const [lng, lat] = e.position
          onChangeRef.current({ lat, lng })
        })
        setAdapter(ad)
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error("LocationPickerMap mount failed", err)
      },
    )
    return () => {
      cancelled = true
      if (mounted) {
        ad.unmount().catch(() => {})
        setAdapter((cur) => (cur === ad ? null : cur))
      }
      inner.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync the marker + recenter when the picked position changes.
  React.useEffect(() => {
    if (!adapter) return
    if (!position) {
      adapter.setMarkers([])
      return
    }
    adapter.setMarkers([
      { id: PICK_MARKER_ID, position: [position.lng, position.lat], color: PICK_MARKER_COLOR },
    ])
    // Recenter only when the point is outside the current viewport, so a click
    // on a visible spot does not jump while a geocoded jump elsewhere does.
    const { bounds } = adapter.getView()
    const inView =
      position.lng >= bounds.west &&
      position.lng <= bounds.east &&
      position.lat >= bounds.south &&
      position.lat <= bounds.north
    if (!inView) adapter.setView({ center: [position.lng, position.lat] })
    // Depend on the coordinate values, not the object identity: the composer
    // builds a fresh { lat, lng } every render, which would otherwise re-run
    // this effect on every keystroke in unrelated fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, position?.lat, position?.lng])

  return (
    <div>
      <div ref={containerRef} className="w-full" style={{ height }} />
      <p className="px-2 py-1 text-[11px] text-muted-foreground">
        Tippe auf die Karte, um die Position zu setzen.
      </p>
    </div>
  )
}
