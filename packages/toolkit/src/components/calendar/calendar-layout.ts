/**
 * Day arithmetic and multi-day event layout for the calendar module.
 *
 * Spec: docs/spec/modules/calendar.md → "Mehrtägige Termine"
 *
 * Split out of `calendar-view.tsx` so the interesting part — which days an
 * event occupies, and how overlapping events stack into lanes within a week
 * row — is plain data that can be tested without rendering a calendar.
 */

/** The minimum an event has to expose for layout. Keeps tests free of `Item`. */
export interface DatedEvent {
  start: Date
  end?: Date
  /** True when the source values were bare `YYYY-MM-DD` (no clock time). */
  allDay: boolean
}

const MS_PER_DAY = 86_400_000

/**
 * Upper bound on how many days one event may occupy. A mistyped year
 * (`2026` → `2260`) would otherwise expand into ~85k day keys and stall the
 * view; the event still renders, just clipped to a year.
 */
const MAX_EVENT_DAYS = 366

export function atStartOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

/** ISO-ish `YYYY-MM-DD` in **local** time — the key events are bucketed under. */
export function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

export function isSameDate(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b)
}

/** Monday-based week start, matching the WEEKDAYS header. */
export function startOfWeek(date: Date): Date {
  const start = atStartOfDay(date)
  const weekday = start.getDay()
  start.setDate(start.getDate() - (weekday === 0 ? 6 : weekday - 1))
  return start
}

/** Whole days between two day-starts. Uses date arithmetic, so DST-safe. */
function dayDistance(from: Date, to: Date): number {
  return Math.round((atStartOfDay(to).getTime() - atStartOfDay(from).getTime()) / MS_PER_DAY)
}

/**
 * Last day an event occupies, as a local day-start.
 *
 * All-day events carry an **inclusive** end date (a festival "20.–24.7." is
 * stored as `end: 2026-07-24` and occupies the 24th). A timed event ending
 * exactly at local midnight does *not* occupy the following day — 20:00–00:00
 * is one evening, not two days. Both are the iCal/Thunderbird reading.
 */
export function eventEndDay(event: DatedEvent): Date {
  const startDay = atStartOfDay(event.start)
  const end = event.end
  if (!end || Number.isNaN(end.getTime()) || end <= event.start) return startDay

  const endDay = atStartOfDay(end)
  const lastDay =
    !event.allDay && end.getTime() === endDay.getTime() ? addDays(endDay, -1) : endDay
  if (lastDay <= startDay) return startDay

  const span = dayDistance(startDay, lastDay)
  return span > MAX_EVENT_DAYS ? addDays(startDay, MAX_EVENT_DAYS) : lastDay
}

/** How many day columns the event covers (1 for a single-day event). */
export function eventDayCount(event: DatedEvent): number {
  return dayDistance(event.start, eventEndDay(event)) + 1
}

export function isMultiDayEvent(event: DatedEvent): boolean {
  return eventDayCount(event) > 1
}

/** Every local day the event covers, first → last, inclusive. */
export function eventDayKeys(event: DatedEvent): string[] {
  const first = atStartOfDay(event.start)
  const count = eventDayCount(event)
  return Array.from({ length: count }, (_, index) => toDateKey(addDays(first, index)))
}

/** True when the event occupies `date` — not just when it starts on it. */
export function eventCoversDay(event: DatedEvent, date: Date): boolean {
  const day = atStartOfDay(date)
  return day >= atStartOfDay(event.start) && day <= eventEndDay(event)
}

/** True when the event occupies any day in `[from, to]` (both inclusive days). */
export function eventOverlapsRange(event: DatedEvent, from: Date, to: Date): boolean {
  return atStartOfDay(event.start) <= atStartOfDay(to) && eventEndDay(event) >= atStartOfDay(from)
}

/**
 * Bucket events under **every** day they cover, so a multi-day event shows up
 * in the day view and the month cell count on each of its days — not only the
 * one it starts on.
 */
export function buildEventsByDay<E extends DatedEvent>(
  events: readonly E[],
  compare?: (a: E, b: E) => number,
): Map<string, E[]> {
  const map = new Map<string, E[]>()
  for (const event of events) {
    for (const key of eventDayKeys(event)) {
      const bucket = map.get(key)
      if (bucket) bucket.push(event)
      else map.set(key, [event])
    }
  }
  if (compare) for (const bucket of map.values()) bucket.sort(compare)
  return map
}

/** One event's placement inside a single week row. */
export interface WeekBar<E> {
  event: E
  /** 0–6 index of the first column the bar occupies in this week. */
  startCol: number
  /** Number of columns it spans, clipped to the week. */
  span: number
  /** Stack row within the week; 0 is the topmost. */
  lane: number
  /** The event began before this week — the bar is clipped on the left. */
  continuesBefore: boolean
  /** The event runs past this week — the bar is clipped on the right. */
  continuesAfter: boolean
}

export interface WeekLayout<E> {
  bars: WeekBar<E>[]
  /** Lanes actually occupied by visible bars (0 when the week is empty). */
  laneCount: number
  /** Per column (0–6), how many events did not fit into `maxLanes`. */
  hiddenByCol: number[]
  /** Per column (0–6), every event covering it — visible and hidden alike. */
  eventsByCol: E[][]
}

/**
 * Thunderbird-style week row: each event becomes one continuous bar spanning
 * its days, and bars are packed into as few lanes as possible.
 *
 * A single greedy pass over the events sorted by (first day, then longest)
 * gives the minimal lane count for interval graphs: an event takes the lowest
 * lane whose columns are all still free. Single-day events participate in the
 * same packing, so a pill never lands on top of a bar passing underneath it.
 *
 * Events pushed past `maxLanes` are dropped from `bars` and counted per column
 * in `hiddenByCol`, which the view renders as its "+N weitere" trigger.
 */
export function layoutWeekBars<E extends DatedEvent>(
  events: readonly E[],
  weekStart: Date,
  maxLanes: number,
): WeekLayout<E> {
  const from = atStartOfDay(weekStart)
  const to = addDays(from, 6)

  const placed = events
    .filter((event) => eventOverlapsRange(event, from, to))
    .map((event) => {
      const eventStart = atStartOfDay(event.start)
      const eventEnd = eventEndDay(event)
      const startCol = Math.max(0, dayDistance(from, eventStart))
      const endCol = Math.min(6, dayDistance(from, eventEnd))
      return {
        event,
        startCol,
        span: endCol - startCol + 1,
        endCol,
        continuesBefore: eventStart < from,
        continuesAfter: eventEnd > to,
      }
    })
    // Longest-first within a start column keeps long bars near the top, so the
    // row reads as bands rather than a staircase. `sort` is stable, so events
    // that tie here keep the caller's ordering (time, then title).
    .sort((a, b) => a.startCol - b.startCol || b.span - a.span)

  const lanes: boolean[][] = []
  const bars: WeekBar<E>[] = []
  const hiddenByCol = Array.from({ length: 7 }, () => 0)
  const eventsByCol: E[][] = Array.from({ length: 7 }, () => [])
  let laneCount = 0

  for (const candidate of placed) {
    for (let col = candidate.startCol; col <= candidate.endCol; col += 1) {
      eventsByCol[col].push(candidate.event)
    }

    const fits = (occupied: boolean[]) => {
      for (let col = candidate.startCol; col <= candidate.endCol; col += 1) {
        if (occupied[col]) return false
      }
      return true
    }
    let lane = lanes.findIndex(fits)
    if (lane === -1) {
      lane = lanes.length
      lanes.push(Array.from({ length: 7 }, () => false))
    }
    for (let col = candidate.startCol; col <= candidate.endCol; col += 1) {
      lanes[lane][col] = true
    }

    if (lane >= maxLanes) {
      for (let col = candidate.startCol; col <= candidate.endCol; col += 1) {
        hiddenByCol[col] += 1
      }
      continue
    }
    laneCount = Math.max(laneCount, lane + 1)
    bars.push({
      event: candidate.event,
      startCol: candidate.startCol,
      span: candidate.span,
      lane,
      continuesBefore: candidate.continuesBefore,
      continuesAfter: candidate.continuesAfter,
    })
  }

  return { bars, laneCount, hiddenByCol, eventsByCol }
}
