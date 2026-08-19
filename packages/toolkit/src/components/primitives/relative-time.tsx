"use client"

import { useEffect, useState } from "react"

import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"

// Die Formatierer leben seit der i18n-Laufzeit in `@/i18n` und folgen der
// aktiven Sprache — hier stand vorher eine deutsche Handfassung („vor 3
// Tagen" aus selbst zusammengesetzten Wörtern), die beim Sprachwechsel
// stehen geblieben wäre.

/** Returns the appropriate auto-update interval in ms based on the age of the timestamp. */
function getUpdateInterval(date: string | Date): number | null {
  const diffMs = Date.now() - new Date(date).getTime()
  const diffMin = diffMs / 60000

  if (diffMin < 1) return 10_000       // < 1 min: every 10s
  if (diffMin < 60) return 60_000      // < 1 hour: every 1 min
  if (diffMin < 1440) return 3_600_000 // < 1 day: every 1 hour
  return null                           // >= 1 day: no update
}

export interface RelativeTimeProps {
  /** ISO-8601 date string or Date object. */
  date: string | Date
  /** Additional CSS classes for the <time> element. */
  className?: string
}

/**
 * Displays a relative timestamp (e.g. "vor 2 Stunden" / "2 hr. ago") with a
 * native HTML tooltip showing the full date and time on hover.
 * Auto-updates periodically to keep the relative time current.
 */
export function RelativeTime({ date, className }: RelativeTimeProps) {
  const [, setTick] = useState(0)
  const { formatFullDateTime, formatRelativeTime } = useI18n()

  useEffect(() => {
    const interval = getUpdateInterval(date)
    if (interval === null) return

    const id = setInterval(() => setTick((t) => t + 1), interval)
    return () => clearInterval(id)
  }, [date])

  const isoString = new Date(date).toISOString()

  return (
    <time
      dateTime={isoString}
      title={formatFullDateTime(date)}
      className={cn("text-muted-foreground", className)}
    >
      {formatRelativeTime(date)}
    </time>
  )
}
