import { createClient } from "@supabase/supabase-js"
import type { SupabaseClientLike } from "./client-types.js"
import { SupabaseConnector, type SupabaseConnectorOptions } from "./supabase-connector.js"

export { SupabaseConnector, type SupabaseConnectorOptions } from "./supabase-connector.js"
export type {
  SupabaseClientLike,
  FilterBuilderLike,
  TableLike,
  ChannelLike,
  RealtimePayloadLike,
  SupabaseResult,
} from "./client-types.js"
export { applyItemFilter } from "./filter-translation.js"
export { rowToItem, itemToInsertRow, itemUpdateToRowPatch, rowToGroup, profileToUser } from "./row-mapping.js"

/**
 * Convenience factory: real supabase-js client + connector in one call.
 * The concrete client is structurally adapted to the narrow interface the
 * connector is written (and unit-tested) against.
 */
export function createSupabaseConnector(
  url: string,
  anonKey: string,
  options?: SupabaseConnectorOptions,
): SupabaseConnector {
  const client = createClient(url, anonKey)
  return new SupabaseConnector(client as unknown as SupabaseClientLike, options)
}
