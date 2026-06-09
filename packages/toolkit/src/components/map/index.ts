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
} from "./adapter"
