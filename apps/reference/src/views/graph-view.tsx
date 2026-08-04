import { useCallback, useMemo, useRef } from "react"
import {
  GraphView,
  resolveTypePresentation,
  useItems,
  useMembers,
  useRelationRecords,
  type GraphEdge,
  type GraphNode,
  type GraphTypeDescriptor,
  type GraphViewHandle,
} from "@real-life-stack/toolkit"
import {
  SYSTEM_ITEM_TYPES,
  type Item,
  type RelationRecord,
  type User,
} from "@real-life-stack/data-interface"
import { useItemFocus } from "../hooks/use-item-focus"
import { useModulePanel } from "@real-life-stack/toolkit"

/**
 * Graph module — the space's items and their relations as a force graph.
 *
 * Nodes are the space's card-bearing items (system types stay out — a
 * reaction or comment is not a node) plus the PEOPLE that item edges point
 * at (`global:` targets, resolved via the member union). Edges come from two
 * sources, mirroring spec 04's two relation mechanisms:
 *
 * - embedded relations (`item.relations[]`, e.g. task --assignedTo--> user)
 * - relation records (items of type `relation` with `from`/`to`, e.g. votesOn)
 *
 * Node colours derive from the TYPE REGISTER labels — the graph is a lens
 * like any other and introduces no fifth type list.
 */

/** Palette per type id; register supplies the labels. Deliberately local:
 *  colour-on-canvas is a graph concern, not a register concern. */
const NODE_COLORS: Record<string, { color: string; darkColor: string }> = {
  person: { color: "#2a78d6", darkColor: "#3987e5" },
  post: { color: "#8b5cf6", darkColor: "#7c4fe0" },
  event: { color: "#eda100", darkColor: "#c98500" },
  place: { color: "#1baf7a", darkColor: "#199e70" },
  task: { color: "#d97706", darkColor: "#b45309" },
  statement: { color: "#0ea5e9", darkColor: "#0284c7" },
  project: { color: "#16a34a", darkColor: "#15803d" },
  resource: { color: "#e11d48", darkColor: "#be123c" },
}
const FALLBACK_COLOR = { color: "#64748b", darkColor: "#475569" }

export interface GraphProjection {
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeTypes: GraphTypeDescriptor[]
}

const label = (item: Item): string =>
  String(item.data.title ?? item.data.displayName ?? item.data.name ?? "Ohne Titel")

/** `item:x` / `space:s/item:x` → local item id; `global:u` → user id. */
function parseTarget(target: string): { kind: "item" | "user"; id: string } | null {
  if (target.startsWith("global:")) return { kind: "user", id: target.slice("global:".length) }
  if (target.startsWith("item:")) return { kind: "item", id: target.slice("item:".length) }
  const cross = target.match(/^space:[^/]+\/item:(.+)$/)
  if (cross) return { kind: "item", id: cross[1] }
  return null
}

/**
 * Pure projection: items + relation records + users → graph. Exported for
 * tests. Person nodes appear only when an edge actually reaches them — the
 * graph shows the space's fabric, not the member list.
 */
export function projectSpaceGraph(
  items: readonly Item[],
  records: readonly RelationRecord[],
  users: readonly User[],
  resolveLabel: (typeId: string) => string,
): GraphProjection {
  const systemTypes = new Set<string>(SYSTEM_ITEM_TYPES)
  const cardItems = items.filter((item) => !systemTypes.has(item.type))
  const itemIds = new Set(cardItems.map((item) => item.id))
  const usersById = new Map(users.map((user) => [user.id, user]))

  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const usedTypes = new Set<string>()

  for (const item of cardItems) {
    nodes.set(item.id, { id: item.id, label: label(item), type: item.type })
    usedTypes.add(item.type)
  }

  /** Adds the person node lazily; returns null for unknown endpoints. */
  const endpointNode = (target: string): string | null => {
    const parsed = parseTarget(target)
    if (!parsed) return null
    if (parsed.kind === "item") return itemIds.has(parsed.id) ? parsed.id : null
    const user = usersById.get(parsed.id)
    if (!user) return null
    if (!nodes.has(user.id)) {
      nodes.set(user.id, {
        id: user.id,
        label: user.displayName ?? user.id,
        type: "person",
        avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : undefined,
      })
      usedTypes.add("person")
    }
    return user.id
  }

  // Embedded relations (spec 04, forward): task --assignedTo--> person, …
  for (const item of cardItems) {
    for (const relation of item.relations ?? []) {
      const other = endpointNode(relation.target)
      if (!other) continue
      edges.push({
        id: `${item.id}|${relation.predicate}|${other}`,
        sourceId: item.id,
        targetId: other,
        predicate: relation.predicate,
      })
    }
  }

  // Relation records (spec 08): from --predicate--> to, as first-class edges.
  for (const record of records) {
    const from = endpointNode(record.from)
    const to = endpointNode(record.to)
    if (!from || !to) continue
    edges.push({ id: record.id, sourceId: from, targetId: to, predicate: record.predicate })
  }

  const nodeTypes: GraphTypeDescriptor[] = [...usedTypes].sort().map((typeId) => ({
    id: typeId,
    label: resolveLabel(typeId),
    ...(NODE_COLORS[typeId] ?? FALLBACK_COLOR),
  }))

  return { nodes: [...nodes.values()], edges, nodeTypes }
}

export function GraphViewWrapper({ groupId }: { groupId: string }) {
  const { data: items } = useItems()
  const { data: records } = useRelationRecords()
  const { data: members } = useMembers(groupId === "__overview__" ? null : groupId)
  const { focusItem, itemId: focusedItemId, clearFocus } = useItemFocus()
  const modulePanel = useModulePanel()
  const graphRef = useRef<GraphViewHandle>(null)

  const resolveLabel = useCallback((typeId: string) => resolveTypePresentation(typeId).label, [])

  const projection = useMemo(
    () => projectSpaceGraph(items, records, members, resolveLabel),
    [items, records, members, resolveLabel],
  )

  // Selection wires into the shared focus/detail flow: an ITEM node opens the
  // one detail panel every module shares; person nodes just select visually
  // (profiles have their own surface).
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const onSelect = useCallback(
    (nodeId: string | null) => {
      if (nodeId && itemById.has(nodeId)) focusItem(nodeId)
      else if (!nodeId && focusedItemId) clearFocus()
    },
    [itemById, focusItem, focusedItemId, clearFocus],
  )

  return (
    <GraphView
      ref={graphRef}
      nodes={projection.nodes}
      edges={projection.edges}
      nodeTypes={projection.nodeTypes}
      selectedNodeId={focusedItemId ?? null}
      onSelectedNodeChange={onSelect}
      fitViewKey={groupId}
      className="h-full w-full"
      ariaLabel="Beziehungsgraph des Space"
      selectionFocusBottomInset={modulePanel.current ? 200 : 0}
    />
  )
}
