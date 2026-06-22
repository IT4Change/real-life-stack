/**
 * Map module barrel.
 *
 * This barrel intentionally exports only the **library-agnostic** Map module
 * surface — the `MapAdapter` contract and supporting types. It does NOT
 * re-export concrete adapter implementations (Leaflet, MapLibre, …).
 *
 * Concrete adapters live behind dedicated subpath entries so that consumers
 * which never construct a Leaflet map are not forced to install or bundle
 * `leaflet`:
 *
 *   import { LeafletMapAdapter } from "@real-life-stack/toolkit/leaflet"
 */

export type {
  LngLat,
  MapBounds,
  MapMountOptions,
  MapMarkerSpec,
  MapViewState,
  MapViewPatch,
  MapClickEvent,
  MapAdapter,
  Unsubscribe,
  GlobeCapable,
  MapProjection,
  ClusterCapable,
  MapCluster,
} from "./adapter"

// Capability type-guards are runtime values (not types), so they ship as a
// regular export.
export { hasGlobe, hasCluster } from "./adapter"

// Marker rendering is library-agnostic (pure SVG), so it lives in the barrel
// alongside the contract — both adapters render markers through it.
export {
  renderMarkerSvg,
  markerDataUrl,
  MARKER_SHAPES,
  DEFAULT_SHAPE,
  PIN_ANCHOR,
  PIN_SIZE,
  PIN_VIEWBOX,
  type RenderMarkerOptions,
  type MarkerShape,
} from "./markers"
