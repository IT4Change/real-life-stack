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
 */

import L from "leaflet"
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

function toLatLng(position: LngLat): L.LatLngExpression {
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
  private markers = new Map<string, L.Marker>()
  private viewListeners = new Set<(view: MapViewState) => void>()
  private clickListeners = new Set<(event: MapClickEvent) => void>()
  private markerClickListeners = new Set<(markerId: string) => void>()

  async mount(container: HTMLElement, options: MapMountOptions): Promise<void> {
    if (this.map) {
      throw new Error("LeafletMapAdapter: already mounted")
    }

    const map = L.map(container, {
      center: toLatLng(options.center),
      zoom: options.zoom,
      zoomControl: true,
    })

    L.tileLayer(options.tileSource ?? DEFAULT_TILE_SOURCE, {
      attribution: options.attribution ?? DEFAULT_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map)

    map.on("moveend zoomend", () => {
      const view = this.getView()
      this.viewListeners.forEach((cb) => cb(view))
    })

    map.on("click", (event) => {
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
    this.map.remove()
    this.map = null
    this.viewListeners.clear()
    this.clickListeners.clear()
    this.markerClickListeners.clear()
  }

  setMarkers(markers: MapMarkerSpec[]): void {
    if (!this.map) {
      throw new Error("LeafletMapAdapter: setMarkers called before mount")
    }
    const next = new Map<string, MapMarkerSpec>(markers.map((m) => [m.id, m]))

    // Remove markers that no longer exist
    for (const [id, marker] of this.markers) {
      if (!next.has(id)) {
        marker.remove()
        this.markers.delete(id)
      }
    }

    // Add or update remaining
    for (const spec of markers) {
      const existing = this.markers.get(spec.id)
      const latlng = toLatLng(spec.position)
      if (existing) {
        existing.setLatLng(latlng)
        if (spec.label !== undefined) existing.setTooltipContent(spec.label)
      } else {
        const marker = L.marker(latlng, { title: spec.label })
        if (spec.label) marker.bindTooltip(spec.label)
        marker.on("click", () => {
          this.markerClickListeners.forEach((cb) => cb(spec.id))
        })
        marker.addTo(this.map)
        this.markers.set(spec.id, marker)
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
    return () => this.viewListeners.delete(callback)
  }

  observeClicks(callback: (event: MapClickEvent) => void): Unsubscribe {
    this.clickListeners.add(callback)
    return () => this.clickListeners.delete(callback)
  }

  observeMarkerClicks(callback: (markerId: string) => void): Unsubscribe {
    this.markerClickListeners.add(callback)
    return () => this.markerClickListeners.delete(callback)
  }
}
