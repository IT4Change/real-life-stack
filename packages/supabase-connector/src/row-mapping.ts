import type { Group, Item, Relation, User } from "@real-life-stack/data-interface"

/** Column layout of public.items (supabase/migrations/0001_rls_schema.sql). */
export interface ItemRow {
  id: string
  type: string
  created_by: string
  created_at: string
  context: string[] | null
  schema: string | null
  schema_version: number | null
  data: Record<string, unknown>
  relations: Relation[] | null
  tags: string[] | null
  group_id: string | null
}

/** Normalize Postgres timestamptz output to the interface's ISO-8601 form. */
function isoTimestamp(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

/** Nullable columns normalize to ABSENT members, matching the Item type. */
export function rowToItem(row: Record<string, unknown>): Item {
  const r = row as unknown as ItemRow
  return {
    id: r.id,
    type: r.type,
    createdBy: r.created_by,
    createdAt: isoTimestamp(r.created_at),
    ...(r.context != null ? { "@context": r.context } : {}),
    ...(r.schema != null ? { schema: r.schema } : {}),
    ...(r.schema_version != null ? { schemaVersion: r.schema_version } : {}),
    data: r.data ?? {},
    ...(r.relations != null ? { relations: r.relations } : {}),
    ...(r.tags != null ? { tags: r.tags } : {}),
  }
}

export interface ItemInsert {
  id?: string
  type: string
  createdBy: string
  "@context"?: string[]
  schema?: string
  schemaVersion?: number
  data: Record<string, unknown>
  relations?: Relation[]
  tags?: string[]
}

export function itemToInsertRow(item: ItemInsert, groupId: string | null): Record<string, unknown> {
  return {
    ...(item.id !== undefined ? { id: item.id } : {}),
    type: item.type,
    created_by: item.createdBy,
    ...(item["@context"] !== undefined ? { context: item["@context"] } : {}),
    ...(item.schema !== undefined ? { schema: item.schema } : {}),
    ...(item.schemaVersion !== undefined ? { schema_version: item.schemaVersion } : {}),
    data: item.data ?? {},
    ...(item.relations !== undefined ? { relations: item.relations } : {}),
    ...(item.tags !== undefined ? { tags: item.tags } : {}),
    group_id: groupId,
  }
}

/** Partial<Item> → column patch. Identity fields are never part of a patch:
    created_by/id/type are immutable server-side (trigger); the connector
    additionally strips them so a manipulated caller fails closed locally. */
export function itemUpdateToRowPatch(updates: Partial<Item>): Record<string, unknown> {
  return {
    ...("@context" in updates ? { context: updates["@context"] ?? null } : {}),
    ...("schema" in updates ? { schema: updates.schema ?? null } : {}),
    ...("schemaVersion" in updates ? { schema_version: updates.schemaVersion ?? null } : {}),
    ...("data" in updates ? { data: updates.data ?? {} } : {}),
    ...("relations" in updates ? { relations: updates.relations ?? null } : {}),
    ...("tags" in updates ? { tags: updates.tags ?? null } : {}),
  }
}

export interface GroupRow {
  id: string
  name: string
  data: Record<string, unknown>
  created_by: string
  created_at: string
}

export function rowToGroup(row: Record<string, unknown>, members?: string[]): Group {
  const r = row as unknown as GroupRow
  return {
    id: r.id,
    name: r.name,
    ...(members !== undefined ? { members } : {}),
    data: r.data ?? {},
  }
}

export interface ProfileRow {
  id: string
  display_name: string | null
  avatar_url: string | null
}

export function profileToUser(row: Record<string, unknown>): User {
  const r = row as unknown as ProfileRow
  return {
    id: r.id,
    ...(r.display_name != null ? { displayName: r.display_name } : {}),
    ...(r.avatar_url != null ? { avatarUrl: r.avatar_url } : {}),
  }
}
