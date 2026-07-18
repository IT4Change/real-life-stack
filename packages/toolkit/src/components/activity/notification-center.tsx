import { useState } from "react"
import type { Group, NotificationState, ScopedActivityEntry } from "@real-life-stack/data-interface"
import { Bell, MessageCircle, MoreHorizontal, Pencil, Plus, Smile, Trash2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage, EmptyState, RelativeTime } from "../primitives"
import { cn } from "../../lib/utils"

export type NotificationAction = "created" | "updated" | "deleted" | "reacted" | "commented"
export type NotificationPriority = "high" | "low"

export interface NotificationCandidate {
  groupId: string; groupName: string; subjectId: string; subjectType: string; subjectTitle?: string
  semanticAction: NotificationAction; priority: NotificationPriority; muted: boolean
  entryId: string; readKey: string; actorId: string; actor: ScopedActivityEntry["actor"]; ts: string
  targetExists: boolean; moduleHints?: NonNullable<ScopedActivityEntry["subject"]>["moduleHints"]
  readKeys: Record<string, string>; actorCount: number; isRead: boolean
}

const lifecycle = new Set<NotificationAction>(["created", "updated", "deleted"])
const lifecycleRank: Record<NotificationAction, number> = { deleted: 3, updated: 2, created: 1, reacted: 0, commented: 0 }
const isReadKey = (key: string, ts: string, state: NotificationState) => Boolean(state.readEntryKeys[key]) || (!!state.readUpToTs && ts <= state.readUpToTs)
const compare = (a: NotificationCandidate, b: NotificationCandidate) => b.ts.localeCompare(a.ts) || lifecycleRank[b.semanticAction] - lifecycleRank[a.semanticAction] || b.actorId.localeCompare(a.actorId) || b.entryId.localeCompare(a.entryId)

function actionFor(scoped: ScopedActivityEntry): NotificationAction | null {
  const { entry } = scoped
  if (entry.action === "delete") return entry.targetType === "reaction" || entry.targetType === "comment" ? null : "deleted"
  if (entry.action !== "create" && entry.action !== "update") return null
  if (entry.targetType === "reaction") return entry.action === "create" ? "reacted" : null
  if (entry.targetType === "comment") return entry.action === "create" ? "commented" : null
  return entry.action === "create" ? "created" : "updated"
}

/** Pure all-space projection. Connector data is intentionally the only live lookup. */
export function projectNotifications(scoped: readonly ScopedActivityEntry[], ctx: { groupsById: Map<string, Group>; selfId: string }, state: NotificationState, _now: Date): NotificationCandidate[] {
  const normal = scoped.flatMap((item): NotificationCandidate[] => {
    const semanticAction = actionFor(item)
    if (!semanticAction || item.isPersonal || item.actor?.id === ctx.selfId) return []
    if (semanticAction !== "deleted" && (!item.targetExists || !item.subject)) return []
    const subject = item.subject
    if (!subject) return []
    const group = ctx.groupsById.get(item.groupId)
    if (!group) return []
    const entryId = item.entry.id; const readKey = JSON.stringify([item.groupId, entryId])
    return [{
      groupId: item.groupId, groupName: group.name, subjectId: subject.id, subjectType: subject.type, subjectTitle: subject.title,
      semanticAction, priority: semanticAction === "reacted" || semanticAction === "commented" ? (subject.createdBy === ctx.selfId ? "high" : "low") : "low",
      muted: Boolean(state.mutedGroupIds[item.groupId]), entryId, readKey, actorId: item.actor?.id ?? item.entry.actor, actor: item.actor,
      ts: item.entry.ts, targetExists: item.targetExists, moduleHints: subject.moduleHints, readKeys: { [readKey]: item.entry.ts }, actorCount: 1,
      isRead: isReadKey(readKey, item.entry.ts, state),
    }]
  })
  const nonLifecycle = normal.filter((candidate) => !lifecycle.has(candidate.semanticAction))
  const collapsed = [...normal.filter((candidate) => lifecycle.has(candidate.semanticAction))]
    .sort(compare).filter((candidate, index, all) => index === all.findIndex((other) => other.groupId === candidate.groupId && other.subjectType === candidate.subjectType && other.subjectId === candidate.subjectId))
  const bySemantic = new Map<string, NotificationCandidate[]>()
  for (const candidate of [...collapsed, ...nonLifecycle]) {
    const key = JSON.stringify([candidate.groupId, candidate.subjectType, candidate.subjectId, candidate.semanticAction])
    bySemantic.set(key, [...(bySemantic.get(key) ?? []), candidate])
  }
  const bundles: NotificationCandidate[] = []
  for (const candidates of bySemantic.values()) {
    const sorted = candidates.sort(compare)
    for (let start = 0; start < sorted.length;) {
      const newest = sorted[start]; const parts = [newest]; start += 1
      while (start < sorted.length && new Date(newest.ts).getTime() - new Date(sorted[start].ts).getTime() <= 86_400_000) parts.push(sorted[start++])
      const actors = new Set(parts.map(({ actorId }) => actorId)); const readKeys: Record<string, string> = Object.assign({}, ...parts.map(({ readKeys }) => readKeys))
      bundles.push({ ...newest, readKeys, actorCount: actors.size, isRead: Object.entries(readKeys).every(([key, ts]) => isReadKey(key, ts, state)) })
    }
  }
  return bundles.sort(compare)
}

export function unreadHighPriorityKeys(notifications: readonly NotificationCandidate[], state?: NotificationState): string[] {
  return notifications.flatMap((notification) => notification.priority === "high" && !notification.muted
    ? (Object.entries(notification.readKeys) as Array<[string, string]>).filter(([key, ts]) => !isReadKey(key, ts, state ?? { readEntryKeys: {}, mutedGroupIds: {} }) && (!state?.lastSeenTs || ts > state.lastSeenTs)).map(([key]) => key) : [])
}

const presentation = {
  created: { verb: "erstellt", icon: Plus }, updated: { verb: "geändert", icon: Pencil }, deleted: { verb: "gelöscht", icon: Trash2 }, reacted: { verb: "reagiert", icon: Smile }, commented: { verb: "kommentiert", icon: MessageCircle },
} as const

export interface NotificationCenterProps {
  notifications: readonly NotificationCandidate[]; onOpenSubject?: (notification: NotificationCandidate) => void; onOpenGroup?: (groupId: string) => void
  onMarkRead?: (keys: Record<string, string>) => void; onMarkAllRead?: () => void; onMuteGroup?: (groupId: string, muted: boolean) => void; onOpenActivity?: () => void
}

export function NotificationCenter({ notifications, onOpenSubject, onOpenGroup, onMarkRead, onMarkAllRead, onMuteGroup, onOpenActivity }: NotificationCenterProps) {
  const [tab, setTab] = useState<"personal" | "groups">("personal")
  const visible = notifications.filter((notification) => tab === "groups" || (notification.priority === "high" && !notification.muted))
  return <section id="notification-center" aria-label="Benachrichtigungen" className="p-4">
    <header className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Benachrichtigungen</h2>{onMarkAllRead && <button type="button" onClick={onMarkAllRead} className="text-sm text-primary hover:underline">Alle als gelesen</button>}</header>
    <div role="tablist" aria-label="Benachrichtigungen filtern" className="mb-2 flex gap-1"><button role="tab" aria-selected={tab === "personal"} onClick={() => setTab("personal")} className="rounded px-2 py-1 text-sm">Für dich</button><button role="tab" aria-selected={tab === "groups"} onClick={() => setTab("groups")} className="rounded px-2 py-1 text-sm">Gruppen</button></div>
    {visible.length === 0 ? <EmptyState icon={Bell} title="Keine Benachrichtigungen" description="Hier erscheinen neue Aktivitäten für dich." /> : <ol className="space-y-1">{visible.map((notification) => {
      const info = presentation[notification.semanticAction]; const Icon = info.icon; const name = notification.actor?.displayName ?? notification.actorId
      const navigable = notification.semanticAction !== "deleted" && notification.targetExists
      const subjectClause = notification.semanticAction === "reacted" ? "auf deinen Post reagiert" : notification.semanticAction === "commented" ? "deinen Post kommentiert" : info.verb
      const sentence = notification.actorCount > 1 ? `${name} und ${notification.actorCount - 1} weitere haben ${subjectClause}` : `${name} hat ${subjectClause}`
      return <li key={`${notification.readKey}:${notification.ts}`} className={cn("rounded-md p-2", !notification.isRead && "bg-accent/50")}><div className="flex gap-2"><Avatar className="size-8"><AvatarImage src={notification.actor?.avatarUrl} alt="" /><AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1">{navigable ? <button type="button" onClick={() => { onMarkRead?.(notification.readKeys); onOpenSubject?.(notification) }} className="text-left text-sm hover:underline">{sentence}</button> : <p className="text-sm">{sentence}</p>}<p className="truncate text-xs text-muted-foreground">{notification.subjectTitle ?? notification.subjectType}</p><p className="flex gap-1 text-xs text-muted-foreground"><RelativeTime date={notification.ts} /><span>·</span><button type="button" onClick={() => onOpenGroup?.(notification.groupId)} className="hover:underline">{notification.groupName}</button></p></div><span aria-label={info.verb} className="rounded-full bg-accent p-1"><Icon className="size-3" /></span>{tab === "groups" && onMuteGroup && <button aria-label={`${notification.muted ? "Aktivieren" : "Stummschalten"}: ${notification.groupName}`} type="button" onClick={() => onMuteGroup(notification.groupId, !notification.muted)}><MoreHorizontal className="size-4" /></button>}{!notification.isRead && <span aria-label="Ungelesen" className="mt-1 size-2 rounded-full bg-primary" />}</div></li>
    })}</ol>}
    <footer className="mt-3 border-t pt-3"><button type="button" onClick={onOpenActivity} className="text-sm text-primary hover:underline">Alle Benachrichtigungen ansehen</button></footer>
  </section>
}

export function NotificationBell({ open, count, onOpenChange }: { open: boolean; count: number; onOpenChange(open: boolean): void }) {
  return <button type="button" aria-label={count ? `${count} neue Benachrichtigungen` : "Benachrichtigungen"} aria-expanded={open} aria-controls="notification-center" className="relative cursor-pointer rounded-md p-2 hover:bg-accent" onClick={() => onOpenChange(!open)}><Bell className="size-5" aria-hidden />{count > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-xs text-primary-foreground">{count}</span>}</button>
}
