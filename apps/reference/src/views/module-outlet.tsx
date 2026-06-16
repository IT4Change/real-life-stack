import { useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Button, type Workspace } from "@real-life-stack/toolkit"
import type { Group } from "@real-life-stack/data-interface"
import { FeedView } from "./feed-view"
import { MapView } from "./map-view"
import { CalendarViewWrapper } from "./calendar-view"
import { KanbanView } from "./kanban-view"

export interface ModuleOutletProps {
  /**
   * Workspace resolved by useWorkspaceRouting. Null means the URL names
   * a space the user has no access to — renders the no-access notice.
   */
  activeWorkspace: Workspace | null
  activeModule: string
  groups: Group[]
  urlSpaceId?: string
  urlItemId?: string
}

/**
 * Renders the active module for the active workspace. Pure dispatch —
 * which modules exist and how each fills the space (map = full-bleed,
 * others = centered container) lives here; everything else stays with
 * the views.
 */
export function ModuleOutlet({ activeWorkspace, activeModule, groups, urlSpaceId, urlItemId }: ModuleOutletProps) {
  const navigate = useNavigate()

  // The app-level panel persists across module switches, so a panel entry's
  // onClose can fire after its owning module unmounted. Read the live route
  // via a ref (not the stale render closure) so Kanban's close handler only
  // syncs the URL while the user is actually still on the Kanban route.
  const routeRef = useRef({ module: activeModule, spaceId: activeWorkspace?.id })
  routeRef.current = { module: activeModule, spaceId: activeWorkspace?.id }

  if (urlSpaceId && !activeWorkspace) {
    return (
      <div className="container mx-auto px-4 pt-12 max-w-md text-center">
        <p className="text-lg font-medium text-foreground">Du bist kein Mitglied dieses Spaces</p>
        <p className="text-sm text-muted-foreground mt-2">Der Space existiert nicht oder du hast keinen Zugang.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Zurück zur Übersicht</Button>
      </div>
    )
  }

  if (activeModule === "map") {
    // Map fills the entire Space — no container, no padding, no width cap
    return (
      <MapView groupId={activeWorkspace?.id ?? ""} />
    )
  }

  // All modules render into the single app-level panel host (App.tsx);
  // no per-view ModulePanelProvider here anymore.
  const containerClass = `container mx-auto px-4 pt-6 ${activeModule === "kanban" || activeModule === "calendar" ? "max-w-5xl" : "max-w-3xl"}`

  if (activeModule === "kanban") {
    return (
      <div className={containerClass}>
        <KanbanView
          activeWorkspaceId={activeWorkspace?.id ?? null}
          groups={groups}
          selectedItemId={urlItemId}
          onItemSelect={(id) => navigate(`/spaces/${activeWorkspace?.id}/${activeModule}/item/${id}`)}
          onItemClose={() => {
            // Guard against the persisted shared panel firing this after the
            // user already left Kanban (would otherwise yank the route back).
            // Also require a real spaceId — on a no-access route activeWorkspace
            // is null, and we must not navigate to /spaces/undefined/kanban.
            const { module, spaceId } = routeRef.current
            if (module === "kanban" && spaceId) {
              navigate(`/spaces/${spaceId}/kanban`)
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className={containerClass}>
      {activeModule === "feed" && <FeedView groupId={activeWorkspace?.id ?? ""} />}
      {activeModule === "calendar" && <CalendarViewWrapper groupId={activeWorkspace?.id ?? ""} />}
    </div>
  )
}
