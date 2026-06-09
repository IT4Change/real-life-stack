/**
 * Helpers for parsing event.start / event.end values from item data.
 *
 * Spec event/v1 (docs/spec/schemas/vocab/event/v1) lets `start` and `end`
 * be either a date-time (`2026-06-09T14:00`) or a bare date
 * (`2026-06-09`). The bare date carries "all-day" semantics — no clock
 * time, no time-zone.
 *
 * `new Date("2026-06-09")` parses as **UTC midnight**, which renders as
 * 02:00 in Europe/Berlin (or 01:00 in winter, or any other offset
 * depending on the user's locale). That is the wrong reading for an
 * all-day event: it should sit at local midnight and not display a
 * clock time at all.
 *
 * These helpers normalize that: callers ask whether the input is
 * date-only and parse with the intended local-midnight anchor.
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

export function isAllDayDate(value: string): boolean {
  return DATE_ONLY_RE.test(value)
}

/**
 * Parse an event date string. Bare YYYY-MM-DD becomes local midnight on
 * that day; anything else falls back to the native Date parser.
 */
export function parseEventDate(value: string): Date {
  if (isAllDayDate(value)) {
    // Local-midnight construction: new Date(y, m, d) uses the local
    // time zone, unlike new Date("YYYY-MM-DD") which is UTC.
    const [y, m, d] = value.split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}
