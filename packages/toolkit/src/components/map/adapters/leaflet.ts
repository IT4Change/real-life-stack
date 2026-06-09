/**
 * Leaflet implementation of MapAdapter.
 *
 * Spec: docs/spec/modules/map.md
 *
 * Notes:
 * - Leaflet uses [lat, lng] internally; this file is the only place where
 *   that order matters. All public types stay on GeoJSON's [lng, lat].
 * - The default tile source is OpenStreetMap. Override via MountOptions.tileSource.
 * - Consumers must import `leaflet/dist/leaflet.css` themselves (or rely on
 *   their bundler / app to load it).
 * - `leaflet` is loaded lazily so it can remain an optional peer dependency:
 *   importing this file does not pull the leaflet bundle. Consumers that never
 *   construct a `LeafletMapAdapter` can omit the dependency entirely and the
 *   adapter does not break SSR / non-DOM bundles at import time.
 */

import type * as L from "leaflet"
import type {
  LngLat,
  MapAdapter,
  MapBounds,
  MapClickEvent,
  MapMarkerSpec,
  MapMountOptions,
  MapViewState,
  Unsubscribe,
} from "../adapter"

const DEFAULT_TILE_SOURCE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const DEFAULT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// Cached lazy module reference. Populated on first mount(), reused thereafter.
let leafletModule: typeof L | null = null

async function loadLeaflet(): Promise<typeof L> {
  if (!leafletModule) {
    const mod = await import("leaflet")
    // Leaflet ships as both ESM and CJS; the default export carries the same
    // surface as the namespace import. Normalise to the namespace value.
    leafletModule = ((mod as { default?: typeof L }).default ?? (mod as unknown as typeof L))
  }
  return leafletModule
}

function toLatLng(position: LngLat): [number, number] {
  // GeoJSON convention is [lng, lat] — Leaflet expects [lat, lng].
  return [position[1], position[0]]
}

function fromLatLng(latlng: L.LatLng): LngLat {
  return [latlng.lng, latlng.lat]
}

function toBounds(bounds: L.LatLngBounds): MapBounds {
  return {
    north: bounds.getNorth(),
    east: bounds.getEast(),
    south: bounds.getSouth(),
    west: bounds.getWest(),
  }
}

export class LeafletMapAdapter implements MapAdapter {
  private map: L.Map | null = null
  private leaflet: typeof L | null = null
  private markers = new Map<string, L.Marker>()
  private markerLabels = new Map<string, string | undefined>()
  private viewListeners = new Set<(view: MapViewState) => void>()
  private clickListeners = new Set<(event: MapClickEvent) => void>()
  private markerClickListeners = new Set<(markerId: string) => void>()

  async mount(container: HTMLElement, options: MapMountOptions): Promise<void> {
    if (this.map) {
      throw new Error("LeafletMapAdapter: already mounted")
    }
    const leaflet = await loadLeaflet()
    this.leaflet = leaflet

    const map = leaflet.map(container, {
      center: toLatLng(options.center),
      zoom: options.zoom,
      zoomControl: true,
    })

    leaflet
      .tileLayer(options.tileSource ?? DEFAULT_TILE_SOURCE, {
        attribution: options.attribution ?? DEFAULT_ATTRIBUTION,
        maxZoom: 19,
      })
      .addTo(map)

    map.on("moveend zoomend", () => {
      const view = this.getView()
      this.viewListeners.forEach((cb) => cb(view))
    })

    map.on("click", (event: L.LeafletMouseEvent) => {
      const evt: MapClickEvent = {
        position: fromLatLng(event.latlng),
        originalEvent: event,
      }
      this.clickListeners.forEach((cb) => cb(evt))
    })

    this.map = map
  }

  async unmount(): Promise<void> {
    if (!this.map) return
    this.markers.forEach((m) => m.remove())
    this.markers.clear()
    this.markerLabels.clear()
    this.map.remove()
    this.map = null
    this.leaflet = null
    this.viewListeners.clear()
    this.clickListeners.clear()
    this.markerClickListeners.clear()
  }

  setMarkers(markers: MapMarkerSpec[]): void {
    if (!this.map || !this.leaflet) {
      throw new Error("LeafletMapAdapter: setMarkers called before mount")
    }
    const leaflet = this.leaflet
    const map = this.map
    const next = new Map<string, MapMarkerSpec>(markers.map((m) => [m.id, m]))

    // Remove markers that no longer exist
    for (const [id, marker] of this.markers) {
      if (!next.has(id)) {
        marker.remove()
        this.markers.delete(id)
        this.markerLabels.delete(id)
      }
    }

    // Add or update remaining
    for (const spec of markers) {
      const existing = this.markers.get(spec.id)
      const latlng = toLatLng(spec.position)
      if (existing) {
        existing.setLatLng(latlng)
        // Reconcile tooltip / label changes declaratively:
        //   was undefined, now defined  → bindTooltip
        //   was defined, now undefined  → unbindTooltip
        //   both defined, different     → setTooltipContent
        //   unchanged                   → noop
        const prevLabel = this.markerLabels.get(spec.id)
        if (prevLabel !== spec.label) {
          if (spec.label === undefined) {
            existing.unbindTooltip()
          } else if (prevLabel === undefined) {
            existing.bindTooltip(spec.label)
          } else {
            existing.setTooltipContent(spec.label)
          }
          this.markerLabels.set(spec.id, spec.label)
        }
      } else {
        const marker = leaflet.marker(latlng, { title: spec.label })
        if (spec.label !== undefined) marker.bindTooltip(spec.label)
        marker.on("click", () => {
          this.markerClickListeners.forEach((cb) => cb(spec.id))
        })
        marker.addTo(map)
        this.markers.set(spec.id, marker)
        this.markerLabels.set(spec.id, spec.label)
      }
    }
  }

  setView(view: { center?: LngLat; zoom?: number }): void {
    if (!this.map) return
    const current = this.map.getCenter()
    const center = view.center ? toLatLng(view.center) : current
    const zoom = view.zoom ?? this.map.getZoom()
    this.map.setView(center, zoom)
  }

  getView(): MapViewState {
    if (!this.map) {
      throw new Error("LeafletMapAdapter: getView called before mount")
    }
    const center = this.map.getCenter()
    return {
      center: [center.lng, center.lat],
      zoom: this.map.getZoom(),
      bounds: toBounds(this.map.getBounds()),
    }
  }

  observeView(callback: (view: MapViewState) => void): Unsubscribe {
    this.viewListeners.add(callback)
    return () => {
      this.viewListeners.delete(callback)
    }
  }

  observeClicks(callback: (event: MapClickEvent) => void): Unsubscribe {
    this.clickListeners.add(callback)
    return () => {
      this.clickListeners.delete(callback)
    }
  }

  observeMarkerClicks(callback: (markerId: string) => void): Unsubscribe {
    this.markerClickListeners.add(callback)
    return () => {
      this.markerClickListeners.delete(callback)
    }
  }
}
