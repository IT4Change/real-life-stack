/**
 * MapAdapter — library-agnostic contract for the Map module.
 *
 * Spec reference: docs/spec/modules/map.md → "Karten-Library-Adapter"
 *
 * UI components import only from this file. Concrete adapters (Leaflet,
 * MapLibre, Google Maps, …) live next to it in `./adapters/` and are the
 * only place where library-specific code is allowed.
 *
 * Coordinate convention throughout this API is GeoJSON: `[longitude, latitude]`.
 * Adapters whose underlying library uses `[lat, lng]` (e.g. Leaflet) translate
 * internally.
 */

export type LngLat = [number, number]

export interface MapBounds {
  north: number
  east: number
  south: number
  west: number
}

export interface MapMountOptions {
  /** Initial view: center as [lng, lat] and zoom level */
  center: LngLat
  zoom: number
  /**
   * Optional tile source. If omitted the adapter picks a sensible default
   * (e.g. OSM standard for the Leaflet adapter).
   */
  tileSource?: string
  /** Optional tile attribution shown in the corner. */
  attribution?: string
}

export interface MapMarkerSpec {
  /** Stable identifier — usually the Item.id */
  id: string
  /** Position as [lng, lat] */
  position: LngLat
  /** Short label shown next to or above the marker (optional) */
  label?: string
  /** Icon name / URL (adapter-defined; optional) */
  icon?: string
  /** CSS-style color hint, e.g. "#9bc53d" */
  color?: string
}

export interface MapViewState {
  center: LngLat
  zoom: number
  bounds: MapBounds
}

/**
 * Programmatic viewport change. Bounds are derived from the resulting view
 * and intentionally not part of the patch.
 */
export interface MapViewPatch {
  center?: LngLat
  zoom?: number
}

export interface MapClickEvent {
  position: LngLat
  /**
   * The raw library event, adapter-specific. UI code MUST NOT depend on
   * the shape of this field.
   */
  originalEvent?: unknown
}

export type Unsubscribe = () => void

export interface MapAdapter {
  /** Mount the map into a DOM element. Resolves once the map is ready. */
  mount(container: HTMLElement, options: MapMountOptions): Promise<void>

  /** Tear down the map, free resources, remove DOM. */
  unmount(): Promise<void>

  /**
   * Declarative marker set. The adapter computes the diff (add / remove /
   * update) against its current set, so callers can pass the full intended
   * marker list every render.
   */
  setMarkers(markers: MapMarkerSpec[]): void

  /**
   * Change the viewport programmatically (e.g. for a "show on map" action).
   * `bounds` is not part of the patch — it is a derived value from the
   * viewport, not an input. Use `center` + `zoom` to position the map.
   */
  setView(view: MapViewPatch): void

  /** Current viewport. */
  getView(): MapViewState

  /** Observe viewport changes (pan / zoom by the user). */
  observeView(callback: (view: MapViewState) => void): Unsubscribe

  /** Observe arbitrary clicks on the map (e.g. to add a new marker). */
  observeClicks(callback: (event: MapClickEvent) => void): Unsubscribe

  /** Observe marker clicks. */
  observeMarkerClicks(callback: (markerId: string) => void): Unsubscribe
}
