import type { DataInterface } from "@real-life-stack/data-interface"
import { hasGroups } from "@real-life-stack/data-interface"

export type NetworkLensId = "graph" | "list" | "kanban" | "map" | "calendar" | "marketplace"

export interface ModuleHintsLike {
  hasPosition: boolean
  hasStart: boolean
  hasStatus: boolean
}

/** Lens choice from connector-resolved hints — the one shared truth for clicks. */
export function lensForHints(hints: ModuleHintsLike | undefined): NetworkLensId {
  if (hints?.hasPosition) return "map"
  if (hints?.hasStart) return "calendar"
  if (hints?.hasStatus) return "kanban"
  return "list"
}

/** Can the given lens actually SHOW an item with these hints? */
export function lensCanDisplay(lens: NetworkLensId, hints: ModuleHintsLike | undefined, itemType?: string): boolean {
  if (lens === "map") return Boolean(hints?.hasPosition)
  if (lens === "calendar") return Boolean(hints?.hasStart)
  if (lens === "kanban") return Boolean(hints?.hasStatus)
  // The marketplace lens renders resource items exclusively.
  if (lens === "marketplace") return itemType === "resource"
  return true
}

/**
 * The ONE handler contract for opening a notification target in the network
 * shell (B-T4): switch group first, select the target WITHOUT consulting the
 * old space's item map (it cannot know cross-group ids), pick the lens from
 * the hints — the detail resolves reactively after the space switch.
 */
export function applyNotificationNavigation(
  target: { groupId: string; subjectId: string; subjectType?: string; moduleHints?: ModuleHintsLike },
  shell: {
    connector: DataInterface
    selectNodeId: (id: string) => void
    setActiveLens: (lens: NetworkLensId) => void
    close: () => void
    /** Graph filters from the OLD space must not hide the target type. */
    ensureTypeVisible?: (type: string) => void
  },
): void {
  if (hasGroups(shell.connector)) shell.connector.setCurrentGroup(target.groupId)
  if (target.subjectType) shell.ensureTypeVisible?.(target.subjectType)
  shell.selectNodeId(target.subjectId)
  shell.setActiveLens(lensForHints(target.moduleHints))
  shell.close()
}
