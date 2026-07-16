import type { Item, RelationRecord } from "@real-life-stack/data-interface"
import type { GraphEdge, GraphNode } from "@real-life-stack/toolkit"

import { resolveNetworkAvatarSources } from "./avatar-sources"

export interface RelationGraphProjection {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function stringField(item: Item, field: string): string | undefined {
  const value = item.data[field]
  return typeof value === "string" && value.trim() ? value : undefined
}

function graphNode(item: Item): GraphNode {
  const storedAvatarUrl =
    stringField(item, "avatarUrl") ??
    stringField(item, "avatar") ??
    stringField(item, "avatarThumbnail")
  const avatarUrl = storedAvatarUrl
    ? resolveNetworkAvatarSources(storedAvatarUrl).graphUrl
    : undefined
  return {
    id: item.id,
    label:
      stringField(item, "displayName") ??
      stringField(item, "title") ??
      stringField(item, "label") ??
      stringField(item, "name") ??
      item.id,
    type: item.type,
    ...(avatarUrl ? { avatarUrl } : {}),
  }
}

function localItemId(target: string): string | null {
  if (!target.startsWith("item:")) return null
  const id = target.slice("item:".length)
  return id || null
}

export function projectRelationGraph(
  items: readonly Item[],
  records: readonly RelationRecord[],
): RelationGraphProjection {
  const domainItems = items.filter(({ type }) => type !== "relation")
  const itemIds = new Set(domainItems.map(({ id }) => id))
  const edges: GraphEdge[] = []

  for (const record of records) {
    const sourceId = localItemId(record.from)
    const targetId = localItemId(record.to)
    if (!sourceId || !targetId || !itemIds.has(sourceId) || !itemIds.has(targetId)) continue

    edges.push({
      id: record.id,
      sourceId,
      targetId,
      predicate: record.predicate,
    })
  }

  return {
    nodes: domainItems.map(graphNode),
    edges,
  }
}
