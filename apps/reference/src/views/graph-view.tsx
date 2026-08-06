import { useCallback, useEffect, useMemo, useRef } from "react"
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
import { ReactionBar, useItemGroupResolver, useOpenProfile } from "@real-life-stack/toolkit"
import { useItemFocus } from "../hooks/use-item-focus"
import { useItemDetailEdit } from "../hooks/use-item-detail-edit"
import { useRegisterDetail, type DetailConfig } from "../detail-host"
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

/**
 * Graph node ids are NAMESPACED by identity kind (`item:` / `user:`). Item
 * ids and user ids come from different sources and share no namespace — a
 * collision used to merge both into one node, and a click on the person then
 * opened the item instead of the profile (rls#248).
 */
export const graphItemNodeId = (id: string): string => `item:${id}`
export const graphUserNodeId = (id: string): string => `user:${id}`

/** Decode a namespaced graph node id back to kind + original id. */
export function graphNodeRef(nodeId: string): { kind: "item" | "user"; id: string } | null {
  if (nodeId.startsWith("item:")) return { kind: "item", id: nodeId.slice("item:".length) }
  if (nodeId.startsWith("user:")) return { kind: "user", id: nodeId.slice("user:".length) }
  return null
}

export interface GraphProjection {
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeTypes: GraphTypeDescriptor[]
}

const label = (item: Item): string =>
  String(item.data.title ?? item.data.displayName ?? item.data.name ?? "Ohne Titel")

/** `item:x` / `space:s/item:x` → item id (+ claimed space); `global:u` → user id. */
function parseTarget(
  target: string,
): { kind: "item"; id: string; spaceId?: string } | { kind: "user"; id: string } | null {
  if (target.startsWith("global:")) return { kind: "user", id: target.slice("global:".length) }
  if (target.startsWith("item:")) return { kind: "item", id: target.slice("item:".length) }
  const cross = target.match(/^space:([^/]+)\/item:(.+)$/)
  if (cross) return { kind: "item", id: cross[2], spaceId: cross[1] }
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
  opts?: {
    /** Which space an item ACTUALLY lives in (connector knowledge), or null. */
    resolveItemSpace?: (itemId: string) => string | null
  },
): GraphProjection {
  const systemTypes = new Set<string>(SYSTEM_ITEM_TYPES)
  const cardItems = items.filter((item) => !systemTypes.has(item.type))
  const itemIds = new Set(cardItems.map((item) => item.id))
  const usersById = new Map(users.map((user) => [user.id, user]))

  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const usedTypes = new Set<string>()

  for (const item of cardItems) {
    const nodeId = graphItemNodeId(item.id)
    nodes.set(nodeId, { id: nodeId, label: label(item), type: item.type })
    usedTypes.add(item.type)
  }

  /** Adds the person node lazily; returns null for unknown endpoints. */
  const endpointNode = (target: string): string | null => {
    const parsed = parseTarget(target)
    if (!parsed) return null
    if (parsed.kind === "item") {
      if (!itemIds.has(parsed.id)) return null
      // A space-qualified target claims a HOME for the item. Connect only when
      // the connector confirms the local item really lives there — a local id
      // that merely collides with a foreign item's id must not link. No
      // resolver → unverifiable → drop, never guess.
      if (parsed.spaceId !== undefined) {
        if (opts?.resolveItemSpace?.(parsed.id) !== parsed.spaceId) return null
      }
      return graphItemNodeId(parsed.id)
    }
    const user = usersById.get(parsed.id)
    if (!user) return null
    const nodeId = graphUserNodeId(user.id)
    if (!nodes.has(nodeId)) {
      nodes.set(nodeId, {
        id: nodeId,
        label: user.displayName ?? user.id,
        type: "person",
        avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : undefined,
      })
      usedTypes.add("person")
    }
    return nodeId
  }

  // Embedded relations (spec 04, forward): task --assignedTo--> person, …
  for (const item of cardItems) {
    for (const relation of item.relations ?? []) {
      const other = endpointNode(relation.target)
      if (!other) continue
      edges.push({
        id: `${item.id}|${relation.predicate}|${other}`,
        sourceId: graphItemNodeId(item.id),
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

  // The detail host only opens the shared panel when the ACTIVE module has
  // registered a config — without this, a node click sets the URL focus and
  // nothing visible happens.
  const editConfig = useItemDetailEdit(members)
  const detailConfig = useMemo<DetailConfig>(
    () => ({
      ...editConfig,
      renderCommentReactions: (id) => <ReactionBar itemId={id} />,
      onShare: () => void navigator.clipboard?.writeText(window.location.href),
    }),
    [editConfig],
  )
  useRegisterDetail("graph", detailConfig)

  const resolveLabel = useCallback((typeId: string) => resolveTypePresentation(typeId).label, [])

  // Connector knowledge of an item's HOME space, for verifying space-qualified
  // relation targets (`space:B/item:x`) against id collisions.
  const resolveGroup = useItemGroupResolver()
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const resolveItemSpace = useCallback(
    (itemId: string) => {
      const item = itemById.get(itemId)
      return item ? resolveGroup(item)?.id ?? null : null
    },
    [itemById, resolveGroup],
  )

  const projection = useMemo(
    () => projectSpaceGraph(items, records, members, resolveLabel, { resolveItemSpace }),
    [items, records, members, resolveLabel, resolveItemSpace],
  )

  // Selection wires into the shared focus/detail flow: an ITEM node opens the
  // one detail panel every module shares; a PERSON node opens the profile
  // overlay (`?profile=`), the same surface every avatar in the app uses.
  // Spec 04 allows profiles as `type: "profile"` items — once a connector
  // projects them, person details can flow through the detail host instead.
  //
  // Item focus → person click: the old focus (and its panel) must go. Focus
  // and profile both write the URL, and two navigations in one tick race each
  // other's stale route state — so clear first, then open the profile from an
  // effect once the focus is really gone.
  const openProfile = useOpenProfile()
  const pendingProfileRef = useRef<string | null>(null)
  useEffect(() => {
    if (!focusedItemId && pendingProfileRef.current) {
      const userId = pendingProfileRef.current
      pendingProfileRef.current = null
      openProfile(userId)
    }
  }, [focusedItemId, openProfile])
  const onSelect = useCallback(
    (nodeId: string | null) => {
      // The node id carries its identity KIND (rls#248) — never guess from a
      // lookup, an item id and a user id may be the same string.
      const ref = nodeId ? graphNodeRef(nodeId) : null
      if (ref?.kind === "item") {
        focusItem(ref.id)
      } else if (ref?.kind === "user") {
        if (focusedItemId) {
          pendingProfileRef.current = ref.id
          clearFocus()
        } else {
          openProfile(ref.id)
        }
      } else if (!nodeId && focusedItemId) {
        clearFocus()
      }
    },
    [focusItem, openProfile, focusedItemId, clearFocus],
  )

  return (
    <GraphView
      ref={graphRef}
      nodes={projection.nodes}
      edges={projection.edges}
      nodeTypes={projection.nodeTypes}
      selectedNodeId={focusedItemId ? graphItemNodeId(focusedItemId) : null}
      onSelectedNodeChange={onSelect}
      fitViewKey={groupId}
      className="h-full w-full"
      ariaLabel="Beziehungsgraph des Space"
      selectionFocusBottomInset={modulePanel.current ? 200 : 0}
    />
  )
}
