"use client"

import type { Item } from "@real-life-stack/data-interface"
import { Clock, MapPin } from "lucide-react"
import { cn } from "../../lib/utils"
import { isAllDayDate, parseEventDate } from "../../lib/date-utils"

/**
 * `ItemTimeRange` — inline row showing the time-of-day for an event
 * (and optionally its location), without repeating the date.
 *
 * Spec: `docs/spec/modules/shared-components.md` → `ItemTimeRange`.
 *
 * Belongs in the `metaAdornment` slot. Useful in contexts where the
 * date is already implied by the surrounding UI (Calendar list inside
 * a date group, "today's events" panel) — `ItemMetaRow` shows the
 * full date+time and is the right choice when the date isn't implied.
 *
 * Location label uses `locationLabel` if the caller provides it.
 * Otherwise it falls back to `data.locationName ?? data.address` —
 * matching how Calendar already resolves event locations via
 * `toCalendarEvent()`. That way an event with only `data.locationName`
 * still gets its location rendered on the card.
 *
 * Renders `null` when `data.start` is not a string and no location is
 * available, so callers can drop it in unconditionally.
 */
export interface ItemTimeRangeProps {
  item: Item
  /**
   * Pre-resolved location label. When set, overrides the default
   * `locationName ?? address` lookup. Use this when the surrounding
   * module already normalises locations differently.
   */
  locationLabel?: string
  className?: string
}

export function ItemTimeRange({ item, locationLabel, className }: ItemTimeRangeProps) {
  const data = item.data as Record<string, unknown>
  const start = typeof data.start === "string" ? data.start : undefined
  const end = typeof data.end === "string" ? data.end : undefined
  const location =
    locationLabel ??
    (typeof data.locationName === "string" && data.locationName) ||
    (typeof data.address === "string" && data.address) ||
    undefined

  if (!start && !location) return null

  return (
    <div className={cn("flex flex-wrap gap-3 text-xs text-muted-foreground", className)}>
      {start && (
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatTimeRange(start, end)}
        </span>
      )}
      {location && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {location}
        </span>
      )}
    </div>
  )
}

/**
 * Format start/end as a time-of-day range. All-day events render as
 * "Ganztägig". Same-day timed range becomes "18:00 – 20:00"; without an
 * end, just "18:00". Multi-day ranges fall back to a hint that includes
 * the end date so users don't think the event ends the same day.
 *
 * Exported for callers that want the string outside the inline row
 * (e.g. tooltip, list cell).
 */
export function formatTimeRange(start: string, end?: string): string {
  const startAllDay = isAllDayDate(start)
  const s = parseEventDate(start)
  if (Number.isNaN(s.getTime())) return start
  if (startAllDay) return "Ganztägig"

  const startTime = s.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })

  if (!end) return startTime

  const e = parseEventDate(end)
  if (Number.isNaN(e.getTime())) return startTime

  if (s.toDateString() === e.toDateString()) {
    if (isAllDayDate(end)) return startTime
    const endTime = e.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    return `${startTime} – ${endTime}`
  }

  // Multi-day — hint at the end date so the user knows it isn't same-day.
  const endDate = e.toLocaleDateString("de-DE", { day: "numeric", month: "short" })
  const endTime = isAllDayDate(end)
    ? null
    : e.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
  return endTime ? `${startTime} – ${endDate}, ${endTime}` : `${startTime} – ${endDate}`
}
