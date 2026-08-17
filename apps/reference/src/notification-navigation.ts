import { isAggregateVisibleItemType, type Group } from "@real-life-stack/data-interface"
import { displayableModules, moduleIds, type NotificationCandidate } from "@real-life-stack/toolkit"
import { resolveDefaultModule } from "./hooks/use-workspace-routing"

/**
 * The ONE canonical route for a notification click: scope, module and focus in
 * a single URL change (no setCurrentGroup→focusItem sequencing). The module
 * comes from the shared field-based resolver, fed by the connector-resolved
 * moduleHints — exactly the contract tested in B-T4.
 */
export function buildNotificationRoute(
  notification: NotificationCandidate,
  groups: readonly Group[],
): string {
  const group = groups.find(({ id }) => id === notification.groupId)
  // Unknown scope (e.g. the overview aggregate is not a group) must not
  // collapse the choice to feed — resolve against the full module set.
  // Ohne eigene Modul-Liste (Spec 01, "Modul-Register", Regel 1): die frueher
  // hier stehende Aufzaehlung kannte `collection` und `graph` nicht, obwohl
  // beide laengst existierten — Benachrichtigungen zu deren Items landeten
  // im falschen Tab.
  const available = Array.isArray(group?.data?.modules)
    ? displayableModules(group.data.modules as string[])
    : moduleIds()
  // Statements route via their schema hint (statement/v1 → hasStatement,
  // spec 06) — carried in moduleHints like every other activation signal.
  const module = resolveDefaultModule(
    notification.moduleHints ?? { hasPosition: false, hasStart: false, hasStatus: false },
    available,
  )
  return `/${notification.groupId}/${module}/${notification.subjectId}`
}

export type ModuleHintsLike = { hasPosition: boolean; hasStart: boolean; hasStatus: boolean; hasStatement?: boolean }

/**
 * Can the ACTIVE module actually show this item? Mirrors the lens escalation
 * rule (lens-active-item-escalates-view): a click in the raw history must
 * switch to a module that can display the target instead of focusing into a
 * view that will never render it.
 */
export function moduleCanDisplay(module: string, hints: ModuleHintsLike | undefined, itemType?: string): boolean {
  if (module === "map") return Boolean(hints?.hasPosition)
  if (module === "calendar") return Boolean(hints?.hasStart)
  if (module === "kanban") return Boolean(hints?.hasStatus)
  // Resonance shows statements only — activated by their schema hint (spec 06).
  if (module === "resonance") return Boolean(hints?.hasStatement)
  // The feed is the aggregating "what's new" view: it shows everything with a
  // card of its own, so it can display any item the feed's own selection keeps
  // (selectFeedItems in views/feed-view.tsx asks the SAME predicate — one rule,
  // not two lists that drift). An unknown type is displayable: the feed renders
  // it generically rather than escalating away from it.
  if (module === "feed") return itemType === undefined || isAggregateVisibleItemType(itemType)
  return true
}
