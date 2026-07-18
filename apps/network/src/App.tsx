import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import {
  ExternalLink,
  Filter,
  KanbanSquare,
  List,
  Map as MapIcon,
  Maximize2,
  Moon,
  Search,
  Sun,
  CalendarDays,
  Waypoints,
  X,
} from "lucide-react"
import type { DataInterface, Item, User } from "@real-life-stack/data-interface"
import { hasGroups, isAuthenticatable, isWritable } from "@real-life-stack/data-interface"
import {
  AdaptivePanel,
  AppShell,
  AppShellMain,
  BottomNav,
  Button,
  CalendarView,
  ConnectorProvider,
  GraphView,
  CollectionView,
  Input,
  KanbanBoard,
  MapView,
  Navbar,
  NavbarCenter,
  NavbarEnd,
  NavbarStart,
  ModulePanelProvider,
  ProfilePanelContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UserMenu,
  WorkspaceSwitcher,
  useConnector,
  useCurrentGroup,
  useMembers,
  useGroups,
  useItems,
  useModulePanel,
  useRelationRecords,
  ActivityBell,
  ActivityPanel,
  useActivity,
  NotificationBell,
  NotificationCenter,
  useNotifications,
  type GraphEdge,
  type GraphNode,
  type GraphTypeDescriptor,
  type GraphViewHandle,
  type PanelMode,
  type UserData,
  type Workspace,
  type NavItem,
} from "@real-life-stack/toolkit"
import { MapLibreMapAdapter } from "@real-life-stack/toolkit/maplibre"

import { dwebCampDetailAvatarUrl } from "./data/avatar-detail-urls"
import { resolveNetworkAvatarSources } from "./lib/avatar-sources"
import { projectRelationGraph } from "./lib/project-relation-graph"
import { moveNetworkTask, networkTaskBoardItems } from "./lib/network-task-board"

const GRAPH_TYPES: readonly GraphTypeDescriptor[] = [
  { id: "person", label: "Personen", color: "#2a78d6", darkColor: "#3987e5" },
  { id: "project", label: "Projekte", color: "#1baf7a", darkColor: "#199e70" },
  { id: "event", label: "Sessions", color: "#eda100", darkColor: "#c98500" },
  { id: "task", label: "Aufgaben", color: "#8b5cf6", darkColor: "#9b7bf6" },
  { id: "resource", label: "Ressourcen", color: "#0f9d8a", darkColor: "#14b8a6" },
  { id: "place", label: "Orte", color: "#e05d44", darkColor: "#ef7258" },
]

const ALL_GRAPH_TYPES = new Set(GRAPH_TYPES.map(({ id }) => id))
const THEME_KEY = "rls-network-theme"
const DETAIL_PANEL_MODES: PanelMode[] = ["sidebar", "drawer"]
const PROFILE_PANEL_MODES: PanelMode[] = ["modal"]

type NetworkLens = "graph" | "list" | "kanban" | "map" | "calendar" | "marketplace"

const NETWORK_LENSES: ReadonlyArray<{ id: NetworkLens; label: string }> = [
  { id: "graph", label: "Graph" },
  { id: "list", label: "Liste" },
  { id: "kanban", label: "Kanban" },
  { id: "calendar", label: "Kalender" },
  { id: "map", label: "Karte" },
  { id: "marketplace", label: "Marktplatz" },
]

interface AppProps {
  connector: DataInterface
}

function initialDarkMode(): boolean {
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored) return stored === "dark"
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function useOptionalCurrentUser(connector: DataInterface): User | null {
  const authConnector = isAuthenticatable(connector) ? connector : null
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  useEffect(() => {
    if (!authConnector) {
      setCurrentUser(null)
      return
    }

    const observable = authConnector.observeCurrentUser()
    setCurrentUser(observable.current)
    return observable.subscribe(setCurrentUser)
  }, [authConnector])

  return currentUser
}

function nodeTitle(item: Item): string {
  const candidates = [item.data.displayName, item.data.title, item.data.label, item.data.name]
  return candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? item.id
}

function graphTypeLabel(type: string): string {
  if (type === "task") return "Aufgabe"
  if (type === "resource") return "Ressource"
  if (type === "place") return "Ort"
  return GRAPH_TYPES.find(({ id }) => id === type)?.label ?? type
}

function NetworkLensIcon({ lens }: { lens: NetworkLens }) {
  if (lens === "list" || lens === "marketplace") return <List className="size-4" />
  if (lens === "kanban") return <KanbanSquare className="size-4" />
  if (lens === "map") return <MapIcon className="size-4" />
  if (lens === "calendar") return <CalendarDays className="size-4" />
  return <Waypoints className="size-4" />
}

const NETWORK_LENS_NAV_ITEMS: NavItem[] = [
  { id: "graph", label: "Graph", icon: Waypoints },
  { id: "list", label: "Liste", icon: List },
  { id: "kanban", label: "Kanban", icon: KanbanSquare },
  { id: "calendar", label: "Kalender", icon: CalendarDays },
  { id: "map", label: "Karte", icon: MapIcon },
  { id: "marketplace", label: "Marktplatz", icon: List },
]

function predicateLabel(predicate: string): string {
  if (predicate === "attends") return "Spricht bei"
  if (predicate === "partOf") return "Arbeitet an"
  if (predicate === "connectedWith") return "Verbunden mit"
  return predicate
}

function safeLinks(item: Item): Array<{ label: string; url: string }> {
  const links: Array<{ label: string; url: string }> = []
  const add = (label: string, value: unknown) => {
    if (typeof value !== "string" || !/^https?:\/\//.test(value)) return
    if (!links.some(({ url }) => url === value)) links.push({ label, url: value })
  }

  add("Website", item.data.website)
  add("Repository", item.data.repo)
  if (Array.isArray(item.data.urls)) {
    item.data.urls.forEach((url, index) => add(`Link ${index + 1}`, url))
  }
  return links
}

function IconTooltip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  )
}

function safeImageField(item: Item, field: string): string | null {
  const value = item.data[field]
  return typeof value === "string" && /^(?:data:image\/|https:\/\/)/.test(value)
    ? value
    : null
}

function NetworkDetailAvatar({ item }: { item: Item }) {
  const storedSource =
    safeImageField(item, "avatarUrl") ??
    safeImageField(item, "avatar") ??
    safeImageField(item, "avatarThumbnail")
  const storedSources = storedSource ? resolveNetworkAvatarSources(storedSource) : null
  const curatedDetailSource = dwebCampDetailAvatarUrl(item)
  const primarySource = curatedDetailSource ?? storedSources?.detailUrl ?? null
  const fallbackSource = curatedDetailSource ? storedSource : storedSources?.graphUrl ?? null
  const [source, setSource] = useState(primarySource)

  useEffect(() => {
    setSource(primarySource)
  }, [primarySource])

  if (!source) return null

  return (
    <img
      key={source}
      src={source}
      alt=""
      referrerPolicy="no-referrer"
      className="mb-5 aspect-square w-full max-w-56 rounded-md border object-cover"
      onError={() => {
        setSource(source !== fallbackSource ? fallbackSource : null)
      }}
    />
  )
}

function NetworkDetailContent({
  item,
  connections,
  nodeById,
  onSelectNode,
}: {
  item: Item | null
  connections: readonly GraphEdge[]
  nodeById: ReadonlyMap<string, GraphNode>
  onSelectNode: (nodeId: string) => void
}) {
  const links = item ? safeLinks(item) : []
  const neighbors = useMemo(() => {
    if (!item) return []
    const byNeighbor = new Map<string, { node: GraphNode; predicates: string[] }>()
    for (const edge of connections) {
      const node = nodeById.get(edge.sourceId === item.id ? edge.targetId : edge.sourceId)
      if (!node) continue
      const entry = byNeighbor.get(node.id)
      if (entry) {
        if (!entry.predicates.includes(edge.predicate)) entry.predicates.push(edge.predicate)
      } else {
        byNeighbor.set(node.id, { node, predicates: [edge.predicate] })
      }
    }
    return [...byNeighbor.values()].slice(0, 12)
  }, [connections, item, nodeById])

  return (
    <section
      aria-label="Details zum ausgewählten Eintrag"
      className="flex h-full min-h-0 flex-col"
    >
      {item && (
        <>
          <header className="flex min-h-14 items-center gap-3 border-b py-3 pl-5 pr-12">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">{graphTypeLabel(item.type)}</p>
              <h2 className="truncate text-base font-semibold">{nodeTitle(item)}</h2>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <NetworkDetailAvatar key={item.id} item={item} />

            {item.tags && item.tags.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {links.length > 0 && (
              <section className="mb-6" aria-labelledby="detail-links">
                <h3 id="detail-links" className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Links
                </h3>
                <div className="divide-y border-y">
                  {links.map(({ label, url }) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-10 items-center gap-2 py-2 text-sm hover:text-primary"
                    >
                      <ExternalLink className="size-4" />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="detail-connections">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 id="detail-connections" className="text-xs font-semibold uppercase text-muted-foreground">
                  Verbindungen
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground">{connections.length}</span>
              </div>
              {neighbors.length > 0 ? (
                <div className="divide-y border-y">
                  {neighbors.map(({ node, predicates }) => (
                    <button
                      key={node.id}
                      type="button"
                      className="flex min-h-11 w-full items-center gap-3 py-2 text-left hover:text-primary"
                      onClick={() => onSelectNode(node.id)}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: GRAPH_TYPES.find(({ id }) => id === node.type)?.color ?? "#64748b" }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{node.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {predicates.map(predicateLabel).join(", ")}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">{graphTypeLabel(node.type)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="border-y py-4 text-sm text-muted-foreground">Keine Verbindungen</p>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  )
}

function DetailPanelController({
  item,
  connections,
  nodeById,
  onClose,
  onSelectNode,
}: {
  item: Item | null
  connections: readonly GraphEdge[]
  nodeById: ReadonlyMap<string, GraphNode>
  onClose: () => void
  onSelectNode: (nodeId: string) => void
}) {
  const panel = useModulePanel()
  const openedItemIdRef = useRef<string | null>(null)
  const openedContentRef = useRef<{
    item: Item
    connections: readonly GraphEdge[]
    nodeById: ReadonlyMap<string, GraphNode>
  } | null>(null)
  const panelOwnedRef = useRef(false)

  useEffect(() => {
    if (item) {
      // The activity panel legitimately owns the shared panel while its bell is
      // open — an UNCHANGED selection must not bounce it shut right after
      // opening. A fresh selection takes the shared panel over (the activity
      // controller then sees the ownership loss and closes its bell state).
      if (panel.current?.itemId === "__activity__" && openedItemIdRef.current === item.id) {
        panelOwnedRef.current = false
        return
      }
      const openedContent = openedContentRef.current
      if (
        openedItemIdRef.current === item.id &&
        openedContent?.item === item &&
        openedContent.connections === connections &&
        openedContent.nodeById === nodeById &&
        panelOwnedRef.current &&
        panel.current?.kind === "detail"
      ) {
        return
      }

      openedItemIdRef.current = item.id
      openedContentRef.current = { item, connections, nodeById }
      panelOwnedRef.current = true
      panel.open({
        kind: "detail",
        itemId: item.id,
        backdrop: false,
        content: (
          <NetworkDetailContent
            item={item}
            connections={connections}
            nodeById={nodeById}
            onSelectNode={onSelectNode}
          />
        ),
        onClose,
      })
      return
    }

    openedItemIdRef.current = null
    openedContentRef.current = null
    if (panelOwnedRef.current) {
      panelOwnedRef.current = false
      if (panel.current?.kind === "detail") panel.close({ silent: true })
    }
  }, [connections, item, nodeById, onClose, onSelectNode, panel])

  return null
}

function NetworkActivityPanelController({ open, onClose, selectItem, onOpenNotification, onOpenGroup }: { open: boolean; onClose: () => void; selectItem: (id: string) => void; onOpenNotification: (notification: import("@real-life-stack/toolkit").NotificationCandidate) => void; onOpenGroup: (groupId: string) => void }) {
  const panel = useModulePanel()
  const ownedActivityPanel = useRef(false)
  const wasOpen = useRef(open)
  const openTarget = useCallback((entry: import("@real-life-stack/data-interface").ActivityEntry) => {
    selectItem(entry.targetId)
    onClose()
  }, [onClose, selectItem])
  useEffect(() => {
    const openedNow = open && !wasOpen.current
    wasOpen.current = open
    if (!open) {
      ownedActivityPanel.current = false
      if (panel.current?.itemId === "__activity__") panel.close({ silent: true })
      return
    }
    if (panel.current?.itemId === "__activity__") {
      ownedActivityPanel.current = true
      return
    }
    if (ownedActivityPanel.current && !openedNow) {
      ownedActivityPanel.current = false
      onClose()
      return
    }
    ownedActivityPanel.current = true
    panel.open({ kind: "custom", itemId: "__activity__", content: <NetworkNotificationCenterContent onOpenNotification={onOpenNotification} onOpenGroup={onOpenGroup} onOpenActivity={() => panel.open({ kind: "custom", itemId: "__activity__", content: <NetworkActivityPanelContent onOpenTarget={openTarget} />, onClose })} onOpenTarget={openTarget} />, onClose })
  }, [onClose, open, openTarget, panel.close, panel.current?.itemId, panel.open])
  return null
}

function NetworkNotificationCenterContent({ onOpenNotification, onOpenGroup, onOpenActivity, onOpenTarget }: { onOpenNotification: (notification: import("@real-life-stack/toolkit").NotificationCandidate) => void; onOpenGroup: (groupId: string) => void; onOpenActivity: () => void; onOpenTarget: (entry: import("@real-life-stack/data-interface").ActivityEntry) => void }) {
  const notifications = useNotifications()
  useEffect(() => { if (notifications.stateSupported && notifications.maxTs) void notifications.update?.({ op: "markSeen", ts: notifications.maxTs }) }, [notifications.maxTs, notifications.stateSupported, notifications.update])
  if (!notifications.supported) return <NetworkActivityPanelContent onOpenTarget={onOpenTarget} />
  return <NotificationCenter notifications={notifications.notifications} onOpenSubject={onOpenNotification} onOpenGroup={onOpenGroup} onOpenActivity={onOpenActivity} onMarkRead={notifications.stateSupported ? (keys) => void notifications.update?.({ op: "markRead", keys }) : undefined} onMarkAllRead={notifications.stateSupported ? () => notifications.maxTs && void notifications.update?.({ op: "markAllReadUpTo", ts: notifications.maxTs }) : undefined} onMuteGroup={notifications.stateSupported ? (groupId, muted) => void notifications.update?.(muted ? { op: "mute", groupId } : { op: "unmute", groupId }) : undefined} />
}

/** Meta-item types the shell has no detail projection for (log stays visible, not clickable). */
const UNPROJECTABLE_TARGET_TYPES = new Set(["relation", "comment"])

function NetworkActivityPanelContent({ onOpenTarget }: { onOpenTarget: (entry: import("@real-life-stack/data-interface").ActivityEntry) => void }) {
  const connector = useConnector()
  const { data: entries } = useActivity()
  const { data: items } = useItems()
  const currentGroup = useCurrentGroup()
  const { data: members } = useMembers(currentGroup?.id ?? null)
  const currentUser = useOptionalCurrentUser(connector)
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  // A reaction entry opens its PARENT (the reacted-to item) — the reaction
  // itself has no detail projection.
  const resolveOpenId = useCallback((entry: import("@real-life-stack/data-interface").ActivityEntry) => {
    if (UNPROJECTABLE_TARGET_TYPES.has(entry.targetType) || entry.action === "delete") return undefined
    if (entry.targetType === "reaction") {
      const reaction = itemById.get(entry.targetId)
      const target = reaction?.relations?.find((relation) => relation.predicate === "reactsTo")?.target
      const parentId = target?.startsWith("item:") ? target.slice("item:".length) : undefined
      return parentId && itemById.has(parentId) ? parentId : undefined
    }
    return itemById.has(entry.targetId) ? entry.targetId : undefined
  }, [itemById])
  const isTargetOpenable = useCallback((entry: import("@real-life-stack/data-interface").ActivityEntry) => resolveOpenId(entry) !== undefined, [resolveOpenId])
  const resolveActor = useCallback(
    (actorId: string) => members.find((member) => member.id === actorId) ?? (currentUser?.id === actorId ? currentUser : undefined),
    [members, currentUser],
  )
  const openResolvedTarget = useCallback((entry: import("@real-life-stack/data-interface").ActivityEntry) => {
    const openId = resolveOpenId(entry)
    if (openId) onOpenTarget({ ...entry, targetId: openId })
  }, [onOpenTarget, resolveOpenId])
  return <ActivityPanel entries={entries} isTargetOpenable={isTargetOpenable} onOpenTarget={openResolvedTarget} resolveActor={resolveActor} />
}

function NetworkShell() {
  const connector = useConnector()
  const { data: groups } = useGroups()
  const currentGroup = useCurrentGroup()
  const { data: items, isLoading: itemsLoading } = useItems()
  const {
    data: relationRecords,
    isLoading: relationRecordsLoading,
    supported: relationRecordsSupported,
  } = useRelationRecords()
  const graphRef = useRef<GraphViewHandle>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [activeLens, setActiveLens] = useState<NetworkLens>("graph")
  // Urgent/Deferred-Trennung: die Nav-Buttons rendern auf activeLens
  // (sofort), die schweren Linsen-Inhalte auf deferredLens (nachgelagert).
  // Ein einzelner State in startTransition würde BEIDES verzögern —
  // Button-Feedback und Inhalt kämen gemeinsam nach ~1 s (Review-Messung).
  const deferredLens = useDeferredValue(activeLens)
  const [query, setQuery] = useState("")
  const [filterOpen, setFilterOpen] = useState(false)
  const [enabledTypes, setEnabledTypes] = useState(() => new Set(ALL_GRAPH_TYPES))
  const [isDark, setIsDark] = useState(initialDarkMode)
  const [profileOpen, setProfileOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const closeActivity = useCallback(() => setActivityOpen(false), [])
  const activity = useActivity()
  const notifications = useNotifications()
  const [detailDrawerHeight, setDetailDrawerHeight] = useState(0)
  const currentUser = useOptionalCurrentUser(connector)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark)
    try {
      window.localStorage.setItem(THEME_KEY, isDark ? "dark" : "light")
    } catch {
      // Applying the in-memory theme must not depend on persistent storage.
    }
  }, [isDark])

  useEffect(() => {
    if (!currentUser) setProfileOpen(false)
  }, [currentUser])

  useEffect(() => {
    if (!currentGroup && groups.length > 0 && hasGroups(connector)) {
      connector.setCurrentGroup(groups[0].id)
    }
  }, [connector, currentGroup, groups])

  const workspaces: Workspace[] = useMemo(
    () => groups.map((group) => ({
      id: group.id,
      name: group.name,
      avatar: typeof group.data?.image === "string" ? group.data.image : undefined,
      scope: group.id === "my-network" ? "overview" : undefined,
      primaryColor: typeof group.data?.primaryColor === "string" ? group.data.primaryColor : undefined,
    })),
    [groups],
  )
  const activeWorkspace = workspaces.find(({ id }) => id === currentGroup?.id) ?? null
  const domainItems = useMemo(() => items.filter(({ type }) => type !== "relation"), [items])
  const graph = useMemo(
    () => projectRelationGraph(domainItems, relationRecords),
    [domainItems, relationRecords],
  )
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes])
  const itemById = useMemo(
    () => new Map(domainItems.map((item) => [item.id, item])),
    [domainItems],
  )
  const isLoading = itemsLoading || relationRecordsLoading

  const visibleNodes = useMemo(
    () => graph.nodes.filter(({ type }) => enabledTypes.has(type)),
    [enabledTypes, graph.nodes],
  )
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(({ id }) => id)), [visibleNodes])
  const visibleEdges = useMemo(
    () => graph.edges.filter(({ sourceId, targetId }) => visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)),
    [graph.edges, visibleNodeIds],
  )
  const selectedItem = selectedNodeId ? itemById.get(selectedNodeId) ?? null : null
  const taskBoardItems = useMemo(() => networkTaskBoardItems(domainItems), [domainItems])
  const createMapAdapter = useCallback(() => new MapLibreMapAdapter(), [])
  const selectionFocusVisibleArea = useMemo(
    () => detailDrawerHeight > 0 ? { bottomInset: detailDrawerHeight } : undefined,
    [detailDrawerHeight],
  )
  const marketplaceItems = useMemo(
    () => domainItems.filter((item) => item.type === "resource"),
    [domainItems],
  )
  const selectedConnections = useMemo(
    () => selectedNodeId
      ? graph.edges.filter(({ sourceId, targetId }) => sourceId === selectedNodeId || targetId === selectedNodeId)
      : [],
    [graph.edges, selectedNodeId],
  )
  const userData: UserData | null = useMemo(
    () => currentUser ? {
      id: currentUser.id,
      name: currentUser.displayName ?? currentUser.id,
      avatar: currentUser.avatarUrl,
    } : null,
    [currentUser],
  )

  const searchResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de")
    if (!needle) return []
    return graph.nodes
      .filter(({ label }) => label.toLocaleLowerCase("de").includes(needle))
      .slice(0, 8)
  }, [graph.nodes, query])

  const handleSelectedNodeChange = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId)
  }, [])
  // Opening the history DROPS the selection (create-host precedent): the shared
  // panel shows one thing, and only a selection CHANGE hands it back to the
  // detail — a kept selection would make re-clicking the same item a no-op.
  const toggleActivity = useCallback((next: boolean) => {
    if (next) handleSelectedNodeChange(null)
    setActivityOpen(next)
  }, [handleSelectedNodeChange])

  const selectNode = useCallback((nodeId: string) => {
    const node = nodeById.get(nodeId)
    if (!node) return
    setEnabledTypes((current) => current.has(node.type) ? current : new Set([...current, node.type]))
    handleSelectedNodeChange(nodeId)
    setQuery("")
  }, [handleSelectedNodeChange, nodeById])
  const selectItem = useCallback((itemId: string) => {
    if (!itemById.has(itemId)) return
    handleSelectedNodeChange(itemId)
  }, [handleSelectedNodeChange, itemById])
  const openNotification = useCallback((notification: import("@real-life-stack/toolkit").NotificationCandidate) => {
    if (hasGroups(connector)) connector.setCurrentGroup(notification.groupId)
    // Cross-space target selection intentionally bypasses the old-space item map.
    handleSelectedNodeChange(notification.subjectId)
    if (notification.moduleHints?.hasPosition) setActiveLens("map")
    else if (notification.moduleHints?.hasStart) setActiveLens("calendar")
    else if (notification.moduleHints?.hasStatus) setActiveLens("kanban")
    else setActiveLens("list")
    closeActivity()
  }, [closeActivity, connector, handleSelectedNodeChange])
  const closeDetail = useCallback(() => setSelectedNodeId(null), [])

  const handleWorkspaceChange = useCallback((workspace: Workspace) => {
    if (!hasGroups(connector)) return
    connector.setCurrentGroup(workspace.id)
    setSelectedNodeId(null)
    setQuery("")
    setEnabledTypes(new Set(ALL_GRAPH_TYPES))
  }, [connector])

  const toggleType = useCallback((type: string) => {
    setEnabledTypes((current) => {
      const next = new Set(current)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
    if (selectedItem?.type === type && enabledTypes.has(type)) setSelectedNodeId(null)
  }, [enabledTypes, selectedItem?.type])

  const handleMoveTask = useCallback((itemId: string, newStatus: string, position: number) => {
    void moveNetworkTask(connector, taskBoardItems, itemId, newStatus, position)
  }, [connector, taskBoardItems])

  return (
    <>
      <ModulePanelProvider
        allowedModes={DETAIL_PANEL_MODES}
        sidebarWidth="420px"
        sidebarMinWidth="300px"
        sidebarMaxWidth="70vw"
        onDrawerHeightChange={setDetailDrawerHeight}
      >
        <NetworkActivityPanelController open={activityOpen} onClose={closeActivity} selectItem={selectNode} onOpenNotification={openNotification} onOpenGroup={(groupId) => { if (hasGroups(connector)) connector.setCurrentGroup(groupId); handleSelectedNodeChange(null); closeActivity() }} />
        <DetailPanelController
          item={selectedItem}
          connections={selectedConnections}
          nodeById={nodeById}
          onClose={closeDetail}
          onSelectNode={selectNode}
        />
        <AppShell>
          <Navbar>
            <NavbarStart>
              {/* P1a exposes two fixed seed spaces; create/edit follows real multi-space in P2. */}
              <WorkspaceSwitcher
                workspaces={workspaces}
                activeWorkspace={activeWorkspace}
                onWorkspaceChange={handleWorkspaceChange}
              />
            </NavbarStart>
            <NavbarCenter>
              <div className="flex items-center gap-1" aria-label="Netzwerkansicht">
                {NETWORK_LENSES.map((lens) => (
                  <Button
                    key={lens.id}
                    type="button"
                    size="sm"
                    variant={activeLens === lens.id ? "secondary" : "ghost"}
                    aria-pressed={activeLens === lens.id}
                    onClick={() => setActiveLens(lens.id)}
                  >
                    <NetworkLensIcon lens={lens.id} />
                    <span className="hidden lg:inline">{lens.label}</span>
                  </Button>
                ))}
              </div>
            </NavbarCenter>
            <NavbarEnd>
              {notifications.supported ? <NotificationBell open={activityOpen} count={notifications.badgeCount} onOpenChange={toggleActivity} /> : activity.supported && <ActivityBell open={activityOpen} onOpenChange={toggleActivity} />}
              <IconTooltip label={isDark ? "Helles Design" : "Dunkles Design"}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={isDark ? "Helles Design" : "Dunkles Design"}
                  onClick={() => setIsDark((current) => !current)}
                >
                  {isDark ? <Sun /> : <Moon />}
                </Button>
              </IconTooltip>
              {userData && (
                <UserMenu user={userData} onProfile={() => setProfileOpen(true)} />
              )}
            </NavbarEnd>
          </Navbar>

          <BottomNav
            items={NETWORK_LENS_NAV_ITEMS}
            activeItem={activeLens}
            onItemChange={(lens) => setActiveLens(lens as NetworkLens)}
          />

          <AppShellMain withBottomNav className="relative min-h-0 overflow-hidden">
            {deferredLens === "graph" && (
              <GraphView
                ref={graphRef}
                nodes={visibleNodes}
                edges={visibleEdges}
                nodeTypes={GRAPH_TYPES}
                selectedNodeId={selectedNodeId}
                onSelectedNodeChange={handleSelectedNodeChange}
                fitViewKey={currentGroup?.id ?? "none"}
                selectionFocusBottomInset={selectionFocusVisibleArea?.bottomInset ?? 0}
                ariaLabel={`Netzwerkgraph ${activeWorkspace?.name ?? ""}`}
              />
            )}
            {deferredLens === "list" && (
              <CollectionView
                className="h-full"
                items={domainItems}
                activeItemId={selectedNodeId ?? undefined}
                selectionFocusVisibleArea={selectionFocusVisibleArea}
                onItemClick={(item) => selectItem(item.id)}
              />
            )}
            {deferredLens === "kanban" && (
              <div className="h-full overflow-y-auto p-4 sm:p-6">
                <div className="mx-auto max-w-6xl">
                  <KanbanBoard
                    items={taskBoardItems}
                    readOnly={!isWritable(connector)}
                    activeItemId={selectedNodeId ?? undefined}
                    selectionFocusVisibleArea={selectionFocusVisibleArea}
                    onMoveItem={handleMoveTask}
                    onItemClick={(item) => selectItem(item.id)}
                  />
                </div>
              </div>
            )}
            {deferredLens === "map" && (
              <MapView
                items={domainItems}
                itemsLoading={isLoading}
                inventoryKey={currentGroup?.id ?? "none"}
                createAdapter={createMapAdapter}
                initialView={{ center: [12.4066, 52.1183], zoom: 16 }}
                viewportMode="lens-auto-fit"
                activeItemId={selectedNodeId ?? undefined}
                selectionFocusVisibleArea={selectionFocusVisibleArea}
                onItemClick={(item) => selectItem(item.id)}
                clustering={{}}
                resolveGroupColor={() => "#64748b"}
              />
            )}
            {deferredLens === "calendar" && (
              <div className="h-full overflow-y-auto p-4 sm:p-6">
                <div className="mx-auto max-w-6xl">
                  <CalendarView
                    events={domainItems}
                    initialVisibleDate="2026-07-08T12:00:00+02:00"
                    activeItemId={selectedNodeId ?? undefined}
                    onEventClick={(item) => selectItem(item.id)}
                  />
                </div>
              </div>
            )}
            {deferredLens === "marketplace" && (
              <div className="flex h-full min-h-0 flex-col gap-4">
                <header className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6">
                  <h1 className="text-xl font-semibold">Marktplatz</h1>
                  <p className="text-sm text-muted-foreground">Ressourcen aus dem aktuellen Space</p>
                </header>
                <CollectionView
                  className="min-h-0 flex-1"
                  items={marketplaceItems}
                  activeItemId={selectedNodeId ?? undefined}
                  selectionFocusVisibleArea={selectionFocusVisibleArea}
                  onItemClick={(item) => selectItem(item.id)}
                />
              </div>
            )}

            {activeLens === "graph" && <div className="absolute left-3 top-3 z-20 w-[min(22rem,calc(100%-1.5rem))] sm:left-4 sm:top-4">
              <label htmlFor="network-search" className="sr-only">Netzwerk durchsuchen</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="network-search"
                  type="search"
                  value={query}
                  placeholder="Personen, Projekte, Sessions"
                  autoComplete="off"
                  className="h-11 bg-background/95 pl-9 pr-9 shadow-lg backdrop-blur-md"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && searchResults[0]) selectNode(searchResults[0].id)
                    if (event.key === "Escape") setQuery("")
                  }}
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Suche leeren"
                    className="absolute right-1 top-1 grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => setQuery("")}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {query.trim() && (
                <div className="mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover/98 p-1 text-popover-foreground shadow-xl backdrop-blur-md">
                  {searchResults.length > 0 ? searchResults.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      className="flex min-h-10 w-full items-center gap-3 rounded px-2.5 py-2 text-left hover:bg-accent"
                      onClick={() => selectNode(node.id)}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: GRAPH_TYPES.find(({ id }) => id === node.type)?.color ?? "#64748b" }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.label}</span>
                      <span className="text-xs text-muted-foreground">{graphTypeLabel(node.type)}</span>
                    </button>
                  )) : (
                    <p className="px-3 py-3 text-sm text-muted-foreground">Keine Treffer</p>
                  )}
                </div>
              )}
            </div>}

            {activeLens === "graph" && <div
              className={`absolute bottom-4 left-4 z-20 overflow-hidden border bg-background/95 shadow-lg backdrop-blur-md transition-[width,height,border-radius] duration-200 ${
                filterOpen ? "h-48 w-56 rounded-md" : "size-11 rounded-md"
              }`}
            >
              {filterOpen ? (
                <div className="p-3">
                  <div className="mb-3 flex h-8 items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Filter className="size-4" />
                      Typen
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Filter schließen" onClick={() => setFilterOpen(false)}>
                      <X />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {GRAPH_TYPES.map((type) => (
                      <label key={type.id} className="flex min-h-9 cursor-pointer items-center gap-3 rounded px-2 text-sm hover:bg-accent">
                        <input
                          type="checkbox"
                          checked={enabledTypes.has(type.id)}
                          onChange={() => toggleType(type.id)}
                          className="size-4"
                          style={{ accentColor: type.color }}
                        />
                        <span className="flex-1">{type.label}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {graph.nodes.filter((node) => node.type === type.id).length}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <IconTooltip label="Typen filtern">
                  <button
                    type="button"
                    aria-label="Typen filtern"
                    aria-expanded={false}
                    className="grid size-11 place-items-center hover:bg-accent"
                    onClick={() => setFilterOpen(true)}
                  >
                    <Filter className="size-4" />
                  </button>
                </IconTooltip>
              )}
            </div>}

            {activeLens === "graph" && <div
              className="absolute bottom-4 z-20 transition-[right] duration-300"
              style={{ right: "calc(1rem + var(--adaptive-panel-margin-right, 0px))" }}
            >
              <IconTooltip label="Graph einpassen">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label="Graph einpassen"
                  className="size-12 rounded-full bg-background/95 shadow-lg backdrop-blur-md"
                  onClick={() => graphRef.current?.fitView()}
                >
                  <Maximize2 />
                </Button>
              </IconTooltip>
            </div>}

            {isLoading && (
              <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background/50">
                <p className="text-sm text-muted-foreground">Netzwerk wird geladen</p>
              </div>
            )}
            {activeLens === "graph" && !relationRecordsSupported && (
              <div className="absolute inset-0 z-30 grid place-items-center bg-background px-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Netzwerkdaten sind mit diesem Connector nicht verfügbar.
                </p>
              </div>
            )}
          </AppShellMain>
        </AppShell>
      </ModulePanelProvider>

      <AdaptivePanel
        open={profileOpen && currentUser !== null}
        onClose={() => setProfileOpen(false)}
        allowedModes={PROFILE_PANEL_MODES}
        modalClassName="sm:max-w-sm"
      >
        {currentUser && (
          <ProfilePanelContent
            mode="view"
            profile={{
              did: currentUser.id,
              name: currentUser.displayName ?? currentUser.id,
              avatar: currentUser.avatarUrl,
            }}
            onClose={() => setProfileOpen(false)}
          />
        )}
      </AdaptivePanel>
    </>
  )
}

export default function App({ connector }: AppProps) {
  return (
    <ConnectorProvider connector={connector}>
      <NetworkShell />
    </ConnectorProvider>
  )
}
