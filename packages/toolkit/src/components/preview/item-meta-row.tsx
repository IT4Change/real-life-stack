"use client"

import type { Item } from "@real-life-stack/data-interface"
import { Calendar, MapPin } from "lucide-react"
import { cn } from "../../lib/utils"
import { isAllDayDate, parseEventDate } from "../../lib/date-utils"
import { formatDate, formatTime, t } from "@/i18n"
import { useLanguage } from "@/i18n/use-i18n"

/**
 * `ItemMetaRow` — small inline meta row showing the temporal and
 * spatial cues for an item. Belongs in the `metaAdornment` slot of
 * `ItemPreview`. Renders nothing if the item has neither a `data.start`
 * nor a place, so callers can drop it in unconditionally.
 *
 * This is the meta row for the shared **detail panel** — every module
 * registers it, so the panel looks the same whichever one opened it.
 * `ItemTimeRange` is the sibling for date-grouped lists, where the day is
 * already implied by the group header and only the time-of-day is needed.
 *
 * Spec: `docs/spec/modules/shared-components.md` → `ItemMetaRow`.
 *
 * Date formatting handles the common event shapes: single date, single
 * datetime, same-day range, and multi-day range. Bare YYYY-MM-DD dates
 * are treated as all-day (no clock time) — see `lib/date-utils.ts` for
 * the parsing rationale. Formatting follows the active language (`@/i18n`).
 */
export interface ItemMetaRowProps {
  item: Item
  className?: string
}

export function ItemMetaRow({ item, className }: ItemMetaRowProps) {
  useLanguage() // Sprachwechsel → Datum/Zeit neu formatieren
  const data = item.data as Record<string, unknown>
  const start = typeof data.start === "string" ? data.start : undefined
  const end = typeof data.end === "string" ? data.end : undefined
  // Same resolution as ItemTimeRange and the calendar's `toCalendarEvent()`:
  // the human name of a place beats its postal address, and an item that only
  // carries a `locationName` still shows where it happens.
  const place =
    (typeof data.locationName === "string" && data.locationName) ||
    (typeof data.address === "string" && data.address) ||
    undefined

  if (!start && !place) return null

  return (
    <div className={cn("flex flex-wrap gap-3 text-xs text-muted-foreground", className)}>
      {start && (
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatEventRange(start, end)}
        </span>
      )}
      {place && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {place}
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

  const dateStr = formatDate(s)
  const timeStr = startAllDay ? null : formatTime(s)

  if (!end) return timeStr ? `${dateStr}, ${timeStr}` : dateStr

  const endAllDay = isAllDayDate(end)
  const e = parseEventDate(end)
  if (Number.isNaN(e.getTime())) return timeStr ? `${dateStr}, ${timeStr}` : dateStr

  const endTimeStr = endAllDay ? null : formatTime(e)

  // Same day — four cases, handle the mixed ones explicitly so a null
  // side doesn't get interpolated into the string.
  if (s.toDateString() === e.toDateString()) {
    if (!timeStr && !endTimeStr) return dateStr
    if (timeStr && endTimeStr) return `${dateStr}, ${timeStr} – ${endTimeStr}`
    if (timeStr) return `${dateStr}, ${timeStr}`
    return `${dateStr}, ${t("time.until")} ${endTimeStr}`
  }

  const endDateStr = formatDate(e)
  const startPart = timeStr ? `${dateStr}, ${timeStr}` : dateStr
  const endPart = endTimeStr ? `${endDateStr}, ${endTimeStr}` : endDateStr
  return `${startPart} – ${endPart}`
}
