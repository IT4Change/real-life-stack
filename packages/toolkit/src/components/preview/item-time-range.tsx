"use client"

import type { Item } from "@real-life-stack/data-interface"
import { Clock, MapPin } from "lucide-react"
import { cn } from "../../lib/utils"
import { isAllDayDate, parseEventDate } from "../../lib/date-utils"
import { useI18n, type I18n } from "@/i18n"

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
  const i18n = useI18n()
  const data = item.data as Record<string, unknown>
  const start = typeof data.start === "string" ? data.start : undefined
  const end = typeof data.end === "string" ? data.end : undefined
  const location =
    locationLabel ??
    ((typeof data.locationName === "string" && data.locationName) ||
      (typeof data.address === "string" && data.address) ||
      undefined)

  if (!start && !location) return null

  return (
    <div className={cn("flex flex-wrap gap-3 text-xs text-muted-foreground", className)}>
      {start && (
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatTimeRange(i18n, start, end)}
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
 * Format start/end as a time-of-day range. A single-day all-day event renders
 * as "Ganztägig". Same-day timed range becomes "18:00 – 20:00"; without an
 * end, just "18:00". Multi-day ranges always name the end date, so users don't
 * read them as same-day — "Ganztägig, bis 24. Juli" / "18:00 – 24. Juli".
 *
 * Exported for callers that want the string outside the inline row
 * (e.g. tooltip, list cell). Takes the i18n bundle as a parameter — in
 * components it comes from `useI18n()` (which carries the language
 * subscription), outside React from `getI18n()`. See rls#290.
 */
export function formatTimeRange(i18n: I18n, start: string, end?: string): string {
  const { t, formatDate, formatTime } = i18n
  const startAllDay = isAllDayDate(start)
  const s = parseEventDate(start)
  if (Number.isNaN(s.getTime())) return start

  const startTime = startAllDay ? t("time.allDay") : formatTime(s)

  if (!end) return startTime

  const e = parseEventDate(end)
  if (Number.isNaN(e.getTime())) return startTime

  // An all-day event that spans days must still name its end. Returning a bare
  // "Ganztägig" here (as this did) told the user nothing about a five-day
  // festival — the surrounding UI implies the *current* day, never the range.
  if (startAllDay) {
    if (s.toDateString() === e.toDateString()) return startTime
    return `${startTime}, ${t("time.until")} ${formatDate(e)}`
  }

  if (s.toDateString() === e.toDateString()) {
    if (isAllDayDate(end)) return startTime
    return `${startTime} – ${formatTime(e)}`
  }

  // Multi-day — hint at the end date so the user knows it isn't same-day.
  const endDate = formatDate(e)
  const endTime = isAllDayDate(end) ? null : formatTime(e)
  return endTime ? `${startTime} – ${endDate}, ${endTime}` : `${startTime} – ${endDate}`
}
