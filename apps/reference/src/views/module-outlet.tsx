import { useNavigate } from "react-router-dom"
import { Button, ModulePanelProvider, type Workspace } from "@real-life-stack/toolkit"
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
      <ModulePanelProvider>
        <MapView groupId={activeWorkspace?.id ?? ""} />
      </ModulePanelProvider>
    )
  }

  // Kanban brings its own ModulePanelProvider so it can wire pin
  // state and URL routing through the shared panel; other modules use
  // the default provider here.
  const containerClass = `container mx-auto px-4 pt-6 ${activeModule === "kanban" ? "max-w-5xl" : "max-w-3xl"}`

  if (activeModule === "kanban") {
    return (
      <div className={containerClass}>
        <KanbanView
          activeWorkspaceId={activeWorkspace?.id ?? null}
          groups={groups}
          selectedItemId={urlItemId}
          onItemSelect={(id) => navigate(`/spaces/${activeWorkspace?.id}/${activeModule}/item/${id}`)}
          onItemClose={() => navigate(`/spaces/${activeWorkspace?.id}/${activeModule}`)}
        />
      </div>
    )
  }

  return (
    <ModulePanelProvider>
      <div className={containerClass}>
        {activeModule === "feed" && <FeedView groupId={activeWorkspace?.id ?? ""} />}
        {activeModule === "calendar" && <CalendarViewWrapper groupId={activeWorkspace?.id ?? ""} />}
      </div>
    </ModulePanelProvider>
  )
}
