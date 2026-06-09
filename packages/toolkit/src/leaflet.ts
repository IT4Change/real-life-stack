/**
 * Subpath entry for the Leaflet map adapter.
 *
 * Import via:
 *   import { LeafletMapAdapter } from "@real-life-stack/toolkit/leaflet"
 *
 * This entry is intentionally separate from the main toolkit entry so that
 * `leaflet` stays an optional peer dependency: consumers that never use the
 * map module do not pull leaflet into their dependency graph or bundle.
 */

export { LeafletMapAdapter } from "./components/map/adapters/leaflet"
