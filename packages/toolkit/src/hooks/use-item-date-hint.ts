import { useMemo } from "react"
import type { Item } from "@real-life-stack/data-interface"
import { isAllDayDate, parseEventDate } from "../lib/date-utils"

/**
 * Structured representation of an item's temporal hint, ready for any
 * UI to render in its own style.
 *
 * Spec event/v1 (docs/spec/schemas/vocab/event/v1): `start`/`end` may be
 * a date-time (`2026-06-09T14:00:00Z`) or a bare date (`2026-06-09`).
 * Bare dates carry "all-day" semantics; date-times carry a clock time.
 *
 * Callers decide presentation. The structured shape avoids baking a
 * single string format into the toolkit — Feed, Calendar, Kanban each
 * compose what they need from these fields. The optional helper
 * `formatItemDateHint` provides a sensible default when "just a string"
 * is enough.
 */
export interface ItemDateHint {
  /** Parsed start instant; null when the item has no `data.start`. */
  start: Date | null
  /** Parsed end instant; null when there's no `data.end`. */
  end: Date | null
  /** True when start exists and is encoded as a bare YYYY-MM-DD date. */
  isAllDay: boolean
  /** True when there's a parseable start with a clock time. */
  hasTime: boolean
  /** Raw start string from `data.start`, for callers that want it. */
  rawStart: string | null
  /** Raw end string from `data.end`. */
  rawEnd: string | null
}

const EMPTY_HINT: ItemDateHint = Object.freeze({
  start: null,
  end: null,
  isAllDay: false,
  hasTime: false,
  rawStart: null,
  rawEnd: null,
})

export function useItemDateHint(item: Item | null | undefined): ItemDateHint {
  return useMemo(() => extractItemDateHint(item), [item?.data?.start, item?.data?.end])
}

/** Pure extraction logic; exported for tests and non-React callers. */
export function extractItemDateHint(item: Item | null | undefined): ItemDateHint {
  const rawStart = typeof item?.data?.start === "string" ? item.data.start : null
  const rawEnd = typeof item?.data?.end === "string" ? item.data.end : null
  if (!rawStart) return EMPTY_HINT
  const isAllDay = isAllDayDate(rawStart)
  const start = parseEventDate(rawStart)
  const end = rawEnd ? parseEventDate(rawEnd) : null
  return {
    start,
    end,
    isAllDay,
    hasTime: !isAllDay,
    rawStart,
    rawEnd,
  }
}

/**
 * Default formatter: short relative or absolute label suitable for
 * Feed-style cards. Locale-aware via Intl. Callers that want different
 * granularity (Calendar week-range, Kanban deadline pill) should
 * compose their own string from the `ItemDateHint` fields.
 */
export function formatItemDateHint(hint: ItemDateHint, now: Date = new Date()): string | null {
  if (!hint.start) return null
  const start = hint.start
  const sameDay = isSameDay(start, now)
  const tomorrow = isSameDay(start, addDays(now, 1))
  const yesterday = isSameDay(start, addDays(now, -1))

  const timeStr = hint.hasTime
    ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(start)
    : ""

  if (sameDay) return hint.isAllDay ? "Heute" : `Heute ${timeStr}`
  if (tomorrow) return hint.isAllDay ? "Morgen" : `Morgen ${timeStr}`
  if (yesterday) return hint.isAllDay ? "Gestern" : `Gestern ${timeStr}`

  const dateStr = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: start.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(start)

  return hint.hasTime ? `${dateStr}, ${timeStr}` : dateStr
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}
