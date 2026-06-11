"use client"

import type { Item } from "@real-life-stack/data-interface"
import { Calendar, MapPin } from "lucide-react"
import { cn } from "../../lib/utils"
import { isAllDayDate, parseEventDate } from "../../lib/date-utils"

/**
 * `ItemMetaRow` — small inline meta row showing the temporal and
 * spatial cues for an item. Belongs in the `metaAdornment` slot of
 * `ItemPreview`. Renders nothing if neither `data.start` nor
 * `data.address` is present, so callers can drop it in unconditionally.
 *
 * Spec: `docs/spec/modules/shared-components.md` → `ItemMetaRow`.
 *
 * Date formatting handles the common event shapes: single date, single
 * datetime, same-day range, and multi-day range. Bare YYYY-MM-DD dates
 * are treated as all-day (no clock time) — see `lib/date-utils.ts` for
 * the parsing rationale. Locale defaults to German because the demo
 * data and references currently target a German audience; future
 * polish can lift the locale into a prop or read a context.
 */
export interface ItemMetaRowProps {
  item: Item
  className?: string
}

export function ItemMetaRow({ item, className }: ItemMetaRowProps) {
  const data = item.data as Record<string, unknown>
  const start = typeof data.start === "string" ? data.start : undefined
  const end = typeof data.end === "string" ? data.end : undefined
  const address = typeof data.address === "string" ? data.address : undefined

  if (!start && !address) return null

  return (
    <div className={cn("flex flex-wrap gap-3 text-xs text-muted-foreground", className)}>
      {start && (
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatEventRange(start, end)}
        </span>
      )}
      {address && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {address}
        </span>
      )}
    </div>
  )
}

/**
 * Format a single date or a range. Exported for callers that need the
 * string outside of the inline meta row (e.g. a table cell, a tooltip).
 */
export function formatEventRange(start: string, end?: string): string {
  const startAllDay = isAllDayDate(start)
  const s = parseEventDate(start)
  if (Number.isNaN(s.getTime())) return start

  const dateStr = s.toLocaleDateString("de-DE", { day: "numeric", month: "short" })
  const timeStr = startAllDay
    ? null
    : s.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })

  if (!end) return timeStr ? `${dateStr}, ${timeStr}` : dateStr

  const endAllDay = isAllDayDate(end)
  const e = parseEventDate(end)
  if (Number.isNaN(e.getTime())) return timeStr ? `${dateStr}, ${timeStr}` : dateStr

  const endTimeStr = endAllDay
    ? null
    : e.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })

  // Same day — four cases, handle the mixed ones explicitly so a null
  // side doesn't get interpolated into the string.
  if (s.toDateString() === e.toDateString()) {
    if (!timeStr && !endTimeStr) return dateStr
    if (timeStr && endTimeStr) return `${dateStr}, ${timeStr} – ${endTimeStr}`
    if (timeStr) return `${dateStr}, ${timeStr}`
    return `${dateStr}, bis ${endTimeStr}`
  }

  const endDateStr = e.toLocaleDateString("de-DE", { day: "numeric", month: "short" })
  const startPart = timeStr ? `${dateStr}, ${timeStr}` : dateStr
  const endPart = endTimeStr ? `${endDateStr}, ${endTimeStr}` : endDateStr
  return `${startPart} – ${endPart}`
}
