import type { Group } from "@real-life-stack/data-interface"
import type { NotificationCandidate } from "@real-life-stack/toolkit"
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
  const available = Array.isArray(group?.data?.modules) ? (group.data.modules as string[]) : ["feed", "map", "kanban", "calendar", "resonance"]
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
  // The feed unions content-items (posts), start-items (events) and
  // statements — anything else (pure tasks, places, people) never appears there.
  if (module === "feed") return itemType === "post" || Boolean(hints?.hasStart) || Boolean(hints?.hasStatement)
  return true
}
