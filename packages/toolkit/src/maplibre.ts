/**
 * Subpath entry for the MapLibre GL map adapter.
 *
 * Import via:
 *   import { MapLibreMapAdapter } from "@real-life-stack/toolkit/maplibre"
 *
 * This entry is intentionally separate from the main toolkit entry so that
 * `maplibre-gl` stays an optional peer dependency: consumers that never use
 * the vector map do not pull maplibre-gl into their dependency graph or bundle.
 */

export { MapLibreMapAdapter } from "./components/map/adapters/maplibre"
