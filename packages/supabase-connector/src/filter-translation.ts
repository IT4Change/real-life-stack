import type { ItemFilter } from "@real-life-stack/data-interface"
import type { FilterBuilderLike } from "./client-types.js"

/**
 * hasField filters become PostgREST json-path expressions (`data->key`) —
 * the key is interpolated into query syntax, so only plain identifiers are
 * expressible. Anything else fails CLOSED instead of producing a malformed
 * (or injected) query.
 */
const SAFE_FIELD_NAME = /^[A-Za-z0-9_-]+$/

/** Server-side page size cap (matches PostgREST max_rows in config.toml). */
const MAX_ROWS = 1000

/**
 * Translate an ItemFilter to PostgREST filter calls. Semantics must match
 * `matchesFilter` (data-interface base-connector) — the live contract suite
 * is the referee. One documented divergence: `hasField` uses `NOT data->key
 * IS NULL`, so a field explicitly set to JSON null counts as absent here
 * while `field in data` counts it as present.
 */
export function applyItemFilter<Q extends FilterBuilderLike>(query: Q, filter?: ItemFilter): Q {
  if (!filter) return stableOrder(query)
  if (filter.type) query = query.eq("type", filter.type)
  if (filter.createdBy) query = query.eq("created_by", filter.createdBy)
  if (filter.hasTag && filter.hasTag.length > 0) query = query.contains("tags", filter.hasTag)
  if (filter.hasSchema && filter.hasSchema.length > 0) query = query.contains("context", filter.hasSchema)
  if (filter.hasField) {
    for (const field of filter.hasField) {
      if (!SAFE_FIELD_NAME.test(field)) {
        throw new Error(`hasField: unsupported field name for server-side filtering: ${JSON.stringify(field)}`)
      }
      query = query.not(`data->${field}`, "is", null)
    }
  }
  if (filter.bbox) {
    // data.position.coordinates = [lng, lat] (GeoJSON). jsonb path filters
    // compare numbers numerically; items without a parsable position resolve
    // the path to NULL and drop out — exactly the contract.
    const [west, south, east, north] = filter.bbox
    query = query
      .gte("data->position->coordinates->0", west)
      .lte("data->position->coordinates->0", east)
      .gte("data->position->coordinates->1", south)
      .lte("data->position->coordinates->1", north)
  }
  query = stableOrder(query)
  if (filter.limit !== undefined || filter.offset !== undefined) {
    const offset = filter.offset ?? 0
    const limit = filter.limit ?? MAX_ROWS
    query = query.range(offset, offset + limit - 1) as Q
  }
  return query
}

/** Deterministic order so limit/offset form a stable window. */
function stableOrder<Q extends FilterBuilderLike>(query: Q): Q {
  return query.order("created_at", { ascending: true }).order("id", { ascending: true }) as Q
}
