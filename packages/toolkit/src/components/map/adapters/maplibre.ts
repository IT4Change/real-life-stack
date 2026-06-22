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
  AttributionControl as MlAttributionControl,
  AttributionControlOptions,
} from "maplibre-gl"
import type {
  ClusterCapable,
  GlobeCapable,
  LngLat,
  MapAdapter,
  MapCluster,
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
const MARKER_GLOW_LAYER = "rls-marker-glow"
const CLUSTER_CIRCLE_LAYER = "rls-marker-clusters"
const CLUSTER_COUNT_LAYER = "rls-marker-cluster-count"
/** Neutral cluster-bubble colour (spec allows a neutral default; dominant
 *  group colour would need mode aggregation — a later refinement). */
const CLUSTER_COLOR = "#475569"
const DEFAULT_CLUSTER_RADIUS = 50
/** Rasterise the pin SVG at 2× so the GPU icon stays crisp on retina. */
const PIN_RASTER_SCALE = 2
/** Logical-px padding baked around the pin so its drop shadow isn't clipped.
 *  The symbol layer compensates with `icon-offset` so the tip stays on the
 *  coordinate. */
const PIN_SHADOW_PAD = 9

// MapLibre's module shape mirrors its namespace. The two constructors we use
// are typed against the real maplibre-gl option types so the mount/marker calls
// are validated at compile time; this type is internal and never exported, so
// no maplibre-gl reference leaks into the generated `.d.ts`.
type MapLibreModule = {
  Map: new (options: MapOptions) => MlMap
  Marker: new (options?: MarkerOptions) => MlMarker
  NavigationControl: new (options?: NavigationControlOptions) => MlNavigationControl
  AttributionControl: new (options?: AttributionControlOptions) => MlAttributionControl
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
  // Pad the canvas so the baked drop shadow has room (a symbol-layer icon can't
  // carry a CSS filter, so the shadow must be in the image).
  const w = (PIN_SIZE.width + PIN_SHADOW_PAD * 2) * scale
  const h = (PIN_SIZE.height + PIN_SHADOW_PAD * 2) * scale
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("MapLibreMapAdapter: no 2D context for pin rasterisation")
  // Work in device pixels (no ctx.scale — shadow blur/offset don't transform
  // reliably across browsers). Bake a clear drop shadow under the pin.
  ctx.shadowColor = "rgba(0,0,0,0.45)"
  ctx.shadowBlur = 5 * scale
  ctx.shadowOffsetY = 3 * scale
  ctx.drawImage(
    img,
    PIN_SHADOW_PAD * scale,
    PIN_SHADOW_PAD * scale,
    PIN_SIZE.width * scale,
    PIN_SIZE.height * scale,
  )
  return ctx.getImageData(0, 0, w, h)
}

/**
 * `clusterProperties` that count, per cluster, how many points carry each
 * distinct marker colour (`clr0`, `clr1`, …) — the basis for the dominant
 * colour. (Native clustering has no built-in "mode" aggregation.)
 */
function clusterColorCounts(colorSet: string[]): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  colorSet.forEach((color, i) => {
    props[`clr${i}`] = ["+", ["case", ["==", ["get", "color"], color], 1, 0]]
  })
  return props
}

/**
 * A `circle-color` expression returning the colour with the highest `clrN` count
 * (the most-represented marker colour in a cluster). Ties resolve to the first
 * in the (sorted) colour set; empty/one-colour sets short-circuit; a neutral
 * `fallback` covers the rest.
 */
function dominantClusterColor(colorSet: string[], fallback: string): unknown {
  if (colorSet.length === 0) return fallback
  if (colorSet.length === 1) return colorSet[0]
  const counts = colorSet.map((_, i) => ["get", `clr${i}`])
  const cases: unknown[] = []
  colorSet.forEach((color, i) => {
    cases.push(["==", ["get", `clr${i}`], ["var", "m"]], color)
  })
  return ["let", "m", ["max", ...counts], ["case", ...cases, fallback]]
}

export class MapLibreMapAdapter implements MapAdapter, GlobeCapable, ClusterCapable {
  // Internal MapLibre handles are held as `unknown` so the generated `.d.ts`
  // does not reference `maplibre-gl`. Consumers without it installed can
  // import the toolkit without TS errors.
  private mapInstance: unknown = null
  // WebGL markers: a GeoJSON source + symbol layer, plus an image atlas keyed by
  // appearance. `markersVersion` ignores stale setData after async image loads.
  private markerLayersReady = false
  private addedImages = new Set<string>()
  private markersVersion = 0
  // Clustering config (null = off). Read when the source is (re)created; a change
  // after the source exists triggers a rebuild. `lastMarkers` re-applies data then.
  private clusterConfig: { radius?: number } | null = null
  // Distinct marker colours the cluster bubbles are coloured by (dominant colour
  // per cluster). A change rebuilds the source (clusterProperties depend on it).
  private clusterColorSet: string[] = []
  private lastMarkers: MapMarkerSpec[] = []
  private viewListeners = new Set<(view: MapViewState) => void>()
  private clickListeners = new Set<(event: MapClickEvent) => void>()
  private markerClickListeners = new Set<(markerId: string) => void>()
  private clusterClickListeners = new Set<(cluster: MapCluster) => void>()

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
      // Add the attribution ourselves (below) so we can place + compact it.
      attributionControl: false,
    })

    // Zoom control top-left, matching the Leaflet adapter's default placement.
    map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left")
    // Compact attribution bottom-LEFT (a small "ⓘ" that expands to the right on
    // click) — out of the way of the bottom-right create FAB.
    map.addControl(
      new maplibre.AttributionControl({ compact: true, customAttribution: options.attribution }),
      "bottom-left",
    )
    // MapLibre's compact attribution starts EXPANDED (its `_updateCompact` adds
    // `maplibregl-compact-show` on add and re-adds it on every resize). Collapse
    // it on add and after each resize so it starts (and stays) as just the "ⓘ"
    // until the user clicks it.
    const collapseAttribution = () => {
      map
        .getContainer()
        .querySelector(".maplibregl-ctrl-attrib")
        ?.classList.remove("maplibregl-compact-show")
    }
    collapseAttribution()
    map.on("resize", collapseAttribution)

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
    // Source, layers and atlas images all go away with the map; just drop our
    // bookkeeping so a fresh mount re-creates them.
    this.markerLayersReady = false
    this.markerEventsWired = false
    this.addedImages.clear()
    this.lastMarkers = []
    map.remove()
    this.mapInstance = null
    this.viewListeners.clear()
    this.clickListeners.clear()
    this.markerClickListeners.clear()
    this.clusterClickListeners.clear()
  }

  setMarkers(markers: MapMarkerSpec[]): void {
    // Keep the synchronous "called before mount" contract (the old DOM path threw
    // here). The actual work runs detached (image loading is async); its rejection
    // is handled so it never surfaces as an unhandled promise rejection.
    if (!this.mapInstance) {
      throw new Error("MapLibreMapAdapter: setMarkers called before mount")
    }
    this.reapplyMarkersSafely(markers)
  }

  /**
   * Run the async marker pipeline detached, with its rejection always handled so
   * it can never surface as an unhandled promise rejection. Shared by the
   * synchronous fire-and-forget entry points — `setMarkers` and the
   * `setClusterConfig` rebuild — both of which keep a sync signature while the
   * underlying work (image loading, `setData`) is genuinely async.
   */
  private reapplyMarkersSafely(markers: MapMarkerSpec[]): void {
    void this.setMarkersAsync(markers).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("MapLibreMapAdapter: applying markers failed", err)
    })
  }

  /**
   * Declarative marker set, rendered as one GeoJSON source + symbol layer.
   * Loading the needed pin images is async, so a version token drops the result
   * if a newer `setMarkers` call started meanwhile (last-write-wins).
   */
  private async setMarkersAsync(markers: MapMarkerSpec[]): Promise<void> {
    const map = this.mapInstance as MlMap | null
    if (!map) return
    this.lastMarkers = markers
    // The cluster bubble colour depends on the distinct marker colours (via
    // clusterProperties); when that set changes, the source must be rebuilt.
    if (this.clusterConfig) {
      const colorSet = Array.from(
        new Set(markers.map((m) => m.color ?? DEFAULT_MARKER_COLOR)),
      ).sort()
      if (colorSet.join("|") !== this.clusterColorSet.join("|")) {
        this.clusterColorSet = colorSet
        if (this.markerLayersReady) this.teardownMarkerLayers(map)
      }
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
          color: m.color ?? DEFAULT_MARKER_COLOR,
        },
      })),
    } as GeoJSON.FeatureCollection
    ;(map.getSource(MARKER_SOURCE) as GeoJSONSource | undefined)?.setData(data)
  }

  /**
   * Create the marker source + layers (idempotent; re-runnable on a cluster
   * rebuild). All layers carry `point_count` filters, so the same layer set
   * works clustered or not: pins/glow only on unclustered points, cluster
   * bubble/count only on cluster features.
   */
  private ensureMarkerLayers(map: MlMap): void {
    if (this.markerLayersReady) return
    if (!map.getSource(MARKER_SOURCE)) {
      map.addSource(MARKER_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        ...(this.clusterConfig
          ? {
              cluster: true,
              clusterRadius: this.clusterConfig.radius ?? DEFAULT_CLUSTER_RADIUS,
              clusterMaxZoom: 14,
              clusterProperties: clusterColorCounts(this.clusterColorSet),
            }
          : {}),
      })
    }
    // Glow halo behind the selected (unclustered) pin, in its group colour.
    if (!map.getLayer(MARKER_GLOW_LAYER)) {
      map.addLayer({
        id: MARKER_GLOW_LAYER,
        type: "circle",
        source: MARKER_SOURCE,
        filter: ["all", ["==", ["get", "selected"], 1], ["!", ["has", "point_count"]]],
        paint: {
          "circle-color": ["get", "glowColor"],
          // Larger than the pin so the halo reads around it (a small circle hides
          // behind the opaque pin body). Translated up onto the pin body (the
          // coordinate is the tip).
          "circle-radius": 26,
          "circle-blur": 0.7,
          "circle-opacity": 0.65,
          "circle-translate": [0, -26],
          "circle-translate-anchor": "viewport",
        },
      })
    }
    // Cluster bubble + count — present only when the source clusters.
    if (!map.getLayer(CLUSTER_CIRCLE_LAYER)) {
      map.addLayer({
        id: CLUSTER_CIRCLE_LAYER,
        type: "circle",
        source: MARKER_SOURCE,
        filter: ["has", "point_count"],
        paint: {
          // Fill = most-represented marker colour in the cluster, white ring.
          "circle-color": dominantClusterColor(this.clusterColorSet, CLUSTER_COLOR) as never,
          "circle-opacity": 0.9,
          "circle-radius": ["step", ["get", "point_count"], 16, 25, 20, 100, 26],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      })
    }
    if (!map.getLayer(CLUSTER_COUNT_LAYER)) {
      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: MARKER_SOURCE,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold", "Noto Sans Regular"],
          "text-size": 13,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#ffffff" },
      })
    }
    // Pins — only unclustered points.
    if (!map.getLayer(MARKER_SYMBOL_LAYER)) {
      map.addLayer({
        id: MARKER_SYMBOL_LAYER,
        type: "symbol",
        source: MARKER_SOURCE,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ["get", "iconImage"],
          // The pin's tip is the bottom-centre of the pin within the image; the
          // image has PIN_SHADOW_PAD extra below it, so shift down by that pad to
          // keep the tip on the coordinate ("bottom" anchors the padded bottom).
          "icon-anchor": "bottom",
          "icon-offset": [0, PIN_SHADOW_PAD],
          "icon-size": 1,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      })
    }
    this.wireMarkerEvents(map)
    this.markerLayersReady = true
  }

  /**
   * Click/hover handlers. Wired once: MapLibre keys layer-scoped listeners by
   * layer id, so they survive a layer remove/re-add (cluster rebuild) and must
   * not be added again.
   */
  private markerEventsWired = false
  private wireMarkerEvents(map: MlMap): void {
    if (this.markerEventsWired) return
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
    // Cluster click → notify listeners + zoom in until the cluster breaks apart.
    map.on("click", CLUSTER_CIRCLE_LAYER, (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f) return
      const props = (f.properties ?? {}) as { cluster_id?: number; point_count?: number }
      const clusterId = props.cluster_id
      const position: LngLat =
        f.geometry.type === "Point" ? (f.geometry.coordinates as LngLat) : [e.lngLat.lng, e.lngLat.lat]
      this.clusterClickListeners.forEach((cb) =>
        cb({ id: String(clusterId), count: Number(props.point_count ?? 0), position }),
      )
      const src = map.getSource(MARKER_SOURCE) as GeoJSONSource | undefined
      if (src && clusterId != null) {
        src
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => map.easeTo({ center: position, zoom }))
          .catch(() => {})
      }
    })
    map.on("mouseenter", CLUSTER_CIRCLE_LAYER, () => {
      map.getCanvas().style.cursor = "pointer"
    })
    map.on("mouseleave", CLUSTER_CIRCLE_LAYER, () => {
      map.getCanvas().style.cursor = ""
    })
    this.markerEventsWired = true
  }

  /** Remove the marker source + layers so they can be rebuilt with new source
   *  settings (clustering on/off, or a changed cluster colour set). Wired event
   *  handlers persist (keyed by layer id) and are not re-added. */
  private teardownMarkerLayers(map: MlMap): void {
    for (const id of [CLUSTER_COUNT_LAYER, CLUSTER_CIRCLE_LAYER, MARKER_SYMBOL_LAYER, MARKER_GLOW_LAYER]) {
      if (map.getLayer(id)) map.removeLayer(id)
    }
    if (map.getSource(MARKER_SOURCE)) map.removeSource(MARKER_SOURCE)
    this.markerLayersReady = false
  }

  // --- ClusterCapable ---
  setClusterConfig(config: { radius?: number } | null): void {
    const wasOn = !!this.clusterConfig
    const prevRadius = this.clusterConfig?.radius ?? DEFAULT_CLUSTER_RADIUS
    this.clusterConfig = config
    if (wasOn === !!config && prevRadius === (config?.radius ?? DEFAULT_CLUSTER_RADIUS)) return
    const map = this.mapInstance as MlMap | null
    // Not built yet → ensureMarkerLayers will pick up the new config on first use.
    if (!map || !this.markerLayersReady) return
    // `cluster` is a source-creation property → rebuild, then re-apply markers
    // through the same guarded path as `setMarkers` (no unhandled rejection).
    this.teardownMarkerLayers(map)
    this.reapplyMarkersSafely(this.lastMarkers)
  }

  observeClusterClicks(callback: (cluster: MapCluster) => void): Unsubscribe {
    this.clusterClickListeners.add(callback)
    return () => {
      this.clusterClickListeners.delete(callback)
    }
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
