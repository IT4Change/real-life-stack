import { useCallback, useEffect, useMemo } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { Newspaper, Map as MapIcon, Calendar, Columns3, List } from "lucide-react"
import {
  useConnector,
  useGroups,
  useCurrentGroup,
  useItem,
  getSpacePrimaryColor,
  getReadableTextColor,
  type Workspace,
  type Module,
} from "@real-life-stack/toolkit"
import type { Group, Item } from "@real-life-stack/data-interface"
import { hasGroups } from "@real-life-stack/data-interface"

export const STORAGE_KEY_GROUP = "rls-active-group"
export const STORAGE_KEY_MODULE = "rls-active-module"

const MODULE_ICONS: Record<string, typeof Newspaper> = {
  feed: Newspaper,
  map: MapIcon,
  calendar: Calendar,
  kanban: Columns3,
  collection: List,
}

const MODULE_LABELS: Record<string, string> = {
  feed: "Feed",
  map: "Karte",
  calendar: "Kalender",
  kanban: "Kanban",
  collection: "Liste",
}

export const VALID_MODULES = ["feed", "kanban", "calendar", "map", "collection"]

// The aggregate ("Mein Netzwerk") keeps its internal scope id `__overview__`
// (used across the module views) but appears as `network` in the URL.
const OVERVIEW_ID = "__overview__"
const OVERVIEW_SLUG = "network"
/** Internal scope id → URL slug. */
export const scopeToSlug = (id: string) => (id === OVERVIEW_ID ? OVERVIEW_SLUG : id)
/** URL slug → internal scope id. */
const slugToScope = (slug: string) => (slug === OVERVIEW_SLUG ? OVERVIEW_ID : slug)

const OVERVIEW_WORKSPACE: Workspace = { id: OVERVIEW_ID, name: "Mein Netzwerk", scope: "overview" }

const TASK_STATUS = new Set(["open", "in-progress", "done", "archived"])

/**
 * Default module for a module-less item link (`/{scope}/{itemId}`), by field
 * presence: position→map, start→calendar, status/task→kanban, content→feed.
 * Falls back to the first module the space offers. (Decided with Anton: position
 * has priority — an event-at-a-place opens on the map.) Only the module-less
 * default; an explicit `/{scope}/{module}/{itemId}` always wins.
 */
function resolveDefaultModule(item: Item, available: string[]): string {
  const d = (item.data ?? {}) as Record<string, unknown>
  const pos = d.position as { coordinates?: unknown } | undefined
  const status = d.status
  const preferred =
    pos && Array.isArray(pos.coordinates)
      ? "map"
      : typeof d.start === "string" && d.start.length > 0
        ? "calendar"
        : item.type === "task" || (typeof status === "string" && TASK_STATUS.has(status))
          ? "kanban"
          : "feed"
  return available.includes(preferred) ? preferred : (available[0] ?? "feed")
}

export interface WorkspaceRouting {
  groups: Group[]
  /** Overview pseudo-workspace + one workspace per group. */
  workspaces: Workspace[]
  /**
   * Resolved from URL → localStorage → first workspace. Null when the
   * URL names a space the user has no access to (groups loaded, id
   * unknown) — the UI shows the no-access notice in that case.
   */
  activeWorkspace: Workspace | null
  /** Resolved from URL → localStorage → "feed". */
  activeModule: string
  /** Modules available in the active workspace (group's data.modules). */
  modules: Module[]
  isOverview: boolean
  urlSpaceId?: string
  urlItemId?: string
  /** Navigate to a workspace, keeping the module if the target offers it. */
  handleWorkspaceChange: (workspace: Workspace) => void
  /** Navigate to a module within the active workspace. */
  handleModuleChange: (moduleId: string, opts?: { replace?: boolean }) => void
}

/**
 * Owns the workspace/module/item routing concern of the reference app. URL
 * scheme (flat; the URL is the single source of truth for the focused item):
 *   /{scope}                   → redirect to /{scope}/{defaultModule}
 *   /{scope}/{module}          → module view
 *   /{scope}/{module}/{itemId} → module + focused item (canonical)
 *   /{scope}/{itemId}          → module-less item → resolveDefaultModule → redirect
 * `scope` is a space id, or `network` for the aggregate. The segment after the
 * scope is a module iff it is in VALID_MODULES, else a (module-less) item id —
 * generated ids never collide with the fixed module names.
 *
 * Pure glue — no rendering, no dialog state. Home composes the shell around this.
 */
export function useWorkspaceRouting(): WorkspaceRouting {
  const connector = useConnector()
  const navigate = useNavigate()
  const location = useLocation()
  const { scope: urlScope, seg: urlSeg, itemId: urlItemIdParam } = useParams<{
    scope?: string
    seg?: string
    itemId?: string
  }>()
  const { data: groups, isLoading: groupsLoading } = useGroups()
  const currentGroup = useCurrentGroup()

  // The segment after the scope is a module (known enum) or a module-less item id.
  const segIsModule = !!urlSeg && VALID_MODULES.includes(urlSeg)
  const urlModule = segIsModule ? urlSeg : undefined
  const moduleLessItemId = !segIsModule ? urlSeg : undefined
  // Canonical focused item: the 3rd segment (/{scope}/{module}/{itemId}).
  const urlItemId = urlItemIdParam
  // The space the URL names (aggregate slug → internal overview id).
  const urlSpaceId = urlScope ? slugToScope(urlScope) : undefined

  const basePath = import.meta.env.BASE_URL
  const workspaces: Workspace[] = useMemo(
    () => [
      OVERVIEW_WORKSPACE,
      ...groups.map((g) => ({
        id: g.id,
        name: g.name,
        avatar: g.data?.image as string | undefined ?? (g.data?.avatar ? `${basePath}${g.data.avatar}` : undefined),
        scope: g.data?.scope as string | undefined,
        primaryColor: g.data?.primaryColor as string | undefined,
      })),
    ],
    [groups, basePath]
  )

  // Derive active workspace from the URL scope (fallback localStorage → first space).
  const activeWorkspace: Workspace | null = useMemo(() => {
    if (urlSpaceId) {
      const found = workspaces.find((w) => w.id === urlSpaceId)
      if (found) return found
      // Scope id from URL but not in the list. While groups are still loading we
      // can't tell "no access" from "not yet loaded" — assume it exists
      // (optimistic placeholder) so valid deep-links don't flash the no-access
      // notice. Once groups are LOADED and it still doesn't resolve, it's a
      // foreign/inaccessible space → null so the UI says so. `groupsLoading` is a
      // real loaded signal (Observable.loaded).
      if (groupsLoading) return { id: urlSpaceId, name: "" }
      return null
    }
    const savedId = localStorage.getItem(STORAGE_KEY_GROUP)
    if (savedId) {
      const found = workspaces.find((w) => w.id === savedId)
      if (found) return found
    }
    return workspaces[0] ?? null
  }, [urlSpaceId, workspaces, groupsLoading])

  // Derive active module from the URL (with localStorage fallback → "feed").
  const activeModule = urlModule ?? localStorage.getItem(STORAGE_KEY_MODULE) ?? "feed"

  // Available modules for the active space (overview = all modules).
  const isOverview = activeWorkspace?.scope === "overview"
  const activeGroup = isOverview ? null : groups.find((g) => g.id === activeWorkspace?.id)
  const groupModuleIds = isOverview
    ? VALID_MODULES
    : (activeGroup?.data?.modules as string[] | undefined) ?? VALID_MODULES

  // Module-less item link (/{scope}/{itemId}): resolve the item's default module,
  // then redirect to the canonical /{scope}/{module}/{itemId}. The lookup must run
  // against the URL's scope — getItem is scope-dependent in the WoT connector, and
  // the scope is synced to the connector in a separate effect below. So gate the
  // lookup (and redirect) on the connector's currentGroup actually matching the
  // URL scope; otherwise a direct module-less deep-link to another space could
  // resolve "not found" against the still-current space and pick the wrong module.
  const expectedGroupId = activeWorkspace
    ? (activeWorkspace.scope === "overview" ? null : activeWorkspace.id)
    : null
  const scopeSynced = !!activeWorkspace && (currentGroup?.id ?? null) === expectedGroupId
  const { data: moduleLessItem, isLoading: moduleLessLoading } = useItem(
    moduleLessItemId && scopeSynced ? moduleLessItemId : "",
  )

  // Redirect bare/short paths to the canonical form.
  useEffect(() => {
    if (workspaces.length === 0 || !activeWorkspace) return
    const slug = scopeToSlug(activeWorkspace.id)
    // (a) No module/item segment (`/` or `/{scope}`) → default module.
    if (!urlSeg) {
      navigate(`/${slug}/${activeModule}`, { replace: true })
      return
    }
    // (b) Module-less item — only once the scope is synced AND the lookup settled.
    if (moduleLessItemId && scopeSynced && !moduleLessLoading) {
      const mod = moduleLessItem
        ? resolveDefaultModule(moduleLessItem, groupModuleIds)
        : (groupModuleIds[0] ?? "feed")
      navigate(`/${slug}/${mod}/${moduleLessItemId}`, { replace: true })
    }
  }, [
    workspaces.length,
    activeWorkspace,
    urlSeg,
    activeModule,
    moduleLessItemId,
    scopeSynced,
    moduleLessLoading,
    moduleLessItem,
    groupModuleIds,
    navigate,
  ])

  // Sync connector current group when workspace changes
  useEffect(() => {
    if (activeWorkspace && hasGroups(connector)) {
      connector.setCurrentGroup(activeWorkspace.scope === "overview" ? null : activeWorkspace.id)
    }
  }, [activeWorkspace?.id, connector]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save to localStorage for next session
  useEffect(() => {
    if (activeWorkspace) localStorage.setItem(STORAGE_KEY_GROUP, activeWorkspace.id)
    if (urlModule) localStorage.setItem(STORAGE_KEY_MODULE, urlModule)
  }, [activeWorkspace?.id, urlModule]) // eslint-disable-line react-hooks/exhaustive-deps

  const modules: Module[] = useMemo(
    () => groupModuleIds
      .filter((id) => MODULE_ICONS[id])
      .map((id) => ({ id, label: MODULE_LABELS[id] ?? id, icon: MODULE_ICONS[id] })),
    [groupModuleIds.join(",")] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Re-theme the app's primary color to the active space's identity color, so
  // every space has its own visual identity (buttons, focus rings, active
  // sidebar items, hover tints). Set on <html> so portaled content (dialogs,
  // dropdowns) re-themes too. The overview ("Mein Netzwerk") and the no-access
  // state keep the default brand color.
  useEffect(() => {
    const root = document.documentElement
    const PRIMARY_VARS = [
      "--primary", "--primary-foreground", "--ring",
      "--accent", "--accent-foreground",
      "--sidebar-primary", "--sidebar-primary-foreground", "--sidebar-ring",
      "--sidebar-accent", "--sidebar-accent-foreground",
    ]
    if (activeWorkspace && !isOverview) {
      const c = getSpacePrimaryColor(activeWorkspace.id, activeWorkspace.primaryColor)
      const fg = getReadableTextColor(c)
      const tint = `color-mix(in srgb, ${c} 14%, transparent)`
      root.style.setProperty("--primary", c)
      root.style.setProperty("--primary-foreground", fg)
      root.style.setProperty("--ring", c)
      root.style.setProperty("--accent", tint)
      // Text on the faint tinted accent surface must stay readable in both
      // light and dark mode — the surface is only a 14% tint of `c`, so the
      // raw space color (esp. a dark one in dark mode) would be unreadable.
      // `.dark` lives on <html> (App.tsx), so var(--foreground) resolves to
      // the active mode's foreground on this same element.
      root.style.setProperty("--accent-foreground", "var(--foreground)")
      root.style.setProperty("--sidebar-primary", c)
      root.style.setProperty("--sidebar-primary-foreground", fg)
      root.style.setProperty("--sidebar-ring", c)
      root.style.setProperty("--sidebar-accent", tint)
      root.style.setProperty("--sidebar-accent-foreground", "var(--sidebar-foreground)")
    } else {
      PRIMARY_VARS.forEach((v) => root.style.removeProperty(v))
    }
    return () => PRIMARY_VARS.forEach((v) => root.style.removeProperty(v))
  }, [activeWorkspace?.id, activeWorkspace?.primaryColor, isOverview])

  // Switch workspace (keep the module if offered). Item focus is space-scoped → dropped.
  const handleWorkspaceChange = useCallback((workspace: Workspace) => {
    const group = groups.find((g) => g.id === workspace.id)
    const mods = (group?.data?.modules as string[] | undefined) ?? VALID_MODULES
    const mod = mods.includes(activeModule) ? activeModule : (mods[0] ?? "feed")
    navigate(`/${scopeToSlug(workspace.id)}/${mod}`)
  }, [groups, activeModule, navigate])

  // Switch module within the active space, carrying the focused item if any —
  // plus its query, so an in-progress edit (`?edit`, needs the itemId) or create
  // (`?compose`, no itemId) continues seamlessly across module switches. The
  // create case is load-bearing for the map-pick: picking switches to the Map
  // module, and dropping `?compose` there would abort the create mid-pick.
  const handleModuleChange = useCallback((moduleId: string, opts?: { replace?: boolean }) => {
    if (!activeWorkspace) return
    const slug = scopeToSlug(activeWorkspace.id)
    const carryQuery = !!urlItemId || new URLSearchParams(location.search).has("compose")
    const base = urlItemId ? `/${slug}/${moduleId}/${urlItemId}` : `/${slug}/${moduleId}`
    const path = carryQuery ? `${base}${location.search}` : base
    navigate(path, opts?.replace ? { replace: true } : undefined)
  }, [activeWorkspace, urlItemId, location.search, navigate])

  return {
    groups,
    workspaces,
    activeWorkspace,
    activeModule,
    modules,
    isOverview,
    urlSpaceId,
    urlItemId,
    handleWorkspaceChange,
    handleModuleChange,
  }
}
