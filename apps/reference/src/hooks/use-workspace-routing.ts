import { useCallback, useEffect, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Newspaper, Map as MapIcon, Calendar, Columns3 } from "lucide-react"
import {
  useConnector,
  useGroups,
  type Workspace,
  type Module,
} from "@real-life-stack/toolkit"
import type { Group } from "@real-life-stack/data-interface"
import { hasGroups } from "@real-life-stack/data-interface"

export const STORAGE_KEY_GROUP = "rls-active-group"
export const STORAGE_KEY_MODULE = "rls-active-module"

const MODULE_ICONS: Record<string, typeof Newspaper> = {
  feed: Newspaper,
  map: MapIcon,
  calendar: Calendar,
  kanban: Columns3,
}

const MODULE_LABELS: Record<string, string> = {
  feed: "Feed",
  map: "Karte",
  calendar: "Kalender",
  kanban: "Kanban",
}

const VALID_MODULES = ["feed", "kanban", "calendar", "map"]

const OVERVIEW_WORKSPACE: Workspace = { id: "__overview__", name: "Mein Netzwerk", scope: "overview" }

export interface WorkspaceRouting {
  groups: Group[]
  /** Overview pseudo-workspace + one workspace per group. */
  workspaces: Workspace[]
  /** Resolved from URL → localStorage → first workspace. Null while empty. */
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
  handleModuleChange: (moduleId: string) => void
}

/**
 * Owns the workspace/module routing concern of the reference app:
 * deriving the workspace list from groups, resolving the active
 * workspace/module from the URL (with localStorage fallback for the
 * next session), keeping the connector's current group in sync, and
 * exposing the two navigation handlers.
 *
 * Pure glue — no rendering, no dialog state. Home composes the shell
 * around this.
 */
export function useWorkspaceRouting(): WorkspaceRouting {
  const connector = useConnector()
  const navigate = useNavigate()
  const { spaceId: urlSpaceId, module: urlModule, itemId: urlItemId } = useParams<{ spaceId?: string; module?: string; itemId?: string }>()
  const { data: groups } = useGroups()

  const basePath = import.meta.env.BASE_URL
  const workspaces: Workspace[] = useMemo(
    () => [
      OVERVIEW_WORKSPACE,
      ...groups.map((g) => ({
        id: g.id,
        name: g.name,
        avatar: g.data?.image as string | undefined ?? (g.data?.avatar ? `${basePath}${g.data.avatar}` : undefined),
        scope: g.data?.scope as string | undefined,
      })),
    ],
    [groups, basePath]
  )

  // Derive active workspace from URL params (with fallback to localStorage → first space)
  const activeWorkspace: Workspace | null = useMemo(() => {
    if (urlSpaceId) {
      const found = workspaces.find((w) => w.id === urlSpaceId)
      if (found) return found
      // Space ID from URL but not found in list — might still be loading
      if (workspaces.length === 0) return { id: urlSpaceId, name: "" }
      // Unknown space ID (e.g. from a different connector) — fall back to first workspace
    }
    // No space in URL or unknown ID — try localStorage, then first workspace
    const savedId = localStorage.getItem(STORAGE_KEY_GROUP)
    if (savedId) {
      const found = workspaces.find((w) => w.id === savedId)
      if (found) return found
    }
    return workspaces[0] ?? null
  }, [urlSpaceId, workspaces])

  // Derive active module from URL params
  const activeModule = urlModule && VALID_MODULES.includes(urlModule) ? urlModule : (localStorage.getItem(STORAGE_KEY_MODULE) ?? "feed")

  // Redirect to URL with space/module if not already there
  useEffect(() => {
    if (workspaces.length === 0) return
    if (!urlSpaceId && activeWorkspace) {
      navigate(`/spaces/${activeWorkspace.id}/${activeModule}`, { replace: true })
    }
  }, [workspaces.length, urlSpaceId, activeWorkspace, activeModule, navigate])

  // Sync connector current group when workspace changes
  useEffect(() => {
    if (activeWorkspace && hasGroups(connector)) {
      connector.setCurrentGroup(activeWorkspace.scope === "overview" ? null : activeWorkspace.id)
    }
  }, [activeWorkspace?.id, connector]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save to localStorage for next session
  useEffect(() => {
    if (activeWorkspace) localStorage.setItem(STORAGE_KEY_GROUP, activeWorkspace.id)
    if (urlModule && VALID_MODULES.includes(urlModule)) localStorage.setItem(STORAGE_KEY_MODULE, urlModule)
  }, [activeWorkspace?.id, urlModule]) // eslint-disable-line react-hooks/exhaustive-deps

  // Derive available modules from active group's data.modules (overview = all modules)
  const isOverview = activeWorkspace?.scope === "overview"
  const activeGroup = isOverview ? null : groups.find((g) => g.id === activeWorkspace?.id)
  const groupModuleIds = isOverview
    ? VALID_MODULES
    : (activeGroup?.data?.modules as string[] | undefined) ?? VALID_MODULES
  const modules: Module[] = useMemo(
    () => groupModuleIds
      .filter((id) => MODULE_ICONS[id])
      .map((id) => ({ id, label: MODULE_LABELS[id] ?? id, icon: MODULE_ICONS[id] })),
    [groupModuleIds.join(",")] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // When switching workspace, navigate to URL
  const handleWorkspaceChange = useCallback((workspace: Workspace) => {
    const group = groups.find((g) => g.id === workspace.id)
    const mods = (group?.data?.modules as string[] | undefined) ?? VALID_MODULES
    const mod = mods.includes(activeModule) ? activeModule : (mods[0] ?? "feed")
    navigate(`/spaces/${workspace.id}/${mod}`)
  }, [groups, activeModule, navigate])

  const handleModuleChange = useCallback((moduleId: string) => {
    if (activeWorkspace) {
      navigate(`/spaces/${activeWorkspace.id}/${moduleId}`)
    }
  }, [activeWorkspace, navigate])

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
