// App-Schicht des Modul-Registers (Spec 01, "Modul-Register").
//
// Das Toolkit fuehrt die Modul-Ids samt Label, Icon und Fuellmodus; die App
// haengt hier ihre Flaechen daran. Ein neues Modul braucht damit zwei
// Eintraege — einen im Toolkit-Register und die View hier — statt frueher
// sechs verstreuter Listen.
//
// Einmal importieren, vor dem ersten Render (main.tsx).

import type { Group } from "@real-life-stack/data-interface"
import {
  CORE_MODULE_LAYER,
  composeModules,
  setModuleRegistry,
  type ModuleViewProps,
  type SelectionFocusVisibleArea,
} from "@real-life-stack/toolkit"
import { FeedView } from "./views/feed-view"
import { MapView } from "./views/map-view"
import { CalendarViewWrapper } from "./views/calendar-view"
import { KanbanView } from "./views/kanban-view"
import { CollectionView } from "./views/collection-view"
import { ResonanceView } from "./views/resonance-view"
import { GraphViewWrapper } from "./views/graph-view"

// Die Views haben historisch leicht unterschiedliche Signaturen; hier werden
// sie auf den gemeinsamen Vertrag gebracht, damit der Dispatch nichts ueber
// einzelne Module wissen muss.
const Feed = ({ groupId }: ModuleViewProps) => <FeedView groupId={groupId} />
const Calendar = ({ groupId }: ModuleViewProps) => <CalendarViewWrapper groupId={groupId} />
const Resonance = ({ groupId }: ModuleViewProps) => <ResonanceView groupId={groupId} />
const Map = ({ groupId, active }: ModuleViewProps) => <MapView groupId={groupId} active={active} />
const Graph = ({ groupId }: ModuleViewProps) => (
  <GraphViewWrapper groupId={groupId || "__overview__"} />
)
const Kanban = ({ groupId, groups }: ModuleViewProps) => (
  <KanbanView activeWorkspaceId={groupId || null} groups={(groups ?? []) as Group[]} />
)
const Collection = ({ groupId, selectionFocusVisibleArea }: ModuleViewProps) => (
  <CollectionView
    groupId={groupId}
    selectionFocusVisibleArea={selectionFocusVisibleArea as SelectionFocusVisibleArea | undefined}
  />
)

// Einmal komponiert, einmal gebunden, danach unveraenderlich. Kein Konsument
// muss sich fragen, ob er zu frueh gelesen hat (Review #277).
export const MODULE_REGISTRY = composeModules([
  CORE_MODULE_LAYER,
  { name: "app", extensions: [
    { id: "feed", view: Feed },
    { id: "kanban", view: Kanban },
    { id: "calendar", view: Calendar },
    { id: "map", view: Map },
    { id: "resonance", view: Resonance },
    { id: "collection", view: Collection },
    { id: "graph", view: Graph },
  ] },
])

setModuleRegistry(MODULE_REGISTRY)
