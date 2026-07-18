import { startTransition, useEffect, useMemo, useReducer } from "react"
import { EMPTY_NOTIFICATION_STATE, hasNotificationState, hasScopedActivityLog } from "@real-life-stack/data-interface"
import { projectNotifications, unreadHighPriorityKeys } from "../components/activity/notification-center"
import { useConnector } from "./connector-context"
import { useGroups } from "./use-groups"
import { useCurrentUser } from "./use-auth"

/** Optional shell enhancement; raw activity remains available without it. */
export function useNotifications() {
  const connector = useConnector(); const { data: groups } = useGroups(); const { data: user } = useCurrentUser()
  const scoped = useMemo(() => hasScopedActivityLog(connector) ? connector.observeScopedActivity() : null, [connector])
  const notificationState = useMemo(() => hasNotificationState(connector) ? connector.observeNotificationState() : null, [connector])
  const [, rerender] = useReducer((value: number) => value + 1, 0)
  useEffect(() => scoped?.subscribe(() => startTransition(rerender)), [scoped])
  useEffect(() => notificationState?.subscribe(() => startTransition(rerender)), [notificationState])
  const state = notificationState?.current ?? EMPTY_NOTIFICATION_STATE()
  const supported = scoped !== null
  const stateSupported = notificationState !== null
  const projected = useMemo(() => !supported || !user ? [] : projectNotifications(scoped.current, { groupsById: new Map(groups.map((group) => [group.id, group])), selfId: user.id }, state, new Date()), [groups, scoped, state, supported, user])
  // Without the optional state capability, the center remains a read-only view.
  const notifications = useMemo(() => stateSupported ? projected : projected.map((notification) => ({ ...notification, isRead: true })), [projected, stateSupported])
  const unseenKeys = useMemo(() => stateSupported ? unreadHighPriorityKeys(notifications, state) : [], [notifications, state, stateSupported])
  const maxTs = notifications.reduce<string | undefined>((latest, notification) => !latest || notification.ts > latest ? notification.ts : latest, undefined)
  return { supported, stateSupported, notifications, state, badgeCount: unseenKeys.length, maxTs, update: hasNotificationState(connector) ? connector.updateNotificationState.bind(connector) : undefined }
}
