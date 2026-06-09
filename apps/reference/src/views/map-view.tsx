import { useState, useMemo, useEffect, useRef } from "react"
import { useItems, type MapMarkerSpec } from "@real-life-stack/toolkit"
import { LeafletMapAdapter } from "@real-life-stack/toolkit/leaflet"

/**
 * Map module — first real version using the LeafletMapAdapter from toolkit.
 *
 * Shows every item in the current space that has `data.position` (GeoJSON
 * Point). This is the cross-module case: a workshop with `type=event` and a
 * `position` appears on both the calendar and the map.
 */
export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Adapter lives in state so the markers-effect re-runs once `mount()` has
  // actually resolved. With lazy-loaded leaflet, `mount()` is genuinely async,
  // and the StrictMode double-mount race is too tight for refs alone.
  const [adapter, setAdapter] = useState<LeafletMapAdapter | null>(null)
  // Field-presence filter (spec 06): any item with data.position is
  // map-renderable, regardless of `type`. The Point/coordinates check
  // below is still defensive validation, not the activation criterion.
  const { data: items } = useItems({ hasField: ["position"] })

  const markers: MapMarkerSpec[] = useMemo(() => {
    const list: MapMarkerSpec[] = []
    for (const item of items) {
      const pos = item.data.position as { type?: string; coordinates?: number[] } | undefined
      if (!pos || pos.type !== "Point" || !Array.isArray(pos.coordinates) || pos.coordinates.length < 2) continue
      const [lng, lat] = pos.coordinates
      if (typeof lng !== "number" || typeof lat !== "number") continue
      list.push({
        id: item.id,
        position: [lng, lat],
        label: typeof item.data.title === "string" ? item.data.title : item.id,
      })
    }
    return list
  }, [items])

  // Mount the adapter once. Lazy-loaded leaflet means mount() is properly
  // async, which exposes a classic StrictMode race: both effect passes start
  // their own mount() in parallel and would race for the same DOM container,
  // ending in Leaflet's "Map container is already initialized" error.
  //
  // Robust fix: each effect run gets its own fresh inner div as Leaflet's
  // container, appended to the stable outer ref. On cleanup we tear down the
  // adapter and remove the inner div, so the second pass gets a pristine
  // container that no previous mount can have claimed.
  useEffect(() => {
    if (!containerRef.current) return
    const inner = document.createElement("div")
    inner.style.height = "100%"
    inner.style.width = "100%"
    containerRef.current.appendChild(inner)

    let cancelled = false
    let mounted = false
    const ad = new LeafletMapAdapter()
    ad.mount(inner, {
      center: [13.4, 52.5], // Berlin-ish default; replace with space config later
      zoom: 6,
    }).then(
      () => {
        if (cancelled) {
          ad.unmount().catch(() => {})
        } else {
          mounted = true
          setAdapter(ad)
        }
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error("LeafletMapAdapter mount failed", err)
      },
    )
    return () => {
      cancelled = true
      if (mounted) {
        ad.unmount().catch(() => {})
        setAdapter((current) => (current === ad ? null : current))
      }
      inner.remove()
    }
  }, [])

  // Push markers to the adapter once it is mounted, and on every change.
  useEffect(() => {
    adapter?.setMarkers(markers)
  }, [adapter, markers])

  // `isolate` creates a new stacking context so Leaflet's internal z-indices
  // (zoom controls up to 1000, popup panes 700, marker panes 600) stay contained
  // and don't overlay the navbar / workspace switcher / user menu above.
  return <div ref={containerRef} className="h-full w-full isolate" />
}
