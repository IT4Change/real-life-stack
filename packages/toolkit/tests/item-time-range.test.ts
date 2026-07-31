import { describe, expect, it } from "vitest"

import { formatTimeRange } from "../src/components/preview/item-time-range"
import { formatEventRange } from "../src/components/preview/item-meta-row"

describe("formatTimeRange", () => {
  it("shows a single all-day event as Ganztägig", () => {
    expect(formatTimeRange("2026-07-20")).toBe("Ganztägig")
    expect(formatTimeRange("2026-07-20", "2026-07-20")).toBe("Ganztägig")
  })

  it("names the end date of a multi-day all-day event", () => {
    // The regression: this returned a bare "Ganztägig", so a five-day festival
    // was indistinguishable from a one-day event.
    expect(formatTimeRange("2026-07-20", "2026-07-24")).toBe("Ganztägig, bis 24. Juli")
  })

  it("keeps same-day timed ranges as a time range", () => {
    expect(formatTimeRange("2026-07-20T18:00", "2026-07-20T20:00")).toBe("18:00 – 20:00")
  })

  it("shows only the start when there is no end", () => {
    expect(formatTimeRange("2026-07-20T18:00")).toBe("18:00")
  })

  it("names the end date of a multi-day timed event", () => {
    expect(formatTimeRange("2026-07-20T18:00", "2026-07-24T12:00")).toBe("18:00 – 24. Juli, 12:00")
    expect(formatTimeRange("2026-07-20T18:00", "2026-07-24")).toBe("18:00 – 24. Juli")
  })

  it("falls back to the start for an unparseable end", () => {
    expect(formatTimeRange("2026-07-20T18:00", "nonsense")).toBe("18:00")
    expect(formatTimeRange("2026-07-20", "nonsense")).toBe("Ganztägig")
  })
})

describe("formatEventRange", () => {
  it("spells out a multi-day all-day range with both dates", () => {
    expect(formatEventRange("2026-07-20", "2026-07-24")).toBe("20. Juli – 24. Juli")
  })

  it("keeps a single all-day event to its date", () => {
    expect(formatEventRange("2026-07-20")).toBe("20. Juli")
  })
})
