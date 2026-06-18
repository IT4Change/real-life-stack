/**
 * MapLibre GL implementation of MapAdapter (vector tiles).
 *
 * Spec: docs/spec/modules/map.md → "Karten-Library-Adapter"
 *
 * Notes:
 * - MapLibre uses GeoJSON order `[lng, lat]` natively, so unlike the Leaflet
 *   adapter this file needs no coordinate translation.
 * - `tileSource` is interpreted as a **MapLibre style URL**, not a raster tile
 *   template (MapLibre loads a string `style` as a URL, never as inline JSON).
 *   The default is the free, key-less OpenFreeMap "liberty" vector style;
 *   override via MountOptions.
 * - Consumers must import `maplibre-gl/dist/maplibre-gl.css` themselves (or
 *   rely on their bundler / app to load it) — required for marker positioning
 *   and the built-in controls.
 * - `maplibre-gl` is loaded lazily so it stays an optional peer dependency:
 *   importing this file does not pull the maplibre bundle, and non-DOM / SSR
 *   bundles do not break at import time.
 * - **Type leak avoidance**: the public surface only references `MapAdapter`
 *   types. Internal MapLibre instances are held as `unknown` and cast where
 *   used, so the generated `.d.ts` carries no `maplibre-gl` reference and
 *   consumers without it installed see no TS errors.
 */

import type {
  Map as MlMap,
  MapOptions,
  Marker as MlMarker,
  MarkerOptions,
  MapMouseEvent,
  NavigationControl as MlNavigationControl,
  NavigationControlOptions,
} from "maplibre-gl"
import type {
  LngLat,
  MapAdapter,
  MapClickEvent,
  MapMarkerSpec,
  MapMountOptions,
  MapViewPatch,
  MapViewState,
  Unsubscribe,
} from "../adapter"
import { markerDataUrl } from "../markers/render-marker-svg"
import { PIN_SIZE } from "../markers/marker-shapes"
import { iconRegistryVersion } from "../../../lib/icons/icon-registry"

/** Free, key-less vector style (CORS-enabled). Override via MountOptions.tileSource. */
const DEFAULT_STYLE = "https://tiles.openfreemap.org/styles/liberty"

/** Marker color used when a MapMarkerSpec carries no color hint. */
const DEFAULT_MARKER_COLOR = "#2563eb"

// MapLibre's module shape mirrors its namespace. The two constructors we use
// are typed against the real maplibre-gl option types so the mount/marker calls
// are validated at compile time; this type is internal and never exported, so
// no maplibre-gl reference leaks into the generated `.d.ts`.
type MapLibreModule = {
  Map: new (options: MapOptions) => MlMap
  Marker: new (options?: MarkerOptions) => MlMarker
  NavigationControl: new (options?: NavigationControlOptions) => MlNavigationControl
}

// Cached lazy module reference. Populated on first mount(), reused thereafter.
let maplibreModule: MapLibreModule | null = null

async function loadMapLibre(): Promise<MapLibreModule> {
  if (!maplibreModule) {
    const mod = await import("maplibre-gl")
    // maplibre-gl ships a default export carrying the namespace surface.
    maplibreModule = ((mod as { default?: MapLibreModule }).default ??
      (mod as unknown as MapLibreModule))
  }
  return maplibreModule
}

/** A stable key for a marker's appearance, so we only re-render the SVG when it changes. */
function appearanceKey(spec: MapMarkerSpec): string {
  // iconRegistryVersion() so a registerIcon() that redefines an icon invalidates
  // cached markers using it (the spec key alone wouldn't change).
  return `${spec.color ?? ""}|${spec.icon ?? ""}|${spec.shape ?? ""}|${spec.selected ? 1 : 0}|${spec.glowColor ?? ""}|${iconRegistryVersion()}`
}

/** Base drop shadow under every pin. */
const MARKER_BASE_SHADOW = "drop-shadow(0 2px 3px rgba(0,0,0,0.5))"

/**
 * The element's CSS filter: the base shadow, plus a soft colour glow when the
 * marker is selected (its item open in the shared panel) — the map analogue of
 * the cards' active-item glow. Two stacked colour drop-shadows form the halo.
 */
function markerFilter(spec: MapMarkerSpec): string {
  if (spec.selected && spec.glowColor) {
    // Glow at 50% opacity (alpha 0x80), matching the cards' getActivePanelGlow.
    return `${MARKER_BASE_SHADOW} drop-shadow(0 0 3px ${spec.glowColor}80) drop-shadow(0 0 6px ${spec.glowColor}80)`
  }
  return MARKER_BASE_SHADOW
}

/** The marker's pin as an SVG `data:` URL (see markerDataUrl — no injection surface). */
function markerSrc(spec: MapMarkerSpec): string {
  return markerDataUrl({
    color: spec.color ?? DEFAULT_MARKER_COLOR,
    icon: spec.icon,
    shape: spec.shape,
  })
}

/**
 * Build the marker DOM element: an `<img>` showing the rendered pin SVG. Using
 * an image (not innerHTML) keeps custom-icon SVGs free of any injection surface
 * and mirrors the Leaflet adapter so both engines look identical.
 */
function buildMarkerElement(spec: MapMarkerSpec): HTMLImageElement {
  const el = document.createElement("img")
  el.className = "rls-marker rls-marker-shadow"
  el.src = markerSrc(spec)
  el.width = PIN_SIZE.width
  el.height = PIN_SIZE.height
  el.draggable = false
  el.style.cursor = "pointer"
  // Drop shadow inline (not only via the .rls-marker-shadow class) so it applies
  // even if maplibre touches the element's className. CSS filter follows the
  // pin's alpha; reliable for <img>-embedded SVG (an in-SVG feDropShadow is not).
  // Includes the selected glow when applicable.
  el.style.filter = markerFilter(spec)
  // Keyboard-accessible: the marker behaves as a button so non-pointer users
  // can activate it (a marker click opens the item's detail panel). The
  // accessible name is set from the label in setMarkers.
  el.setAttribute("role", "button")
  el.tabIndex = 0
  return el
}

export class MapLibreMapAdapter implements MapAdapter {
  // Internal MapLibre handles are held as `unknown` so the generated `.d.ts`
  // does not reference `maplibre-gl`. Consumers without it installed can
  // import the toolkit without TS errors.
  private mapInstance: unknown = null
  private markers = new Map<string, unknown>()
  private markerEls = new Map<string, HTMLElement>()
  private markerLabels = new Map<string, string | undefined>()
  private markerAppearance = new Map<string, string>()
  private viewListeners = new Set<(view: MapViewState) => void>()
  private clickListeners = new Set<(event: MapClickEvent) => void>()
  private markerClickListeners = new Set<(markerId: string) => void>()

  async mount(container: HTMLElement, options: MapMountOptions): Promise<void> {
    if (this.mapInstance) {
      throw new Error("MapLibreMapAdapter: already mounted")
    }
    const maplibre = await loadMapLibre()

    const map = new maplibre.Map({
      container,
      style: options.tileSource ?? DEFAULT_STYLE,
      center: options.center, // [lng, lat] — GeoJSON order, native to MapLibre
      zoom: options.zoom,
      attributionControl: { customAttribution: options.attribution },
    })

    // Zoom control top-left, matching the Leaflet adapter's default placement.
    map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left")

    // Settle once the map is usable. "load" fires after the style loads and the
    // first frame renders. A fatal style-load failure (404 / CORS / unreachable
    // tileSource) instead emits "error" and NEVER "load", so awaiting "load"
    // alone would hang forever. We settle on whichever fires first and remove
    // both listeners. We resolve (not reject) on "error" so a merely transient
    // tile error that races ahead of "load" cannot false-fail the mount; the
    // cause is surfaced via console.warn (our listener consumes MapLibre's own
    // default logging for that event).
    await new Promise<void>((resolve) => {
      if (map.loaded()) {
        resolve()
        return
      }
      const settle = () => {
        map.off("load", onLoad)
        map.off("error", onError)
        resolve()
      }
      const onLoad = () => settle()
      const onError = (e: { error?: Error }) => {
        // eslint-disable-next-line no-console
        console.warn("MapLibreMapAdapter: error during initial load", e?.error ?? e)
        settle()
      }
      map.on("load", onLoad)
      map.on("error", onError)
    })

    map.on("moveend", () => {
      const view = this.getView()
      this.viewListeners.forEach((cb) => cb(view))
    })

    map.on("click", (event: MapMouseEvent) => {
      const evt: MapClickEvent = {
        position: [event.lngLat.lng, event.lngLat.lat],
        originalEvent: event,
      }
      this.clickListeners.forEach((cb) => cb(evt))
    })

    this.mapInstance = map
  }

  async unmount(): Promise<void> {
    const map = this.mapInstance as MlMap | null
    if (!map) return
    ;(this.markers as Map<string, MlMarker>).forEach((m) => m.remove())
    this.markers.clear()
    this.markerEls.clear()
    this.markerLabels.clear()
    this.markerAppearance.clear()
    map.remove()
    this.mapInstance = null
    this.viewListeners.clear()
    this.clickListeners.clear()
    this.markerClickListeners.clear()
  }

  setMarkers(markers: MapMarkerSpec[]): void {
    const map = this.mapInstance as MlMap | null
    const maplibre = maplibreModule
    if (!map || !maplibre) {
      throw new Error("MapLibreMapAdapter: setMarkers called before mount")
    }
    const typedMarkers = this.markers as Map<string, MlMarker>
    const next = new Map<string, MapMarkerSpec>(markers.map((m) => [m.id, m]))

    // Remove markers that no longer exist
    for (const [id, marker] of typedMarkers) {
      if (!next.has(id)) {
        marker.remove()
        typedMarkers.delete(id)
        this.markerEls.delete(id)
        this.markerLabels.delete(id)
        this.markerAppearance.delete(id)
      }
    }

    // Add or update remaining
    for (const spec of markers) {
      const existing = typedMarkers.get(spec.id)
      if (existing) {
        existing.setLngLat(spec.position)
        const el = this.markerEls.get(spec.id) as HTMLImageElement | undefined
        // Reconcile label (hover title + accessible name) declaratively.
        if (this.markerLabels.get(spec.id) !== spec.label) {
          if (el) this.applyMarkerLabel(el, spec.label)
          this.markerLabels.set(spec.id, spec.label)
        }
        // Reconcile appearance in place (no marker recreation, no flicker).
        const key = appearanceKey(spec)
        if (this.markerAppearance.get(spec.id) !== key) {
          if (el) {
            el.src = markerSrc(spec)
            // Selection toggles the colour glow — refresh the element filter too.
            el.style.filter = markerFilter(spec)
          }
          this.markerAppearance.set(spec.id, key)
        }
      } else {
        const el = buildMarkerElement(spec)
        this.applyMarkerLabel(el, spec.label)
        const activate = () => {
          this.markerClickListeners.forEach((cb) => cb(spec.id))
        }
        el.addEventListener("click", (e) => {
          // Marker elements sit above the canvas, so the map "click" does not
          // fire for marker hits; stopPropagation guards against any bubbling.
          e.stopPropagation()
          activate()
        })
        el.addEventListener("keydown", (e) => {
          // Enter / Space activate the marker, matching native button behavior
          // (role="button" + tabindex on the element).
          if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
            e.preventDefault()
            activate()
          }
        })
        // anchor "bottom": the pin's tip sits on the coordinate.
        const marker = new maplibre.Marker({ element: el, anchor: "bottom" })
        marker.setLngLat(spec.position).addTo(map)
        typedMarkers.set(spec.id, marker)
        this.markerEls.set(spec.id, el)
        this.markerLabels.set(spec.id, spec.label)
        this.markerAppearance.set(spec.id, appearanceKey(spec))
      }
    }
  }

  setView(view: MapViewPatch): void {
    const map = this.mapInstance as MlMap | null
    if (!map) return
    const center = view.center ?? this.lngLatTuple(map.getCenter())
    const zoom = view.zoom ?? map.getZoom()
    map.jumpTo({ center, zoom })
  }

  focusOn(center: LngLat, options?: { bottomInset?: number; animate?: boolean }): void {
    const map = this.mapInstance as MlMap | null
    if (!map) return
    const bottomInset = options?.bottomInset ?? 0
    // Offset the target up by half the obscured strip so it ends up centred in
    // the visible map area above a bottom sheet. Negative y = up (maplibre uses
    // a per-move `offset` so no persistent camera padding is left behind).
    map.easeTo({
      center,
      offset: [0, -bottomInset / 2],
      duration: options?.animate === false ? 0 : 500,
    })
  }

  getView(): MapViewState {
    const map = this.mapInstance as MlMap | null
    if (!map) {
      throw new Error("MapLibreMapAdapter: getView called before mount")
    }
    const bounds = map.getBounds()
    return {
      center: this.lngLatTuple(map.getCenter()),
      zoom: map.getZoom(),
      bounds: {
        north: bounds.getNorth(),
        east: bounds.getEast(),
        south: bounds.getSouth(),
        west: bounds.getWest(),
      },
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

  /** Set the marker's hover title and accessible name from its label. */
  private applyMarkerLabel(el: HTMLElement, label: string | undefined): void {
    el.title = label ?? ""
    el.setAttribute("aria-label", label ?? "Kartenmarker")
  }

  private lngLatTuple(center: { lng: number; lat: number }): LngLat {
    return [center.lng, center.lat]
  }
}
