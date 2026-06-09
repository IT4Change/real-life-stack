/**
 * Map module exports.
 *
 * Adapter contract:        ./adapter
 * Concrete adapters:       ./adapters/*
 *
 * Consumers that want to use a specific library import the adapter directly,
 * e.g. `import { LeafletMapAdapter } from "@real-life-stack/toolkit"`.
 *
 * The leaflet adapter requires the consumer to load `leaflet/dist/leaflet.css`
 * (e.g. once at app entry).
 */

export type {
  LngLat,
  MapBounds,
  MapMountOptions,
  MapMarkerSpec,
  MapViewState,
  MapClickEvent,
  MapAdapter,
  Unsubscribe,
} from "./adapter"

export { LeafletMapAdapter } from "./adapters/leaflet"
