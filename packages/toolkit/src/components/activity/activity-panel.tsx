import type { ActivityEntry } from "@real-life-stack/data-interface"
import { History } from "lucide-react"
import { EmptyState, RelativeTime } from "../primitives"

export interface ActivityPanelProps {
  entries: readonly ActivityEntry[]
  onOpenTarget?: (entry: ActivityEntry) => void
  isTargetOpenable?: (entry: ActivityEntry) => boolean
}

/** Best-effort space history; targets remain visible even when not projectable. */
export function ActivityPanel({ entries, onOpenTarget, isTargetOpenable }: ActivityPanelProps) {
  const visible = entries.filter((entry) => entry.action === "create" || entry.action === "update" || entry.action === "delete")
  if (visible.length === 0) {
    return <EmptyState icon={History} title="Noch keine Änderungen" description="Für alle Mitglieder sichtbare Verlaufsansicht." />
  }
  return (
    <section aria-label="Verlauf" className="space-y-1 p-4">
      <p className="mb-3 text-sm text-muted-foreground">Für alle Mitglieder sichtbare Verlaufsansicht.</p>
      {visible.map((entry) => {
        const openable = Boolean(onOpenTarget && isTargetOpenable?.(entry))
        const content = <><span className="font-medium">{entry.action}</span>{" · "}{entry.targetType}{entry.summary ? ` · ${entry.summary}` : ""}<span className="ml-2 text-muted-foreground">{entry.actor} · <RelativeTime date={entry.ts} /></span></>
        return openable ? <button key={entry.id} type="button" className="block w-full rounded-md p-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => onOpenTarget?.(entry)}>{content}</button> : <div key={entry.id} className="rounded-md p-2 text-sm">{content}</div>
      })}
    </section>
  )
}
