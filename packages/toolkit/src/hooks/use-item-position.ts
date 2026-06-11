import { useMemo } from "react"
import type { Item } from "@real-life-stack/data-interface"
import type { LngLat } from "../components/map/adapter"

const PLACE_GEOMETRY_TYPES = new Set(["Point", "LineString", "Polygon"])

/**
 * Extracts a position hint from an item's `data.position`.
 *
 * Spec: docs/spec/06-schema-composition.md (place/v1). An item is
 * considered place-renderable when `data.position` is a GeoJSON
 * geometry the place vocabulary accepts (Point, LineString, Polygon).
 *
 * Returns:
 * - `isPlace`: true if the item carries a valid place geometry
 * - `point`: the centroid/first coordinate as [lng, lat] when present,
 *   otherwise null. Map adapters can use this directly for markers;
 *   line/polygon centroids are simplified to the first point — full
 *   centroid math is left to the adapter when it cares.
 */
export interface ItemPosition {
  isPlace: boolean
  point: LngLat | null
}

export function useItemPosition(item: Item | null | undefined): ItemPosition {
  return useMemo(() => extractItemPosition(item), [item])
}

/** Pure extraction logic; exported for tests and non-React callers. */
export function extractItemPosition(item: Item | null | undefined): ItemPosition {
  const value = item?.data?.position
  if (typeof value !== "object" || value === null) return { isPlace: false, point: null }
  const v = value as Record<string, unknown>
  if (typeof v.type !== "string" || !PLACE_GEOMETRY_TYPES.has(v.type)) {
    return { isPlace: false, point: null }
  }
  const coords = v.coordinates
  if (!Array.isArray(coords) || coords.length === 0) return { isPlace: true, point: null }

  // Point: [lng, lat]; LineString: [[lng,lat], ...]; Polygon: [[[lng,lat], ...], ...]
  let point: unknown
  if (v.type === "Point") point = coords
  else if (v.type === "LineString") point = coords[0]
  else point = (coords[0] as unknown[])?.[0]

  if (!Array.isArray(point) || point.length < 2) return { isPlace: true, point: null }
  if (typeof point[0] !== "number" || typeof point[1] !== "number") return { isPlace: true, point: null }
  return { isPlace: true, point: [point[0], point[1]] }
}
