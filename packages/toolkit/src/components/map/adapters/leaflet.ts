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
 * - **Type leak avoidance**: the `LeafletMapAdapter` class only references
 *   `MapAdapter` types in its public surface (including private field types
 *   that vite-plugin-dts emits). Internally the Leaflet instances are stored
 *   under `unknown` and cast where used, so TypeScript consumers that don't
 *   install `@types/leaflet` do not see a leaflet reference in our `.d.ts`.
 */

import type * as L from "leaflet"
import type {
  LngLat,
  MapAdapter,
  MapBounds,
  MapClickEvent,
  MapMarkerSpec,
  MapMountOptions,
  MapViewPatch,
  MapViewState,
  Unsubscribe,
} from "../adapter"
import { markerDataUrl } from "../markers/render-marker-svg"
import { PIN_SIZE, PIN_ANCHOR } from "../markers/marker-shapes"
import { iconRegistryVersion } from "../../../lib/icons/icon-registry"

const DEFAULT_TILE_SOURCE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const DEFAULT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const DEFAULT_MARKER_COLOR = "#2563eb"

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

function toLatLngTuple(position: LngLat): [number, number] {
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

/** A stable key for a marker's appearance, so we only rebuild the icon when it changes. */
function appearanceKey(spec: MapMarkerSpec): string {
  // iconRegistryVersion() so a registerIcon() that redefines an icon invalidates
  // cached markers using it (the spec key alone wouldn't change).
  return `${spec.color ?? ""}|${spec.icon ?? ""}|${spec.shape ?? ""}|${spec.selected ? 1 : 0}|${iconRegistryVersion()}`
}

/**
 * Build the Leaflet icon for a marker spec: the rendered pin SVG as an
 * `iconUrl` data URL. Using an image (not DivIcon HTML) keeps custom-icon SVGs
 * free of any injection surface and matches the MapLibre adapter. The default
 * (no icon / no shape) is a circle pin with a dot glyph.
 */
function buildMarkerIcon(leaflet: typeof L, spec: MapMarkerSpec): L.Icon {
  return leaflet.icon({
    iconUrl: markerDataUrl({
      color: spec.color ?? DEFAULT_MARKER_COLOR,
      icon: spec.icon,
      shape: spec.shape,
    }),
    iconSize: [PIN_SIZE.width, PIN_SIZE.height],
    iconAnchor: [PIN_ANCHOR.x, PIN_ANCHOR.y],
    tooltipAnchor: [0, -PIN_ANCHOR.y],
    className: "rls-marker-shadow",
  })
}

/**
 * Inline `filter` for the marker's icon element: the base shadow (same as the
 * `.rls-marker-shadow` class) plus a soft colour glow when the marker is
 * selected — the Leaflet counterpart to the MapLibre adapter's `markerFilter`
 * (alpha 0x80 ≈ 50%). Empty when not selected, so the class shadow applies.
 */
function selectedGlowFilter(spec: MapMarkerSpec): string {
  if (!spec.selected || !spec.glowColor) return ""
  return `drop-shadow(0 2px 3px rgba(0,0,0,0.5)) drop-shadow(0 0 3px ${spec.glowColor}80) drop-shadow(0 0 6px ${spec.glowColor}80)`
}

/** Apply {@link selectedGlowFilter} to a marker's rendered icon element. */
function applyMarkerGlow(marker: L.Marker, spec: MapMarkerSpec): void {
  const el = (marker as unknown as { _icon?: HTMLElement })._icon
  if (el) el.style.filter = selectedGlowFilter(spec)
}

export class LeafletMapAdapter implements MapAdapter {
  // Internal Leaflet handles are held as `unknown` so the generated `.d.ts`
  // does not reference `leaflet` types. Consumers without `@types/leaflet`
  // installed can import the toolkit without TS errors.
  private mapInstance: unknown = null
  private leafletInstance: unknown = null
  private markers = new Map<string, unknown>()
  private markerLabels = new Map<string, string | undefined>()
  private markerAppearance = new Map<string, string>()
  private viewListeners = new Set<(view: MapViewState) => void>()
  private clickListeners = new Set<(event: MapClickEvent) => void>()
  private markerClickListeners = new Set<(markerId: string) => void>()

  async mount(container: HTMLElement, options: MapMountOptions): Promise<void> {
    if (this.mapInstance) {
      throw new Error("LeafletMapAdapter: already mounted")
    }
    const leaflet = await loadLeaflet()
    this.leafletInstance = leaflet

    const map = leaflet.map(container, {
      center: toLatLngTuple(options.center),
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

    this.mapInstance = map
  }

  async unmount(): Promise<void> {
    const map = this.mapInstance as L.Map | null
    if (!map) return
    ;(this.markers as Map<string, L.Marker>).forEach((m) => m.remove())
    this.markers.clear()
    this.markerLabels.clear()
    this.markerAppearance.clear()
    map.remove()
    this.mapInstance = null
    this.leafletInstance = null
    this.viewListeners.clear()
    this.clickListeners.clear()
    this.markerClickListeners.clear()
  }

  setMarkers(markers: MapMarkerSpec[]): void {
    const map = this.mapInstance as L.Map | null
    const leaflet = this.leafletInstance as typeof L | null
    if (!map || !leaflet) {
      throw new Error("LeafletMapAdapter: setMarkers called before mount")
    }
    const typedMarkers = this.markers as Map<string, L.Marker>
    const next = new Map<string, MapMarkerSpec>(markers.map((m) => [m.id, m]))

    // Remove markers that no longer exist
    for (const [id, marker] of typedMarkers) {
      if (!next.has(id)) {
        marker.remove()
        typedMarkers.delete(id)
        this.markerLabels.delete(id)
        this.markerAppearance.delete(id)
      }
    }

    // Add or update remaining
    for (const spec of markers) {
      const existing = typedMarkers.get(spec.id)
      const latlng = toLatLngTuple(spec.position)
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
        // Reconcile appearance: rebuild the icon only when it changes, so
        // unrelated re-renders don't flicker the marker.
        const key = appearanceKey(spec)
        if (this.markerAppearance.get(spec.id) !== key) {
          existing.setIcon(buildMarkerIcon(leaflet, spec))
          this.markerAppearance.set(spec.id, key)
        }
        // Selection glow lives on the icon element (a CSS filter), not the SVG —
        // re-apply on every reconcile so selecting/deselecting updates it.
        applyMarkerGlow(existing, spec)
      } else {
        const marker = leaflet.marker(latlng, {
          title: spec.label,
          icon: buildMarkerIcon(leaflet, spec),
        })
        if (spec.label !== undefined) marker.bindTooltip(spec.label)
        marker.on("click", () => {
          this.markerClickListeners.forEach((cb) => cb(spec.id))
        })
        marker.addTo(map)
        applyMarkerGlow(marker, spec)
        typedMarkers.set(spec.id, marker)
        this.markerLabels.set(spec.id, spec.label)
        this.markerAppearance.set(spec.id, appearanceKey(spec))
      }
    }
  }

  resize(): void {
    ;(this.mapInstance as L.Map | null)?.invalidateSize()
  }

  setView(view: MapViewPatch): void {
    const map = this.mapInstance as L.Map | null
    if (!map) return
    const current = map.getCenter()
    const center = view.center ? toLatLngTuple(view.center) : current
    const zoom = view.zoom ?? map.getZoom()
    map.setView(center, zoom)
  }

  focusOn(center: LngLat, options?: { bottomInset?: number; animate?: boolean }): void {
    const map = this.mapInstance as L.Map | null
    if (!map) return
    const animate = options?.animate !== false
    // Centre the target, then shift the view up by half the obscured strip so it
    // sits centred in the visible area above a bottom sheet (panBy +y moves the
    // map content up, i.e. the target rises on screen).
    map.panTo(toLatLngTuple(center), { animate })
    const bottomInset = options?.bottomInset ?? 0
    if (bottomInset) map.panBy([0, bottomInset / 2], { animate })
  }

  getView(): MapViewState {
    const map = this.mapInstance as L.Map | null
    if (!map) {
      throw new Error("LeafletMapAdapter: getView called before mount")
    }
    const center = map.getCenter()
    return {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bounds: toBounds(map.getBounds()),
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
