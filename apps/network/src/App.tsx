import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ExternalLink,
  Filter,
  Maximize2,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react"
import type { DataInterface, Item } from "@real-life-stack/data-interface"
import { hasGroups } from "@real-life-stack/data-interface"
import {
  AppShell,
  AppShellMain,
  Button,
  ConnectorProvider,
  GraphView,
  Input,
  Navbar,
  NavbarCenter,
  NavbarEnd,
  NavbarStart,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  WorkspaceSwitcher,
  useConnector,
  useCurrentGroup,
  useGroups,
  useItems,
  type GraphEdge,
  type GraphNode,
  type GraphTypeDescriptor,
  type GraphViewHandle,
  type Workspace,
} from "@real-life-stack/toolkit"

import { projectEmbeddedGraph } from "./lib/project-embedded-graph"

const GRAPH_TYPES: readonly GraphTypeDescriptor[] = [
  { id: "person", label: "Personen", color: "#2a78d6", darkColor: "#3987e5" },
  { id: "project", label: "Projekte", color: "#1baf7a", darkColor: "#199e70" },
  { id: "event", label: "Sessions", color: "#eda100", darkColor: "#c98500" },
]

const ALL_GRAPH_TYPES = new Set(GRAPH_TYPES.map(({ id }) => id))
const THEME_KEY = "rls-network-theme"

interface AppProps {
  connector: DataInterface
}

function initialDarkMode(): boolean {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored) return stored === "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function nodeTitle(item: Item): string {
  const candidates = [item.data.displayName, item.data.title, item.data.label, item.data.name]
  return candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? item.id
}

function graphTypeLabel(type: string): string {
  return GRAPH_TYPES.find(({ id }) => id === type)?.label ?? type
}

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

function DetailSidebar({
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
  const links = item ? safeLinks(item) : []
  const avatarUrl = item && typeof item.data.avatar === "string" &&
    /^(?:data:image\/|https?:\/\/)/.test(item.data.avatar)
    ? item.data.avatar
    : null
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
    <aside
      aria-label="Details zum ausgewählten Eintrag"
      aria-hidden={!item}
      className={`absolute inset-y-0 right-0 z-30 flex w-[min(23rem,calc(100vw-0.75rem))] flex-col border-l bg-background/98 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-out ${
        item ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
    >
      {item && (
        <>
          <header className="flex min-h-14 items-center gap-3 border-b px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">{graphTypeLabel(item.type)}</p>
              <h2 className="truncate text-base font-semibold">{nodeTitle(item)}</h2>
            </div>
            <IconTooltip label="Details schließen">
              <Button type="button" variant="ghost" size="icon" aria-label="Details schließen" onClick={onClose}>
                <X />
              </Button>
            </IconTooltip>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="mb-5 aspect-square w-full max-w-56 rounded-md border object-cover"
                onError={(event) => { event.currentTarget.hidden = true }}
              />
            )}

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
    </aside>
  )
}

function NetworkShell() {
  const connector = useConnector()
  const { data: groups } = useGroups()
  const currentGroup = useCurrentGroup()
  const { data: items, isLoading } = useItems()
  const graphRef = useRef<GraphViewHandle>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [filterOpen, setFilterOpen] = useState(false)
  const [enabledTypes, setEnabledTypes] = useState(() => new Set(ALL_GRAPH_TYPES))
  const [isDark, setIsDark] = useState(initialDarkMode)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark)
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light")
  }, [isDark])

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
  const graph = useMemo(() => projectEmbeddedGraph(items), [items])
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes])
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

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
  const selectedConnections = useMemo(
    () => selectedNodeId
      ? graph.edges.filter(({ sourceId, targetId }) => sourceId === selectedNodeId || targetId === selectedNodeId)
      : [],
    [graph.edges, selectedNodeId],
  )

  const searchResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de")
    if (!needle) return []
    return graph.nodes
      .filter(({ label }) => label.toLocaleLowerCase("de").includes(needle))
      .slice(0, 8)
  }, [graph.nodes, query])

  const selectNode = useCallback((nodeId: string) => {
    const node = nodeById.get(nodeId)
    if (!node) return
    setEnabledTypes((current) => current.has(node.type) ? current : new Set([...current, node.type]))
    setSelectedNodeId(nodeId)
    setQuery("")
    requestAnimationFrame(() => graphRef.current?.focusNode(nodeId))
  }, [nodeById])

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

  return (
    <AppShell>
      <Navbar>
        <NavbarStart>
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            onWorkspaceChange={handleWorkspaceChange}
          />
        </NavbarStart>
        <NavbarCenter>
          <p className="text-sm tabular-nums text-muted-foreground">
            {visibleNodes.length} Knoten · {visibleEdges.length} Verbindungen
          </p>
        </NavbarCenter>
        <NavbarEnd>
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
        </NavbarEnd>
      </Navbar>

      <AppShellMain className="relative min-h-0 overflow-hidden">
        <GraphView
          ref={graphRef}
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={GRAPH_TYPES}
          selectedNodeId={selectedNodeId}
          onSelectedNodeChange={setSelectedNodeId}
          fitViewKey={currentGroup?.id ?? "none"}
          ariaLabel={`Netzwerkgraph ${activeWorkspace?.name ?? ""}`}
        />

        <div className="absolute left-3 top-3 z-20 w-[min(22rem,calc(100%-1.5rem))] sm:left-4 sm:top-4">
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
        </div>

        <div
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
        </div>

        <div className={`absolute bottom-4 z-20 transition-[right] duration-300 ${selectedItem ? "right-4 md:right-[24rem]" : "right-4"}`}>
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
        </div>

        {isLoading && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background/50">
            <p className="text-sm text-muted-foreground">Netzwerk wird geladen</p>
          </div>
        )}

        <DetailSidebar
          item={selectedItem}
          connections={selectedConnections}
          nodeById={nodeById}
          onClose={() => setSelectedNodeId(null)}
          onSelectNode={selectNode}
        />
      </AppShellMain>
    </AppShell>
  )
}

export default function App({ connector }: AppProps) {
  return (
    <ConnectorProvider connector={connector}>
      <NetworkShell />
    </ConnectorProvider>
  )
}
