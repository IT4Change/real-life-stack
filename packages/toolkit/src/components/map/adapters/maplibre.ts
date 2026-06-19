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
  MapLayerMouseEvent,
  GeoJSONSource,
  NavigationControl as MlNavigationControl,
  NavigationControlOptions,
} from "maplibre-gl"
import type {
  GlobeCapable,
  LngLat,
  MapAdapter,
  MapClickEvent,
  MapMarkerSpec,
  MapMountOptions,
  MapProjection,
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

/** GeoJSON source + symbol layer that render all markers via WebGL (one draw
 *  call for the whole set, so it scales to tens of thousands of pins and gets
 *  globe back-side occlusion for free — unlike per-marker DOM elements). */
const MARKER_SOURCE = "rls-markers"
const MARKER_SYMBOL_LAYER = "rls-marker-symbols"
/** Rasterise the pin SVG at 2× so the GPU icon stays crisp on retina. */
const PIN_RASTER_SCALE = 2

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

/**
 * Warm the map's cold-start cost off the critical path: trigger the lazy
 * maplibre-gl import (downloads + parses the ~1 MB chunk and runs its module
 * init) and prefetch the default style JSON into the HTTP cache. No map / WebGL
 * is created, so it is safe (and cheap) to call once on app idle — the first
 * map open is then noticeably faster. Best-effort; all errors are swallowed.
 */
export async function prefetchMapLibre(styleUrl: string = DEFAULT_STYLE): Promise<void> {
  await loadMapLibre().catch(() => {})
  await fetch(styleUrl, { mode: "cors" }).then((r) => r.ok && r.json()).catch(() => {})
}

/**
 * Stable key for a marker's *image* — colour + icon + shape only (selection /
 * glow are not baked into the pin image; they become a separate layer). The
 * icon registry version invalidates cached images when an icon is redefined.
 */
function imageKey(spec: MapMarkerSpec): string {
  return `${spec.color ?? ""}|${spec.icon ?? ""}|${spec.shape ?? ""}|${iconRegistryVersion()}`
}

/** The marker's pin as an SVG `data:` URL (see markerDataUrl — no injection surface). */
function markerSrc(spec: MapMarkerSpec): string {
  return markerDataUrl({
    color: spec.color ?? DEFAULT_MARKER_COLOR,
    icon: spec.icon,
    shape: spec.shape,
  })
}

/** Load an image URL (here: a pin SVG `data:` URL) into an `HTMLImageElement`. */
function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = "async"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("MapLibreMapAdapter: marker image failed to load"))
    img.src = url
  })
}

/**
 * Rasterise a pin SVG to `ImageData` at `scale`× so `map.addImage(..., { pixelRatio })`
 * gives the symbol layer a crisp retina icon. Data-URL source → no canvas taint,
 * so `getImageData` is allowed.
 */
async function rasterizePin(url: string, scale: number): Promise<ImageData> {
  const img = await loadImageEl(url)
  const w = PIN_SIZE.width * scale
  const h = PIN_SIZE.height * scale
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("MapLibreMapAdapter: no 2D context for pin rasterisation")
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

export class MapLibreMapAdapter implements MapAdapter, GlobeCapable {
  // Internal MapLibre handles are held as `unknown` so the generated `.d.ts`
  // does not reference `maplibre-gl`. Consumers without it installed can
  // import the toolkit without TS errors.
  private mapInstance: unknown = null
  // WebGL markers: a GeoJSON source + symbol layer, plus an image atlas keyed by
  // appearance. `markersVersion` ignores stale setData after async image loads.
  private markerLayersReady = false
  private addedImages = new Set<string>()
  private markersVersion = 0
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
      // A click that hit a marker is a marker click, not a map click — it goes
      // through the layer handler (observeMarkerClicks), not the generic map
      // click (used e.g. to drop a new pin). Mirrors the old DOM-marker behaviour
      // where the element swallowed the map click.
      if (
        map.getLayer(MARKER_SYMBOL_LAYER) &&
        map.queryRenderedFeatures(event.point, { layers: [MARKER_SYMBOL_LAYER] }).length > 0
      ) {
        return
      }
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
    // Source, layer and atlas images all go away with the map; just drop our
    // bookkeeping so a fresh mount re-creates them.
    this.markerLayersReady = false
    this.addedImages.clear()
    map.remove()
    this.mapInstance = null
    this.viewListeners.clear()
    this.clickListeners.clear()
    this.markerClickListeners.clear()
  }

  setMarkers(markers: MapMarkerSpec[]): void {
    void this.setMarkersAsync(markers)
  }

  /**
   * Declarative marker set, rendered as one GeoJSON source + symbol layer.
   * Loading the needed pin images is async, so a version token drops the result
   * if a newer `setMarkers` call started meanwhile (last-write-wins).
   */
  private async setMarkersAsync(markers: MapMarkerSpec[]): Promise<void> {
    const map = this.mapInstance as MlMap | null
    if (!map) {
      throw new Error("MapLibreMapAdapter: setMarkers called before mount")
    }
    this.ensureMarkerLayers(map)
    const version = ++this.markersVersion
    await this.ensureImages(map, markers)
    if (version !== this.markersVersion || this.mapInstance !== map) return

    const data = {
      type: "FeatureCollection",
      features: markers.map((m) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: m.position },
        properties: {
          id: m.id,
          iconImage: imageKey(m),
          label: m.label ?? "",
          selected: m.selected ? 1 : 0,
          glowColor: m.glowColor ?? "",
        },
      })),
    } as GeoJSON.FeatureCollection
    ;(map.getSource(MARKER_SOURCE) as GeoJSONSource | undefined)?.setData(data)
  }

  /** Create the marker source + symbol layer and wire click/hover once. */
  private ensureMarkerLayers(map: MlMap): void {
    if (this.markerLayersReady) return
    if (!map.getSource(MARKER_SOURCE)) {
      map.addSource(MARKER_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      })
    }
    if (!map.getLayer(MARKER_SYMBOL_LAYER)) {
      map.addLayer({
        id: MARKER_SYMBOL_LAYER,
        type: "symbol",
        source: MARKER_SOURCE,
        layout: {
          "icon-image": ["get", "iconImage"],
          // The pin's tip is the bottom-centre of the image (PIN_ANCHOR), so it
          // sits exactly on the coordinate.
          "icon-anchor": "bottom",
          "icon-size": 1,
          // Always show every pin (no label-style decluttering); clustering is a
          // separate capability.
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      })
      map.on("click", MARKER_SYMBOL_LAYER, (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id
        if (id != null) this.markerClickListeners.forEach((cb) => cb(String(id)))
      })
      map.on("mouseenter", MARKER_SYMBOL_LAYER, () => {
        map.getCanvas().style.cursor = "pointer"
      })
      map.on("mouseleave", MARKER_SYMBOL_LAYER, () => {
        map.getCanvas().style.cursor = ""
      })
    }
    this.markerLayersReady = true
  }

  /** Ensure every distinct pin appearance in `markers` is in the image atlas. */
  private async ensureImages(map: MlMap, markers: MapMarkerSpec[]): Promise<void> {
    const missing = new Map<string, MapMarkerSpec>()
    for (const m of markers) {
      const key = imageKey(m)
      if (!this.addedImages.has(key) && !map.hasImage(key)) missing.set(key, m)
    }
    await Promise.all(
      [...missing].map(async ([key, spec]) => {
        try {
          const image = await rasterizePin(markerSrc(spec), PIN_RASTER_SCALE)
          if (this.mapInstance === map && !map.hasImage(key)) {
            map.addImage(key, image, { pixelRatio: PIN_RASTER_SCALE })
          }
          this.addedImages.add(key)
        } catch {
          // A single failed icon shouldn't break the whole set; that feature
          // just renders without an icon until a later pass succeeds.
        }
      }),
    )
  }

  resize(): void {
    ;(this.mapInstance as MlMap | null)?.resize()
  }

  // --- GlobeCapable ---
  setProjection(projection: MapProjection): void {
    ;(this.mapInstance as MlMap | null)?.setProjection({ type: projection })
  }

  /**
   * Style the globe's surrounding sky/atmosphere — the "space" behind the planet
   * when zoomed out. Only visible in globe projection. Maplibre-only (no
   * MapAdapter contract method); callers hold the concrete adapter.
   */
  setSky(sky: { skyColor?: string; horizonColor?: string; atmosphereBlend?: number }): void {
    const map = this.mapInstance as MlMap | null
    if (!map) return
    map.setSky({
      ...(sky.skyColor ? { "sky-color": sky.skyColor } : {}),
      ...(sky.horizonColor ? { "horizon-color": sky.horizonColor } : {}),
      ...(sky.atmosphereBlend != null ? { "atmosphere-blend": sky.atmosphereBlend } : {}),
    })
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

  private lngLatTuple(center: { lng: number; lat: number }): LngLat {
    return [center.lng, center.lat]
  }
}
