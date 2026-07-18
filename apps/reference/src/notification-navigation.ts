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
  const available = Array.isArray(group?.data?.modules) ? (group.data.modules as string[]) : ["feed"]
  const module = resolveDefaultModule(
    notification.moduleHints ?? { hasPosition: false, hasStart: false, hasStatus: false },
    available,
  )
  return `/${notification.groupId}/${module}/${notification.subjectId}`
}
