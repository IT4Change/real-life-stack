import type { Item } from "@real-life-stack/data-interface"
import type { SerializedItem } from "./types.js"

export function serializeItem(item: Item): SerializedItem {
  const serialized: SerializedItem = {
    id: item.id,
    type: item.type,
    createdAt: item.createdAt,
    createdBy: item.createdBy,
    data: { ...item.data },
  }
  if (item["@context"]?.length) serialized["@context"] = item["@context"]
  if (item.schema) serialized.schema = item.schema
  if (item.schemaVersion != null) serialized.schemaVersion = item.schemaVersion
  if (item.relations?.length) serialized.relations = item.relations
  if (item.tags?.length) serialized.tags = item.tags
  if (item.updatedAt) serialized.updatedAt = item.updatedAt
  if (item.updatedBy) serialized.updatedBy = item.updatedBy
  return serialized
}

export function deserializeItem(serialized: SerializedItem): Item {
  const item: Item = {
    id: serialized.id,
    type: serialized.type,
    createdAt: serialized.createdAt,
    createdBy: serialized.createdBy,
    data: { ...serialized.data },
  }
  if (serialized["@context"]?.length) item["@context"] = serialized["@context"]
  if (serialized.schema) item.schema = serialized.schema
  if (serialized.schemaVersion != null) item.schemaVersion = serialized.schemaVersion
  if (serialized.relations?.length) item.relations = serialized.relations
  if (serialized.tags?.length) item.tags = serialized.tags
  if (serialized.updatedAt) item.updatedAt = serialized.updatedAt
  if (serialized.updatedBy) item.updatedBy = serialized.updatedBy
  return item
}
