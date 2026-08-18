import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Button,
  getModule,
  getModules,
  type SelectionFocusVisibleArea,
  type Workspace,
} from "@real-life-stack/toolkit"
import type { Group } from "@real-life-stack/data-interface"

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
 * Renders the active module for the active workspace. Pure dispatch over the
 * module register (spec 01) — this file knows no module by name any more.
 * Which modules exist, how each fills the space and which ones are expensive
 * enough to keep mounted all live in the register.
 */
export function ModuleOutlet({
  activeWorkspace,
  activeModule,
  groups,
  urlSpaceId,
  selectionFocusVisibleArea,
}: ModuleOutletProps) {
  const navigate = useNavigate()
  const noAccess = !!urlSpaceId && !activeWorkspace
  const groupId = activeWorkspace?.id ?? ""

  // Modules flagged `keepMounted` are expensive to (re)initialise — the map
  // costs a WebGL context, workers, a remote style and its tiles, roughly a
  // second every time. So instead of mounting on demand and tearing down on
  // every module switch, they are created on first visit and then hidden
  // while another module is active. ModuleOutlet persists across module
  // switches (the route always renders <Home>), so this state survives.
  const [visited, setVisited] = useState<string[]>(() => (noAccess ? [] : [activeModule]))
  useEffect(() => {
    if (noAccess) return
    setVisited((prev) => (prev.includes(activeModule) ? prev : [...prev, activeModule]))
  }, [activeModule, noAccess])

  const persistent = getModules().filter((m) => m.keepMounted && visited.includes(m.id))
  const active = getModule(activeModule)
  const activeIsPersistent = !!active?.keepMounted

  const wrap = (id: string, node: React.ReactNode) => {
    const mod = getModule(id)
    if (mod?.fill === "bleed") return node
    return (
      <div className={`container mx-auto px-4 pt-6 ${mod?.maxWidth ?? "max-w-3xl"}`}>{node}</div>
    )
  }

  return (
    <>
      {/* Persistent, full-bleed hosts. Kept mounted across module switches
          (hidden via display:none when inactive) so returning is instant.
          Lazily created on first visit so users who never open them don't
          pay for it. */}
      {persistent.map((mod) => {
        const View = mod.view
        if (!View) return null
        const isActive = mod.id === activeModule && !noAccess
        return (
          <div
            key={mod.id}
            className="h-full w-full"
            style={isActive ? undefined : { display: "none" }}
          >
            <View
              groupId={groupId}
              active={isActive}
              groups={groups}
              selectionFocusVisibleArea={selectionFocusVisibleArea}
            />
          </div>
        )
      })}

      {noAccess ? (
        <div className="container mx-auto px-4 pt-12 max-w-md text-center">
          <p className="text-lg font-medium text-foreground">Du bist kein Mitglied dieses Spaces</p>
          <p className="text-sm text-muted-foreground mt-2">
            Der Space existiert nicht oder du hast keinen Zugang.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>
            Zurück zur Übersicht
          </Button>
        </div>
      ) : activeIsPersistent ? null : active?.view ? (
        wrap(
          active.id,
          <active.view
            groupId={groupId}
            active
            groups={groups}
            selectionFocusVisibleArea={selectionFocusVisibleArea}
          />,
        )
      ) : active ? (
        // Registered but no surface attached — say so instead of showing an
        // empty page (spec 01, rule 5).
        <div className="container mx-auto px-4 pt-12 max-w-md text-center">
          <p className="text-lg font-medium text-foreground">{active.label}</p>
          <p className="text-sm text-muted-foreground mt-2">
            Für dieses Modul ist in dieser App keine Ansicht hinterlegt.
          </p>
        </div>
      ) : null}
    </>
  )
}
