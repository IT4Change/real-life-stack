import { useMemo, useState } from "react"
import type { Group, NotificationState, ScopedActivityEntry } from "@real-life-stack/data-interface"
import { Bell, BellOff, MessageCircle, MoreHorizontal, Pencil, Plus, Smile, Trash2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, EmptyState, RelativeTime, Tabs, TabsContent, TabsList, TabsTrigger } from "../primitives"
import { cn } from "../../lib/utils"

export type NotificationAction = "created" | "updated" | "deleted" | "reacted" | "commented"
export type NotificationPriority = "high" | "low"

export interface NotificationCandidate {
  groupId: string; groupName: string; subjectId: string; subjectType: string; subjectTitle?: string
  semanticAction: NotificationAction; priority: NotificationPriority; muted: boolean
  entryId: string; readKey: string; actorId: string; actor: ScopedActivityEntry["actor"]; ts: string
  targetExists: boolean; moduleHints?: NonNullable<ScopedActivityEntry["subject"]>["moduleHints"]
  readKeys: Record<string, string>; actorCount: number; isRead: boolean
  /** Roh-Summary des Log-Eintrags (Reaktionen: „<emoji> auf „…""). */
  entrySummary?: string
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
      isRead: isReadKey(readKey, item.entry.ts, state), entrySummary: item.entry.summary,
    }]
  })
  const nonLifecycle: NotificationCandidate[] = []
  const latestLifecycle = new Map<string, NotificationCandidate>()
  for (const candidate of normal) {
    if (!lifecycle.has(candidate.semanticAction)) { nonLifecycle.push(candidate); continue }
    const key = JSON.stringify([candidate.groupId, candidate.subjectType, candidate.subjectId])
    const existing = latestLifecycle.get(key)
    if (!existing || compare(candidate, existing) < 0) latestLifecycle.set(key, candidate)
  }
  const collapsed = [...latestLifecycle.values()]
  const bySemantic = new Map<string, NotificationCandidate[]>()
  for (const candidate of [...collapsed, ...nonLifecycle]) {
    const key = JSON.stringify([candidate.groupId, candidate.subjectType, candidate.subjectId, candidate.semanticAction])
    const bucket = bySemantic.get(key)
    if (bucket) bucket.push(candidate)
    else bySemantic.set(key, [candidate])
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

const SUBJECT_WORD: Record<string, string> = { post: "Post", event: "Event", task: "Aufgabe", place: "Ort", resource: "Ressource", person: "Profil", project: "Projekt" }
const subjectWord = (type: string) => SUBJECT_WORD[type] ?? "Beitrag"


/** HEUTE / GESTERN / DIESE WOCHE / FRÜHER — the mockup's time sections. */
function sectionFor(ts: string, now: Date): string {
  const day = (value: Date) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`
  const date = new Date(ts)
  if (day(date) === day(now)) return "Heute"
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (day(date) === day(yesterday)) return "Gestern"
  if (now.getTime() - date.getTime() <= 7 * 86_400_000) return "Diese Woche"
  return "Früher"
}

/** Sentence with the mockup's bold-name grammar. */
function sentenceParts(notification: NotificationCandidate, personal: boolean): { lead: string; rest: string } {
  const name = notification.actor?.displayName ?? notification.actorId
  const lead = notification.actorCount > 1 ? `${name} und ${notification.actorCount - 1} weitere` : name
  const plural = notification.actorCount > 1
  const word = subjectWord(notification.subjectType)
  const owner = personal ? `deinen ${word}` : `„${notification.subjectTitle ?? word}"`
  if (notification.semanticAction === "reacted") return { lead, rest: `${plural ? "haben" : "hat"} auf ${owner} reagiert` }
  if (notification.semanticAction === "commented") return { lead, rest: `${plural ? "haben" : "hat"} ${owner} kommentiert` }
  const verb = presentation[notification.semanticAction].verb
  return { lead, rest: `${plural ? "haben" : "hat"} „${notification.subjectTitle ?? word}" ${verb}` }
}

const reactionEmoji = (notification: NotificationCandidate) => {
  if (notification.semanticAction !== "reacted") return undefined
  const first = notification.entrySummary?.split(" ")[0]
  return first && !first.startsWith("„") ? first : "👍"
}

function ActorBadge({ notification }: { notification: NotificationCandidate }) {
  const emoji = reactionEmoji(notification)
  const info = presentation[notification.semanticAction]; const Icon = info.icon
  const name = notification.actor?.displayName ?? notification.actorId
  return <span className="relative inline-block shrink-0">
    <Avatar className="size-10"><AvatarImage src={notification.actor?.avatarUrl} alt="" /><AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
    <span aria-label={info.verb} className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border bg-background text-[11px] shadow-sm">
      {emoji ?? <Icon className="size-3 text-muted-foreground" />}
    </span>
  </span>
}

const PAGE_SIZE = 10

export function NotificationCenter({ notifications, onOpenSubject, onOpenGroup, onMarkRead, onMarkAllRead, onMuteGroup, onOpenActivity }: NotificationCenterProps) {
  const [tab, setTab] = useState<"personal" | "groups">("personal")
  const [personalLimit, setPersonalLimit] = useState(PAGE_SIZE)
  const [groupsLimit, setGroupsLimit] = useState(PAGE_SIZE)
  const now = useMemo(() => new Date(), [notifications])

  const personal = notifications.filter((notification) => notification.priority === "high" && !notification.muted)
  const groupsUnread = notifications.some((notification) => !notification.muted && !notification.isRead)

  // Beide Tabs teilen EIN Zeilen-Layout (Antons Entscheid 19.07.) — der
  // Gruppen-Tab zeigt alle Bündel, formuliert nur nicht in der Du-Form und
  // trägt das Mute-Menü.
  const renderRows = (list: readonly NotificationCandidate[], limit: number, raiseLimit: () => void, personalPhrasing: boolean, withMute: boolean) => {
    const visible = list.slice(0, limit)
    const sections: Array<{ label: string; rows: NotificationCandidate[] }> = []
    for (const notification of visible) {
      const label = sectionFor(notification.ts, now)
      const section = sections[sections.length - 1]
      if (section?.label === label) section.rows.push(notification)
      else sections.push({ label, rows: [notification] })
    }
    return <div>
      {sections.map((section) => <div key={section.label}>
        <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{section.label}</p>
        <ol className="space-y-0.5">{section.rows.map((notification) => {
          const navigable = notification.semanticAction !== "deleted" && notification.targetExists
          const { lead, rest } = sentenceParts(notification, personalPhrasing)
          const sentence = <><strong>{lead}</strong> {rest}</>
          const quote = notification.semanticAction === "commented" && notification.entrySummary ? notification.entrySummary : undefined
          const unread = !notification.isRead && !notification.muted
          return <li key={`${notification.readKey}:${notification.ts}`} className={cn("rounded-md p-2", unread && "bg-accent/50", notification.muted && "opacity-70")}>
            <div className="flex gap-2.5">
              <ActorBadge notification={notification} />
              <div className="min-w-0 flex-1">
                {navigable
                  ? <button type="button" onClick={() => { onMarkRead?.(notification.readKeys); onOpenSubject?.(notification) }} className="cursor-pointer rounded-sm text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">{sentence}</button>
                  : <p className="text-sm">{sentence}</p>}
                {quote
                  ? <p className="mt-1 truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">„{quote}"</p>
                  : !personalPhrasing || !notification.subjectTitle ? null : <p className="truncate text-xs text-muted-foreground">„{notification.subjectTitle}"</p>}
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <RelativeTime date={notification.ts} /><span aria-hidden>·</span>
                  <button type="button" onClick={() => onOpenGroup?.(notification.groupId)} className="cursor-pointer rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">{notification.groupName}</button>
                  {notification.muted && <BellOff aria-label="Stummgeschaltet" className="size-3 shrink-0" />}
                </p>
              </div>
              {withMute && onMuteGroup && <DropdownMenu><DropdownMenuTrigger aria-label={`${notification.muted ? "Aktivieren" : "Stummschalten"}: ${notification.groupName}`} className="cursor-pointer self-start rounded-sm p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"><MoreHorizontal className="size-4" /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onMuteGroup(notification.groupId, !notification.muted)}>{notification.muted ? "Gruppe aktivieren" : "Gruppe stummschalten"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
              {unread && <span aria-label="Ungelesen" className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}
            </div>
          </li>
        })}</ol>
      </div>)}
      {list.length > limit && <button type="button" onClick={raiseLimit} className="mt-2 w-full cursor-pointer rounded-md border-t py-2 text-center text-sm text-primary hover:underline">Ältere laden</button>}
    </div>
  }

  return <section id="notification-center" aria-label="Benachrichtigungen" className="p-4">
    <header className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-semibold">Benachrichtigungen</h2>
      {onMarkAllRead && <button type="button" onClick={onMarkAllRead} className="cursor-pointer text-sm font-medium text-primary hover:underline">Alle als gelesen</button>}
    </header>
    <Tabs value={tab} onValueChange={(value) => setTab(value as "personal" | "groups")} className="mb-2">
      <TabsList aria-label="Benachrichtigungen filtern">
        <TabsTrigger value="personal">Für dich</TabsTrigger>
        <TabsTrigger value="groups"><span className="flex items-center gap-1.5">Gruppen{groupsUnread && <span aria-label="Ungelesene Gruppen-Aktivität" className="size-1.5 rounded-full bg-primary" />}</span></TabsTrigger>
      </TabsList>
      <TabsContent value={tab}>
      {tab === "personal"
        ? (personal.length === 0
            ? <EmptyState icon={Bell} title="Keine Benachrichtigungen" description="Hier erscheinen neue Aktivitäten für dich." />
            : renderRows(personal, personalLimit, () => setPersonalLimit((limit) => limit + 2 * PAGE_SIZE), true, false))
        : (notifications.length === 0
            ? <EmptyState icon={Bell} title="Keine Gruppen-Aktivität" description="Hier erscheint, was in deinen Gruppen passiert." />
            : renderRows(notifications, groupsLimit, () => setGroupsLimit((limit) => limit + 2 * PAGE_SIZE), false, true))}
      </TabsContent>
    </Tabs>
    <footer className="mt-3 border-t pt-3"><button type="button" onClick={onOpenActivity} className="cursor-pointer text-sm text-primary hover:underline">Alle Benachrichtigungen ansehen</button></footer>
  </section>
}

export function NotificationBell({ open, count, onOpenChange }: { open: boolean; count: number; onOpenChange(open: boolean): void }) {
  return <button type="button" aria-label={count ? `${count} neue Benachrichtigungen` : "Benachrichtigungen"} aria-expanded={open} aria-controls="notification-center" className="relative cursor-pointer rounded-md p-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => onOpenChange(!open)}><Bell className="size-5" aria-hidden />{count > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-xs text-primary-foreground">{count}</span>}</button>
}
