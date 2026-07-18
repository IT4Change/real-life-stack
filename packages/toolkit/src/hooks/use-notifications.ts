import { startTransition, useCallback, useEffect, useMemo, useReducer, useRef } from "react"
import { EMPTY_NOTIFICATION_STATE, hasNotificationState, hasScopedActivityLog, type NotificationStatePatch } from "@real-life-stack/data-interface"
import { projectNotifications, unreadHighPriorityKeys } from "../components/activity/notification-center"
import { useConnector } from "./connector-context"
import { useGroups } from "./use-groups"
import { useCurrentUser } from "./use-auth"

/** Optional shell enhancement; raw activity remains available without it. */
export function useNotifications() {
  const connector = useConnector(); const { data: groups } = useGroups(); const { data: user } = useCurrentUser()
  const scoped = useMemo(() => hasScopedActivityLog(connector) ? connector.observeScopedActivity() : null, [connector])
  const notificationState = useMemo(() => hasNotificationState(connector) ? connector.observeNotificationState() : null, [connector])
  // Observable instances are cached by connectors; their `.current` values are
  // not. Keep a revision so derived projections rerun for each emission.
  const [revision, rerender] = useReducer((value: number) => value + 1, 0)
  useEffect(() => scoped?.subscribe(() => startTransition(rerender)), [scoped])
  useEffect(() => notificationState?.subscribe(() => startTransition(rerender)), [notificationState])
  const state = useMemo(() => notificationState?.current ?? EMPTY_NOTIFICATION_STATE(), [notificationState, revision])
  const supported = scoped !== null
  const stateSupported = notificationState !== null
  const projected = useMemo(() => !supported || !user ? [] : projectNotifications(scoped.current, { groupsById: new Map(groups.map((group) => [group.id, group])), selfId: user.id }, state, new Date()), [groups, revision, scoped, state, supported, user])
  // Without the optional state capability, the center remains a read-only view.
  const notifications = useMemo(() => stateSupported ? projected : projected.map((notification) => ({ ...notification, isRead: true })), [projected, stateSupported])
  const unseenKeys = useMemo(() => stateSupported ? unreadHighPriorityKeys(notifications, state) : [], [notifications, state, stateSupported])
  const maxTs = notifications.reduce<string | undefined>((latest, notification) => !latest || notification.ts > latest ? notification.ts : latest, undefined)
  const update = useCallback((patch: NotificationStatePatch) => {
    if (!hasNotificationState(connector)) return Promise.resolve()
    return connector.updateNotificationState(patch)
  }, [connector])
  return { supported, stateSupported, notifications, state, badgeCount: unseenKeys.length, maxTs, update: stateSupported ? update : undefined }
}

/** Mark the visible frontier once per center mount, and only when it advances. */
export function useMarkNotificationsSeen(notifications: ReturnType<typeof useNotifications>) {
  const seenAtOpen = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!notifications.stateSupported || !notifications.maxTs || notifications.maxTs <= (seenAtOpen.current ?? notifications.state.lastSeenTs ?? "")) return
    seenAtOpen.current = notifications.maxTs
    void notifications.update?.({ op: "markSeen", ts: notifications.maxTs })
  }, [notifications.maxTs, notifications.state.lastSeenTs, notifications.stateSupported, notifications.update])
}
