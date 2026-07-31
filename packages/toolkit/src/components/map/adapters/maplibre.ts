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
  GeoJSONFeatureDiff,
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
  MapBounds,
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
import {
  observeColorScheme,
  resolveColorScheme,
  type ColorScheme,
  type ColorSchemePreference,
} from "../../../lib/color-scheme"

/** Free, key-less vector styles (CORS-enabled). Override via MountOptions. */
const DEFAULT_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty"
const DEFAULT_STYLE_DARK = "https://tiles.openfreemap.org/styles/dark"
/** Light is what an unthemed caller (e.g. `prefetchMapLibre()`) still means. */
const DEFAULT_STYLE = DEFAULT_STYLE_LIGHT

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
/** Extra zoom added to a cluster's expansion zoom when easing in **globe**
 *  projection. The globe maps the camera zoom to a coarser effective tile zoom
 *  at low zoom, so easing to the bare expansion zoom often leaves the cluster
 *  still merged (needing a second click / nudge). A small margin reliably breaks
 *  it apart; over-zooming a hair is harmless. Mercator is exact (buffer 0). */
const CLUSTER_EXPANSION_GLOBE_BUFFER = 1
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
export async function prefetchMapLibre(styleUrl?: string): Promise<void> {
  await loadMapLibre().catch(() => {})
  // Warm the style the next mount will actually request, so a dark-themed app
  // does not prefetch the light style and then fetch the dark one anyway.
  const url =
    styleUrl ?? (resolveColorScheme() === "dark" ? DEFAULT_STYLE_DARK : DEFAULT_STYLE)
  await fetch(url, { mode: "cors" }).then((r) => r.ok && r.json()).catch(() => {})
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

// Cluster bubble colour = the most-represented marker colour among the leaves.
// Native clustering has no "mode" aggregation, and per-colour `clusterProperties`
// would have to be baked at source-creation — so a newly-appearing colour would
// force a source rebuild, which flashes the markers (the cluster re-clusters in
// a worker and renders empty meanwhile). Instead we accumulate the leaf colours
// into ONE colour-agnostic string (`colorList`); the source never needs
// rebuilding, and the dominant colour is computed in JS (below) and applied via
// `feature-state`. The `;`-separator keeps `#rrggbb` values parseable.
const CLUSTER_COLOR_SEP = ";"
const CLUSTER_COLOR_PROPERTIES = {
  colorList: [
    ["concat", ["accumulated"], ["get", "colorList"]],
    ["concat", ["get", "color"], CLUSTER_COLOR_SEP],
  ],
} as const

/**
 * Most-frequent colour in a `colorList` cluster property (a `;`-joined list of
 * the leaf marker colours). Ties resolve to the first one reaching the max.
 * Returns null for an empty/absent list (caller keeps the neutral fallback).
 */
function dominantColorFromList(list: unknown): string | null {
  if (typeof list !== "string" || list.length === 0) return null
  const counts = new Map<string, number>()
  let best: string | null = null
  let bestCount = 0
  for (const color of list.split(CLUSTER_COLOR_SEP)) {
    if (!color) continue
    const next = (counts.get(color) ?? 0) + 1
    counts.set(color, next)
    if (next > bestCount) {
      bestCount = next
      best = color
    }
  }
  return best
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
  // Clustering config (null = off). Read when the source is created; a radius/
  // on-off change rebuilds the source (`lastMarkers` re-applies data then). The
  // bubble colour does NOT depend on the source: it is computed per cluster in
  // JS and applied via feature-state, so colours never force a rebuild.
  private clusterConfig: { radius?: number } | null = null
  // Current projection — tracked so the cluster-expansion easeTo can compensate
  // for the globe's coarser effective tile zoom (see CLUSTER_EXPANSION_GLOBE_BUFFER).
  private currentProjection: MapProjection = "mercator"
  // Light/dark styles resolved at mount, plus the scheme currently rendered.
  // With preference "auto" an observer flips `currentScheme` (and the style)
  // when the app toggles its `dark` class, so the map re-themes in place
  // instead of needing a remount.
  private colorSchemePreference: ColorSchemePreference = "auto"
  private styleLight: string = DEFAULT_STYLE_LIGHT
  private styleDark: string = DEFAULT_STYLE_DARK
  private currentScheme: ColorScheme = "light"
  private stopColorSchemeObserver: (() => void) | null = null
  private lastMarkers: MapMarkerSpec[] = []
  // Rendered marker id → appearance hash. Lets `setMarkersAsync` push only the
  // delta via `GeoJSONSource.updateData` (add/update/remove) instead of a full
  // `setData`, which would reload + re-cluster the whole source in the worker
  // and briefly clear the markers (the flash). Cleared on teardown.
  private renderedMarkers = new Map<string, string>()
  private viewListeners = new Set<(view: MapViewState) => void>()
  private clickListeners = new Set<(event: MapClickEvent) => void>()
  private markerClickListeners = new Set<(markerId: string) => void>()
  private clusterClickListeners = new Set<(cluster: MapCluster) => void>()

  async mount(container: HTMLElement, options: MapMountOptions): Promise<void> {
    if (this.mapInstance) {
      throw new Error("MapLibreMapAdapter: already mounted")
    }
    const maplibre = await loadMapLibre()

    this.colorSchemePreference = options.colorScheme ?? "auto"
    this.styleLight = options.tileSource ?? DEFAULT_STYLE_LIGHT
    // A caller-pinned `tileSource` without a dark counterpart stays in force for
    // both schemes: swapping in OpenFreeMap-dark would silently discard their
    // style. Only the *default* light style has a matching dark sibling.
    this.styleDark = options.tileSourceDark ?? options.tileSource ?? DEFAULT_STYLE_DARK
    this.currentScheme = resolveColorScheme(this.colorSchemePreference)

    const map = new maplibre.Map({
      container,
      style: this.styleForScheme(this.currentScheme),
      center: options.center, // [lng, lat] — GeoJSON order, native to MapLibre
      zoom: options.zoom,
      // Add the attribution ourselves (below) so we can place + compact it.
      attributionControl: false,
      // No symbol fade: the cluster bubble (circle) updates instantly with the
      // source, but the count (symbol) would otherwise fade out over the default
      // 300ms — leaving the old number lingering/displaced as a cluster breaks
      // apart on zoom. 0 keeps the count in sync with its bubble.
      fadeDuration: 0,
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
    this.startColorSchemeObserver()
  }

  // --- Colour scheme ---

  private styleForScheme(scheme: ColorScheme): string {
    return scheme === "dark" ? this.styleDark : this.styleLight
  }

  /** Watch the app's `dark` class while the preference is `"auto"`. */
  private startColorSchemeObserver(): void {
    this.stopColorSchemeObserver?.()
    this.stopColorSchemeObserver = null
    if (this.colorSchemePreference !== "auto") return
    this.stopColorSchemeObserver = observeColorScheme((scheme) => this.applyScheme(scheme))
  }

  /**
   * Pin the map to a scheme, or hand it back to the app's `dark` class with
   * `"auto"`. Maplibre-only (no MapAdapter contract method); callers that want
   * explicit control hold the concrete adapter. Safe before mount — the choice
   * is then applied by `mount()`.
   */
  setColorScheme(preference: ColorSchemePreference): void {
    this.colorSchemePreference = preference
    this.startColorSchemeObserver()
    this.applyScheme(resolveColorScheme(preference))
  }

  /**
   * Swap the vector style in place. `setStyle` discards every source, layer and
   * image we added on top of the old style, so the marker bookkeeping is reset
   * and the whole marker set re-installed once the new style is live. Layer
   * event handlers survive: `map.on(type, layerId, …)` binds by layer *id*, not
   * by the layer object, so `markerEventsWired` deliberately stays true.
   */
  private applyScheme(scheme: ColorScheme): void {
    if (scheme === this.currentScheme) return
    this.currentScheme = scheme
    const map = this.mapInstance as MlMap | null
    if (!map) return

    // Two signals, because neither alone is enough. `styledata` fires as soon
    // as the new style document is set — too early to add sources onto — and
    // then does NOT reliably fire again once the style finishes. `idle` is
    // emitted whenever the map settles, so a later one always catches the
    // finished style. Both stay armed and are only consumed once the style is
    // genuinely loaded; adding sources to a half-built style would silently
    // lose them when it completes.
    const onSettled = () => {
      if (!map.isStyleLoaded()) return
      map.off("styledata", onSettled)
      map.off("idle", onSettled)
      if (this.mapInstance !== map) return

      // The reset belongs HERE, not before `setStyle`. Marker writes keep
      // arriving during the ~1s style load (a viewport change re-runs the app's
      // setMarkers), and those run against the still-current old style. Had the
      // bookkeeping been cleared up front, such a write would refill
      // `renderedMarkers` from the old style — and the delta computed below
      // would come out empty, pushing nothing onto the new, empty source. The
      // markers would stay gone until the next data change. Clearing at
      // re-install time makes the delta a full re-add, whatever happened
      // in between.
      this.markerLayersReady = false
      this.addedImages.clear()
      this.renderedMarkers.clear()
      // Projection is a style property, so it reset along with the style.
      map.setProjection({ type: this.currentProjection })
      this.reapplyMarkersSafely(this.lastMarkers)
    }
    map.on("styledata", onSettled)
    map.on("idle", onSettled)
    map.setStyle(this.styleForScheme(scheme))
  }

  async unmount(): Promise<void> {
    const map = this.mapInstance as MlMap | null
    if (!map) return
    // Source, layers and atlas images all go away with the map; just drop our
    // bookkeeping so a fresh mount re-creates them.
    this.stopColorSchemeObserver?.()
    this.stopColorSchemeObserver = null
    this.markerLayersReady = false
    this.markerEventsWired = false
    this.addedImages.clear()
    this.renderedMarkers.clear()
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
    // The cluster source is colour-agnostic (bubble colour comes from
    // feature-state, set in updateClusterColors), so it never needs rebuilding
    // when the visible marker colours change — no flash on pan/zoom.
    this.ensureMarkerLayers(map)
    const version = ++this.markersVersion
    await this.ensureImages(map, markers)
    if (version !== this.markersVersion || this.mapInstance !== map) return

    const source = map.getSource(MARKER_SOURCE) as GeoJSONSource | undefined
    if (!source) return

    // Push only the delta (add/update/remove by feature id). A full `setData`
    // reloads + re-clusters the whole source in a worker, which briefly clears
    // the rendered features — the marker/cluster flash on every viewport change.
    const add: GeoJSON.Feature[] = []
    const update: GeoJSONFeatureDiff[] = []
    const nextRendered = new Map<string, string>()
    for (const m of markers) {
      const properties = {
        id: m.id,
        iconImage: imageKey(m),
        label: m.label ?? "",
        selected: m.selected ? 1 : 0,
        glowColor: m.glowColor ?? "",
        color: m.color ?? DEFAULT_MARKER_COLOR,
      }
      const geometry: GeoJSON.Point = { type: "Point", coordinates: m.position }
      // Appearance hash — any change re-pushes just this feature.
      const hash = `${m.position[0]},${m.position[1]}|${properties.iconImage}|${properties.selected}|${properties.glowColor}|${properties.color}|${properties.label}`
      nextRendered.set(m.id, hash)
      const prev = this.renderedMarkers.get(m.id)
      if (prev === undefined) {
        add.push({ type: "Feature", id: m.id, geometry, properties })
      } else if (prev !== hash) {
        update.push({
          id: m.id,
          newGeometry: geometry,
          addOrUpdateProperties: Object.entries(properties).map(([key, value]) => ({ key, value })),
        })
      }
    }
    const remove: string[] = []
    for (const id of this.renderedMarkers.keys()) {
      if (!nextRendered.has(id)) remove.push(id)
    }
    this.renderedMarkers = nextRendered
    if (add.length === 0 && update.length === 0 && remove.length === 0) return
    source.updateData({ add, update, remove })
    // Re-cluster runs in the worker; the `data` listener (wireMarkerEvents)
    // re-colours clusters once it completes. This call covers the already-idle case.
    this.updateClusterColors(map)
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
              clusterProperties: CLUSTER_COLOR_PROPERTIES as unknown as Record<string, unknown>,
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
          // Fill = most-represented marker colour in the cluster (set per
          // cluster via feature-state in updateClusterColors), neutral until
          // then; white ring.
          "circle-color": ["coalesce", ["feature-state", "color"], CLUSTER_COLOR] as never,
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
          .then((zoom) => {
            // Globe needs a small extra push past the expansion zoom (its camera
            // zoom maps to a coarser effective tile zoom), else the cluster often
            // stays merged. Mercator is exact.
            const target =
              this.currentProjection === "globe" ? zoom + CLUSTER_EXPANSION_GLOBE_BUFFER : zoom
            map.easeTo({ center: position, zoom: target })
          })
          .catch(() => {})
      }
    })
    map.on("mouseenter", CLUSTER_CIRCLE_LAYER, () => {
      map.getCanvas().style.cursor = "pointer"
    })
    map.on("mouseleave", CLUSTER_CIRCLE_LAYER, () => {
      map.getCanvas().style.cursor = ""
    })
    // Cluster bubble colours are feature-state, computed in JS from each
    // cluster's leaf colours. Recompute when the source finishes (re)clustering
    // and after viewport changes (clusters merge/split with zoom). Setting it in
    // the synchronous `data` handler means it lands before the next paint — the
    // cluster shows its dominant colour immediately, no neutral flash.
    map.on("data", (e) => {
      const ev = e as { sourceId?: string; isSourceLoaded?: boolean; dataType?: string }
      if (ev.dataType === "source" && ev.sourceId === MARKER_SOURCE && ev.isSourceLoaded) {
        this.updateClusterColors(map)
      }
    })
    map.on("moveend", () => this.updateClusterColors(map))
    this.markerEventsWired = true
  }

  /**
   * Colour every visible cluster bubble by its dominant leaf colour. The source
   * itself is colour-agnostic; each cluster carries an accumulated `colorList`
   * property (the `;`-joined leaf colours), available synchronously from
   * `querySourceFeatures`. We pick the most frequent colour and apply it via
   * feature-state (keyed by `cluster_id`), which the bubble's `circle-color`
   * reads. No-op while clustering is off or the layer is gone.
   */
  private updateClusterColors(map: MlMap): void {
    if (!this.clusterConfig || !map.getLayer(CLUSTER_CIRCLE_LAYER)) return
    let clusters: Array<{ id?: string | number; properties?: Record<string, unknown> | null }>
    try {
      clusters = map.querySourceFeatures(MARKER_SOURCE, {
        filter: ["has", "point_count"],
      }) as never
    } catch {
      return // source not query-ready yet
    }
    for (const f of clusters) {
      if (f.id == null) continue
      const color = dominantColorFromList(f.properties?.colorList)
      if (color) map.setFeatureState({ source: MARKER_SOURCE, id: f.id }, { color })
    }
  }

  /** Remove the marker source + layers so they can be rebuilt with new source
   *  settings (clustering on/off, or a changed cluster radius). Wired event
   *  handlers persist (keyed by layer id) and are not re-added. */
  private teardownMarkerLayers(map: MlMap): void {
    for (const id of [CLUSTER_COUNT_LAYER, CLUSTER_CIRCLE_LAYER, MARKER_SYMBOL_LAYER, MARKER_GLOW_LAYER]) {
      if (map.getLayer(id)) map.removeLayer(id)
    }
    if (map.getSource(MARKER_SOURCE)) map.removeSource(MARKER_SOURCE)
    this.markerLayersReady = false
    // The new source starts empty → forget what was rendered so the next
    // setMarkers re-adds every feature.
    this.renderedMarkers.clear()
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
    this.currentProjection = projection
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

  fitBounds(bounds: MapBounds): void {
    const map = this.mapInstance as MlMap | null
    if (!map) return
    map.fitBounds([
      [bounds.west, bounds.south],
      [bounds.east, bounds.north],
    ])
  }

  focusOn(
    center: LngLat,
    options?: { bottomInset?: number; animate?: boolean; zoom?: number; duration?: number },
  ): void {
    const map = this.mapInstance as MlMap | null
    if (!map) return
    const bottomInset = options?.bottomInset ?? 0
    // Offset the target up by half the obscured strip so it ends up centred in
    // the visible map area above a bottom sheet. Negative y = up (maplibre uses
    // a per-move `offset` so no persistent camera padding is left behind).
    const offset: [number, number] = [0, -bottomInset / 2]
    const animate = options?.animate !== false
    if (options?.zoom != null) {
      // A zoom change is a "fly to this place" gesture: flyTo's eased, curved
      // zoom+pan stays smooth even over a big delta and lets tiles load, where a
      // fast easeTo would visibly race in. Calm default duration.
      map.flyTo({
        center,
        zoom: options.zoom,
        offset,
        duration: animate ? options?.duration ?? 1500 : 0,
        // `essential` so the reveal still animates (and honours `duration`) under
        // an OS "reduce motion" setting, which maplibre otherwise snaps instant.
        essential: true,
      })
    } else {
      map.easeTo({ center, offset, duration: animate ? options?.duration ?? 500 : 0, essential: true })
    }
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
