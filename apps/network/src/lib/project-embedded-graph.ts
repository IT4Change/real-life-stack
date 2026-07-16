import type { Item } from "@real-life-stack/data-interface"
import type { GraphEdge, GraphNode } from "@real-life-stack/toolkit"

import { resolveNetworkAvatarSources } from "./avatar-sources"

export interface EmbeddedGraphProjection {
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

function edgeId(sourceId: string, targetId: string, predicate: string): string {
  return [sourceId, predicate, targetId].map(encodeURIComponent).join("::")
}

export function projectEmbeddedGraph(items: readonly Item[]): EmbeddedGraphProjection {
  const itemIds = new Set(items.map(({ id }) => id))
  const edges = new Map<string, GraphEdge>()

  for (const item of items) {
    for (const relation of item.relations ?? []) {
      if (!relation.target.startsWith("item:")) continue

      const targetId = relation.target.slice("item:".length)
      if (!targetId || !itemIds.has(targetId)) continue

      const id = edgeId(item.id, targetId, relation.predicate)
      if (!edges.has(id)) {
        edges.set(id, {
          id,
          sourceId: item.id,
          targetId,
          predicate: relation.predicate,
        })
      }
    }
  }

  return {
    nodes: items.map(graphNode),
    edges: [...edges.values()],
  }
}
