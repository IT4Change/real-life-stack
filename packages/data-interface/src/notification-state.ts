import type { NotificationState, NotificationStatePatch } from "./index.js"

export const EMPTY_NOTIFICATION_STATE = (): NotificationState => ({ readEntryKeys: {}, mutedGroupIds: {} })

export function cloneNotificationState(state: Partial<NotificationState> | undefined): NotificationState {
  return {
    ...(state?.lastSeenTs ? { lastSeenTs: state.lastSeenTs } : {}),
    ...(state?.readUpToTs ? { readUpToTs: state.readUpToTs } : {}),
    readEntryKeys: { ...(state?.readEntryKeys ?? {}) },
    mutedGroupIds: { ...(state?.mutedGroupIds ?? {}) },
  }
}

/** Applies the public closed patch API, including deterministic 500-key pruning. */
export function applyNotificationStatePatch(state: NotificationState, patch: NotificationStatePatch): NotificationState {
  const next = cloneNotificationState(state)
  if (patch.op === "markSeen") next.lastSeenTs = maxTs(next.lastSeenTs, patch.ts)
  if (patch.op === "markAllReadUpTo") next.readUpToTs = maxTs(next.readUpToTs, patch.ts)
  if (patch.op === "markRead") Object.assign(next.readEntryKeys, patch.keys)
  if (patch.op === "mute") next.mutedGroupIds[patch.groupId] = true
  if (patch.op === "unmute") delete next.mutedGroupIds[patch.groupId]
  pruneReadEntryKeys(next)
  return next
}

export function maxTs(first: string | undefined, second: string): string {
  return !first || second > first ? second : first
}

/** Oldest first, with key as a deterministic tie-breaker. */
export function pruneReadEntryKeys(state: NotificationState): void {
  const ordered = Object.entries(state.readEntryKeys).sort(([keyA, tsA], [keyB, tsB]) => tsA.localeCompare(tsB) || keyA.localeCompare(keyB))
  while (ordered.length > 500) {
    const [key] = ordered.shift()!
    delete state.readEntryKeys[key]
  }
  if (ordered.length > 0) state.readUpToTs = maxTs(state.readUpToTs, ordered[0]![1])
}
