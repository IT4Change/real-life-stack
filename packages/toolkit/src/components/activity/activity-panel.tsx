import type { ActivityEntry, User } from "@real-life-stack/data-interface"
import { History, Pencil, Plus, Trash2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage, EmptyState, RelativeTime } from "../primitives"
import { ItemTypeBadge } from "../preview"
import { cn } from "../../lib/utils"

export interface ActivityPanelProps {
  entries: readonly ActivityEntry[]
  onOpenTarget?: (entry: ActivityEntry) => void
  isTargetOpenable?: (entry: ActivityEntry) => boolean
  /** Maps the connector-issued actor id (e.g. a DID) to a display identity. */
  resolveActor?: (actorId: string) => User | undefined
}

const ACTION_PRESENTATION = {
  create: { label: "erstellt", icon: Plus, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  update: { label: "geändert", icon: Pencil, className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  delete: { label: "gelöscht", icon: Trash2, className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
} as const

/** A raw DID is a poor name — keep it recognizable but short. */
function shortActor(actorId: string): string {
  if (actorId.length <= 24) return actorId
  return `${actorId.slice(0, 14)}…${actorId.slice(-4)}`
}

/** Best-effort space history; targets remain visible even when not projectable. */
export function ActivityPanel({ entries, onOpenTarget, isTargetOpenable, resolveActor }: ActivityPanelProps) {
  const visible = entries.filter((entry) => entry.action === "create" || entry.action === "update" || entry.action === "delete")
  if (visible.length === 0) {
    return <section id="activity-panel" aria-label="Verlauf"><EmptyState icon={History} title="Noch keine Änderungen" description="Für alle Mitglieder sichtbare Verlaufsansicht." /></section>
  }
  return (
    <section id="activity-panel" aria-label="Verlauf" className="p-4">
      <p className="mb-3 text-xs text-muted-foreground">Für alle Mitglieder sichtbare Verlaufsansicht.</p>
      <ol className="space-y-1">
        {visible.map((entry) => {
          const openable = Boolean(onOpenTarget && isTargetOpenable?.(entry))
          const action = ACTION_PRESENTATION[entry.action as keyof typeof ACTION_PRESENTATION]
          const ActionIcon = action.icon
          const actor = resolveActor?.(entry.actor)
          const actorName = actor?.displayName ?? shortActor(entry.actor)
          const content = (
            <div className="flex items-start gap-3">
              <span aria-hidden className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", action.className)}>
                <ActionIcon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm">
                  <span className={cn("truncate", entry.summary ? "font-medium" : "text-muted-foreground")}>
                    {entry.summary ?? entry.targetType}
                  </span>
                  <ItemTypeBadge type={entry.targetType} className="shrink-0" />
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Avatar className="size-4">
                    {actor?.avatarUrl && <AvatarImage src={actor.avatarUrl} alt="" />}
                    <AvatarFallback className="text-[8px]">{actorName.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="truncate" title={entry.actor}>{actorName}</span>
                  <span aria-hidden>·</span>
                  <span>{action.label}</span>
                  <span aria-hidden>·</span>
                  <RelativeTime date={entry.ts} />
                </p>
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
    </section>
  )
}
