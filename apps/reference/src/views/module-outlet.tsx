import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button, type SelectionFocusVisibleArea, type Workspace } from "@real-life-stack/toolkit"
import type { Group } from "@real-life-stack/data-interface"
import { FeedView } from "./feed-view"
import { MapView } from "./map-view"
import { CalendarViewWrapper } from "./calendar-view"
import { KanbanView } from "./kanban-view"
import { CollectionView } from "./collection-view"
import { ResonanceView } from "./resonance-view"
import { GraphViewWrapper } from "./graph-view"

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
  selectionFocusVisibleArea?: SelectionFocusVisibleArea
}

/**
 * Renders the active module for the active workspace. Pure dispatch —
 * which modules exist and how each fills the space (map = full-bleed,
 * others = centered container) lives here; everything else stays with
 * the views.
 */
export function ModuleOutlet({ activeWorkspace, activeModule, groups, urlSpaceId, selectionFocusVisibleArea }: ModuleOutletProps) {
  const navigate = useNavigate()

  const noAccess = !!urlSpaceId && !activeWorkspace
  const isMap = activeModule === "map" && !noAccess

  // The map is expensive to (re)initialise (WebGL context + workers + remote
  // style + tiles ≈ 1s every time). So instead of mounting it on demand and
  // tearing it down on every module switch, we keep it alive: mount it lazily
  // on the first map visit, then keep it in the tree and just hide it when
  // another module is active. ModuleOutlet itself persists across module
  // switches (the route always renders <Home>), so this state survives.
  const [mapVisited, setMapVisited] = useState(isMap)
  useEffect(() => {
    if (isMap) setMapVisited(true)
  }, [isMap])

  // All modules render into the single app-level panel host (App.tsx);
  // no per-view ModulePanelProvider here anymore.
  const containerClass = `container mx-auto px-4 pt-6 ${activeModule === "kanban" || activeModule === "calendar" ? "max-w-5xl" : "max-w-3xl"}`

  return (
    <>
      {/* Persistent, full-bleed map host. Kept mounted across module switches
          (hidden via display:none when inactive) so returning to the map is
          instant — no maplibre re-init. Lazily created on first visit so users
          who never open the map don't pay for it. */}
      {mapVisited && (
        <div className="h-full w-full" style={isMap ? undefined : { display: "none" }}>
          <MapView groupId={activeWorkspace?.id ?? ""} active={isMap} />
        </div>
      )}

      {noAccess ? (
        <div className="container mx-auto px-4 pt-12 max-w-md text-center">
          <p className="text-lg font-medium text-foreground">Du bist kein Mitglied dieses Spaces</p>
          <p className="text-sm text-muted-foreground mt-2">Der Space existiert nicht oder du hast keinen Zugang.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Zurück zur Übersicht</Button>
        </div>
      ) : activeModule === "kanban" ? (
        <div className={containerClass}>
          <KanbanView activeWorkspaceId={activeWorkspace?.id ?? null} groups={groups} />
        </div>
      ) : activeModule === "feed" ? (
        <div className={containerClass}>
          <FeedView groupId={activeWorkspace?.id ?? ""} />
        </div>
      ) : activeModule === "calendar" ? (
        <div className={containerClass}>
          <CalendarViewWrapper groupId={activeWorkspace?.id ?? ""} />
        </div>
      ) : activeModule === "collection" ? (
        <CollectionView
          groupId={activeWorkspace?.id ?? ""}
          selectionFocusVisibleArea={selectionFocusVisibleArea}
        />
      ) : activeModule === "resonance" ? (
        <div className={containerClass}>
          <ResonanceView groupId={activeWorkspace?.id ?? ""} />
        </div>
      ) : activeModule === "graph" ? (
        // Full-bleed like the map: the canvas needs the whole viewport, the
        // container padding would just shrink it.
        <div className="h-[calc(100dvh-8rem)] min-h-0">
          <GraphViewWrapper groupId={activeWorkspace?.id ?? "__overview__"} />
        </div>
      ) : null}
    </>
  )
}
