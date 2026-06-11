import { describe, it, expect } from "vitest"
import type { Item } from "@real-life-stack/data-interface"
import { extractItemDateHint, formatItemDateHint, type ItemDateHint } from "../src/hooks/use-item-date-hint"

function makeItem(data: Record<string, unknown>): Item {
  return {
    id: "item-1",
    type: "event",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "user-1",
    data,
  }
}

describe("extractItemDateHint", () => {
  it("returns the empty hint for items without data.start", () => {
    const hint = extractItemDateHint(makeItem({}))
    expect(hint.start).toBeNull()
    expect(hint.end).toBeNull()
    expect(hint.isAllDay).toBe(false)
    expect(hint.hasTime).toBe(false)
    expect(hint.rawStart).toBeNull()
  })

  it("parses a date-time start and reports hasTime", () => {
    const hint = extractItemDateHint(makeItem({ start: "2026-07-15T18:00:00Z" }))
    expect(hint.start?.toISOString()).toBe("2026-07-15T18:00:00.000Z")
    expect(hint.isAllDay).toBe(false)
    expect(hint.hasTime).toBe(true)
    expect(hint.rawStart).toBe("2026-07-15T18:00:00Z")
  })

  it("parses a bare YYYY-MM-DD start as all-day", () => {
    const hint = extractItemDateHint(makeItem({ start: "2026-07-15" }))
    expect(hint.isAllDay).toBe(true)
    expect(hint.hasTime).toBe(false)
    // Bare date anchors to local midnight, not UTC — see date-utils.ts
    expect(hint.start?.getHours()).toBe(0)
  })

  it("carries the end value through when present", () => {
    const hint = extractItemDateHint(
      makeItem({ start: "2026-07-15T18:00:00Z", end: "2026-07-15T20:00:00Z" }),
    )
    expect(hint.end?.toISOString()).toBe("2026-07-15T20:00:00.000Z")
    expect(hint.rawEnd).toBe("2026-07-15T20:00:00Z")
  })

  it("ignores non-string start values", () => {
    const hint = extractItemDateHint(makeItem({ start: 12345 }))
    expect(hint.start).toBeNull()
  })

  it("returns the empty hint when start is a malformed string", () => {
    const hint = extractItemDateHint(makeItem({ start: "not-a-date" }))
    expect(hint.start).toBeNull()
    expect(hint.end).toBeNull()
    expect(hint.rawStart).toBeNull()
    expect(hint.hasTime).toBe(false)
  })

  it("returns the empty hint when bare date overflows (e.g. 2026-13-45)", () => {
    // parseEventDate silently rolls over: new Date(2026, 12, 45) becomes
    // 2027-02-14. The hint should treat this as malformed, not a valid
    // future date.
    const hint = extractItemDateHint(makeItem({ start: "2026-13-45" }))
    expect(hint.start).toBeNull()
    expect(hint.rawStart).toBeNull()
  })

  it("keeps a valid start when end is malformed (drops end + rawEnd)", () => {
    const hint = extractItemDateHint(
      makeItem({ start: "2026-07-15T18:00:00Z", end: "not-a-date" }),
    )
    expect(hint.start?.toISOString()).toBe("2026-07-15T18:00:00.000Z")
    expect(hint.end).toBeNull()
    expect(hint.rawEnd).toBeNull()
  })
})

describe("formatItemDateHint", () => {
  // Build `now` from local-time parts so the day comparisons in the
  // formatter (Heute/Morgen/Gestern via getFullYear/getMonth/getDate)
  // don't shift with the runtime time zone. Midday avoids any DST edge.
  const now = new Date(2026, 6, 15, 12, 0, 0)

  it("returns null when there is no start", () => {
    const hint = extractItemDateHint(makeItem({}))
    expect(formatItemDateHint(hint, now)).toBeNull()
  })

  it("labels same-day as Heute (all-day variant)", () => {
    const hint = extractItemDateHint(makeItem({ start: "2026-07-15" }))
    expect(formatItemDateHint(hint, now)).toBe("Heute")
  })

  it("labels next-day as Morgen (all-day variant)", () => {
    const hint = extractItemDateHint(makeItem({ start: "2026-07-16" }))
    expect(formatItemDateHint(hint, now)).toBe("Morgen")
  })

  it("labels previous-day as Gestern (all-day variant)", () => {
    const hint = extractItemDateHint(makeItem({ start: "2026-07-14" }))
    expect(formatItemDateHint(hint, now)).toBe("Gestern")
  })

  it("renders a more distant date with day/month", () => {
    const hint = extractItemDateHint(makeItem({ start: "2026-08-20" }))
    const label = formatItemDateHint(hint, now)
    // Day-of-month must appear; month name is locale-dependent
    // (Intl.DateTimeFormat with undefined locale), so don't assert on it.
    // What matters is that we get a non-empty string and *not* one of the
    // relative labels (Heute/Morgen/Gestern).
    expect(label).not.toBeNull()
    expect(label).toContain("20")
    expect(label).not.toBe("Heute")
    expect(label).not.toBe("Morgen")
    expect(label).not.toBe("Gestern")
  })

  it("returns null for a malformed-start hint (no Intl throw)", () => {
    const hint = extractItemDateHint(makeItem({ start: "not-a-date" }))
    expect(() => formatItemDateHint(hint, now)).not.toThrow()
    expect(formatItemDateHint(hint, now)).toBeNull()
  })

  it("defensively handles a hand-crafted Invalid Date hint without throwing", () => {
    // Caller bypasses extractItemDateHint and passes an Invalid Date
    // directly. formatItemDateHint must still not call Intl on it.
    const invalid: ItemDateHint = {
      start: new Date(NaN),
      end: null,
      isAllDay: false,
      hasTime: true,
      rawStart: "junk",
      rawEnd: null,
    }
    expect(() => formatItemDateHint(invalid, now)).not.toThrow()
    expect(formatItemDateHint(invalid, now)).toBeNull()
  })
})
