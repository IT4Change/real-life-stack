/**
 * Minimal GeoJSON Point helpers for use inside RLS UI.
 * Spec reference: docs/spec/modules/map.md — `data.position` is a GeoJSON Geometry.
 *
 * We intentionally avoid pulling in `@types/geojson` for the toolkit;
 * the Point shape is small and well-defined.
 */

export interface GeoJSONPoint {
  type: "Point"
  /** GeoJSON convention: [longitude, latitude, optional elevation] */
  coordinates: [number, number, elevation?: number]
}

/** Build a GeoJSON Point from latitude / longitude (any order, named). */
export function pointFromLatLng(lat: number, lng: number): GeoJSONPoint {
  return { type: "Point", coordinates: [lng, lat] }
}

/** Extract { lat, lng } from a GeoJSON Point. Returns null for any other geometry. */
export function latLngFromPoint(point: unknown): { lat: number; lng: number } | null {
  if (!point || typeof point !== "object") return null
  const p = point as Record<string, unknown>
  if (
    p.type !== "Point" ||
    !Array.isArray(p.coordinates) ||
    p.coordinates.length < 2 ||
    p.coordinates.length > 3 ||
    !p.coordinates.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
  ) return null
  const [lng, lat] = p.coordinates
  if (
    lng < -180 || lng > 180 ||
    lat < -90 || lat > 90
  ) return null
  return { lat, lng }
}

/** Type guard: is the value a usable GeoJSON Point? */
export function isPoint(value: unknown): value is GeoJSONPoint {
  return latLngFromPoint(value) !== null
}
