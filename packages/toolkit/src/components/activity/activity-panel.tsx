import { useMemo } from "react"
import type { ActivityEntry, User } from "@real-life-stack/data-interface"
import { History, MessageCircle, Pencil, Plus, Trash2, UserRound } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage, EmptyState, RelativeTime } from "../primitives"
import { cn } from "../../lib/utils"
import { sectionFor } from "./notification-center"

export interface ActivityPanelProps {
  entries: readonly ActivityEntry[]
  onOpenTarget?: (entry: ActivityEntry) => void
  isTargetOpenable?: (entry: ActivityEntry) => boolean
  /** Maps the connector-issued actor id (e.g. a DID) to a display identity. */
  resolveActor?: (actorId: string) => User | undefined
}

const ACTION_ICONS = { create: Plus, update: Pencil, delete: Trash2 } as const
const ACTION_VERBS = { create: "erstellt", update: "geändert", delete: "gelöscht" } as const

/** A raw DID is a poor name — keep it recognizable but short. */
function shortActor(actorId: string): string {
  if (actorId.length <= 24) return actorId
  return `${actorId.slice(0, 14)}…${actorId.slice(-4)}`
}

/** Reactions log "<emoji> auf „…"" — split the badge emoji from the target. */
function reactionParts(entry: ActivityEntry): { emoji: string; target?: string } | undefined {
  if (entry.targetType !== "reaction") return undefined
  const [emoji, ...rest] = (entry.summary ?? "").split(" ")
  if (!emoji || emoji.startsWith("„")) return { emoji: "👍" }
  const target = rest.join(" ").replace(/^auf\s+/, "")
  return { emoji, target: target || undefined }
}

/** Sentence + badge in the SAME visual language as the notification center. */
function rowPresentation(entry: ActivityEntry): { rest: React.ReactNode; badge: React.ReactNode; quote?: string } {
  const reaction = reactionParts(entry)
  if (reaction) {
    const rest = entry.action === "delete"
      ? `hat eine Reaktion ${reaction.target ? `auf ${reaction.target} ` : ""}entfernt`
      : `hat ${reaction.target ? `auf ${reaction.target} ` : ""}reagiert`
    return { rest, badge: reaction.emoji }
  }
  if (entry.targetType === "comment") {
    const rest = entry.action === "delete" ? "hat einen Kommentar gelöscht" : "hat kommentiert"
    return { rest, badge: <MessageCircle className="size-3 text-muted-foreground" />, quote: entry.action === "delete" ? undefined : entry.summary }
  }
  const Icon = ACTION_ICONS[entry.action as keyof typeof ACTION_ICONS] ?? Pencil
  const verb = ACTION_VERBS[entry.action as keyof typeof ACTION_VERBS] ?? entry.action
  const title = entry.summary ?? entry.targetType
  return { rest: `hat „${title}" ${verb}`, badge: <Icon className="size-3 text-muted-foreground" /> }
}

/** Best-effort space history; targets remain visible even when not projectable. */
export function ActivityPanel({ entries, onOpenTarget, isTargetOpenable, resolveActor }: ActivityPanelProps) {
  const visible = entries.filter((entry) => entry.action === "create" || entry.action === "update" || entry.action === "delete")
  const now = useMemo(() => new Date(), [entries])
  if (visible.length === 0) {
    return <section id="activity-panel" aria-label="Verlauf"><EmptyState icon={History} title="Noch keine Änderungen" description="Für alle Mitglieder sichtbare Verlaufsansicht." /></section>
  }
  const sections: Array<{ label: string; rows: ActivityEntry[] }> = []
  for (const entry of visible) {
    const label = sectionFor(entry.ts, now)
    const section = sections[sections.length - 1]
    if (section?.label === label) section.rows.push(entry)
    else sections.push({ label, rows: [entry] })
  }
  return (
    <section id="activity-panel" aria-label="Verlauf" className="p-4">
      <p className="mb-3 text-xs text-muted-foreground">Für alle Mitglieder sichtbare Verlaufsansicht.</p>
      {sections.map((section) => (
        <div key={section.label}>
          <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{section.label}</p>
          <ol className="space-y-0.5">
            {section.rows.map((entry) => {
              const openable = Boolean(onOpenTarget && isTargetOpenable?.(entry))
              const actor = resolveActor?.(entry.actor)
              const actorName = actor?.displayName ?? shortActor(entry.actor)
              const { rest, badge, quote } = rowPresentation(entry)
              const sentence = <><strong title={entry.actor}>{actorName}</strong> {rest}</>
              const content = (
                <div className="flex gap-2.5">
                  <span className="relative inline-block size-10 shrink-0 self-start">
                    <Avatar className="size-10">
                      {actor?.avatarUrl && <AvatarImage src={actor.avatarUrl} alt="" />}
                      <AvatarFallback>{actorName.slice(0, 2).toUpperCase() || <UserRound className="size-4" />}</AvatarFallback>
                    </Avatar>
                    <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border bg-background text-[11px] shadow-sm">{badge}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", openable && "hover:underline")}>{sentence}</p>
                    {quote && <p className="mt-1 truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">„{quote}"</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground"><RelativeTime date={entry.ts} /></p>
                  </div>
                </div>
              )
              return openable ? (
                <li key={entry.id}>
                  <button type="button" className="w-full cursor-pointer rounded-md p-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => onOpenTarget?.(entry)}>
                    {content}
                  </button>
                </li>
              ) : (
                <li key={entry.id} className="rounded-md p-2">{content}</li>
              )
            })}
          </ol>
        </div>
      ))}
    </section>
  )
}
