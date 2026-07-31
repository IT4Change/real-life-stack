import { describe, expect, it } from "vitest"

import {
  buildEventsByDay,
  eventCoversDay,
  eventDayCount,
  eventDayKeys,
  eventEndDay,
  eventOverlapsRange,
  isMultiDayEvent,
  layoutWeekBars,
  toDateKey,
  type DatedEvent,
} from "../src/components/calendar/calendar-layout"

/**
 * Local midnight on a `YYYY-MM-DD` day. `new Date("2026-07-25")` would parse as
 * **UTC** midnight, which is the previous local day west of Greenwich — the
 * layout compares local calendar days, so every fixture has to be local too.
 * Mirrors `parseEventDate()`, which anchors all-day values the same way.
 */
const localDay = (day: string): Date => new Date(`${day}T00:00:00`)

/** All-day event from inclusive `YYYY-MM-DD` bounds. */
const allDay = (start: string, end?: string): DatedEvent => ({
  start: localDay(start),
  end: end ? localDay(end) : undefined,
  allDay: true,
})

/** Timed event from local `YYYY-MM-DDTHH:mm` bounds. */
const timed = (start: string, end?: string): DatedEvent => ({
  start: new Date(start),
  end: end ? new Date(end) : undefined,
  allDay: false,
})

// Monday 2026-07-20 … Sunday 2026-07-26.
const WEEK = localDay("2026-07-20")

describe("event day span", () => {
  it("treats an all-day end date as inclusive", () => {
    // "PAX Friedensfestival, 20.–24.7." occupies the 24th too.
    const event = allDay("2026-07-20", "2026-07-24")
    expect(toDateKey(eventEndDay(event))).toBe("2026-07-24")
    expect(eventDayCount(event)).toBe(5)
    expect(isMultiDayEvent(event)).toBe(true)
  })

  it("keeps a timed event ending at midnight on its own day", () => {
    // 20:00–00:00 is one evening, not two days.
    const event = timed("2026-07-20T20:00", "2026-07-21T00:00")
    expect(toDateKey(eventEndDay(event))).toBe("2026-07-20")
    expect(isMultiDayEvent(event)).toBe(false)
  })

  it("spans a timed event that runs past midnight into the next day", () => {
    const event = timed("2026-07-20T20:00", "2026-07-21T02:00")
    expect(eventDayCount(event)).toBe(2)
  })

  it("falls back to the start day for a missing, invalid or inverted end", () => {
    expect(eventDayCount(allDay("2026-07-20"))).toBe(1)
    expect(eventDayCount(timed("2026-07-20T10:00", "2026-07-18T10:00"))).toBe(1)
    expect(
      eventDayCount({ start: new Date("2026-07-20T10:00"), end: new Date("nope"), allDay: false }),
    ).toBe(1)
  })

  it("clips an absurd span (mistyped year) to the documented maximum", () => {
    // Spec: docs/spec/modules/calendar.md → höchstens 366 belegte Tage.
    expect(eventDayCount(allDay("2026-07-20", "2260-07-20"))).toBe(366)
  })

  it("leaves a span exactly at the maximum untouched", () => {
    // 2028 is a leap year: 2027-07-20 … 2028-07-19 inclusive is 366 days.
    expect(eventDayCount(allDay("2027-07-20", "2028-07-19"))).toBe(366)
  })

  it("lists every covered day", () => {
    expect(eventDayKeys(allDay("2026-07-30", "2026-08-02"))).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ])
  })

  it("covers the days between start and end, not just the start", () => {
    const event = allDay("2026-07-20", "2026-07-24")
    expect(eventCoversDay(event, new Date("2026-07-22T13:00:00"))).toBe(true)
    expect(eventCoversDay(event, new Date("2026-07-25T00:00:00"))).toBe(false)
    expect(eventOverlapsRange(event, localDay("2026-07-23"), localDay("2026-07-30"))).toBe(true)
    expect(eventOverlapsRange(event, localDay("2026-07-25"), localDay("2026-07-30"))).toBe(false)
  })
})

describe("buildEventsByDay", () => {
  it("buckets a multi-day event under each of its days", () => {
    const festival = allDay("2026-07-20", "2026-07-22")
    const map = buildEventsByDay([festival])

    expect([...map.keys()].sort()).toEqual(["2026-07-20", "2026-07-21", "2026-07-22"])
    expect(map.get("2026-07-21")).toEqual([festival])
  })

  it("keeps single-day events on their one day", () => {
    const map = buildEventsByDay([timed("2026-07-20T10:00", "2026-07-20T12:00")])
    expect([...map.keys()]).toEqual(["2026-07-20"])
  })
})

describe("layoutWeekBars", () => {
  it("spans a bar across the days it covers", () => {
    const { bars } = layoutWeekBars([allDay("2026-07-21", "2026-07-24")], WEEK, 3)

    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatchObject({ startCol: 1, span: 4, lane: 0 })
  })

  it("clips a bar to the week and flags the continuation on both sides", () => {
    const { bars } = layoutWeekBars([allDay("2026-07-15", "2026-07-30")], WEEK, 3)

    expect(bars[0]).toMatchObject({
      startCol: 0,
      span: 7,
      continuesBefore: true,
      continuesAfter: true,
    })
  })

  it("packs non-overlapping bars into the same lane instead of a staircase", () => {
    const { bars, laneCount } = layoutWeekBars(
      [allDay("2026-07-20", "2026-07-21"), allDay("2026-07-23", "2026-07-24")],
      WEEK,
      3,
    )

    expect(bars.map((bar) => bar.lane)).toEqual([0, 0])
    expect(laneCount).toBe(1)
  })

  it("stacks overlapping bars onto separate lanes", () => {
    const { bars, laneCount } = layoutWeekBars(
      [allDay("2026-07-20", "2026-07-23"), allDay("2026-07-22", "2026-07-24")],
      WEEK,
      3,
    )

    expect(bars.map((bar) => bar.lane)).toEqual([0, 1])
    expect(laneCount).toBe(2)
  })

  it("gives a single-day event its own slot so it never sits on a passing bar", () => {
    const { bars } = layoutWeekBars(
      [allDay("2026-07-20", "2026-07-24"), timed("2026-07-22T10:00", "2026-07-22T11:00")],
      WEEK,
      3,
    )

    const single = bars.find((bar) => bar.span === 1)
    expect(single?.lane).toBe(1)
  })

  it("drops events past the lane cap and counts them on the columns they cover", () => {
    const { bars, laneCount, hiddenByCol } = layoutWeekBars(
      [
        allDay("2026-07-20", "2026-07-26"),
        allDay("2026-07-20", "2026-07-26"),
        allDay("2026-07-21", "2026-07-22"),
      ],
      WEEK,
      2,
    )

    expect(bars).toHaveLength(2)
    expect(laneCount).toBe(2)
    // Only Tue/Wed carry the dropped event.
    expect(hiddenByCol).toEqual([0, 1, 1, 0, 0, 0, 0])
  })

  it("reports every event per column, hidden ones included", () => {
    const { eventsByCol } = layoutWeekBars(
      [allDay("2026-07-20", "2026-07-21"), allDay("2026-07-21", "2026-07-21")],
      WEEK,
      3,
    )

    expect(eventsByCol[0]).toHaveLength(1)
    expect(eventsByCol[1]).toHaveLength(2)
    expect(eventsByCol[2]).toHaveLength(0)
  })

  it("ignores events outside the week", () => {
    const { bars } = layoutWeekBars([allDay("2026-08-10", "2026-08-12")], WEEK, 3)
    expect(bars).toEqual([])
  })
})
