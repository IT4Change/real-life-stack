/**
 * Glue between the composer's item data (`data.start` / `data.end` / `data.rrule`)
 * and the DateWidget's view model.
 *
 * Why this exists: the widget's three sub-fields (end date, time-of-day,
 * recurrence) are **UI state, not data**. They must stay open while still empty
 * — the click on "Enddatum" opens a field that has no value yet, and the value
 * only appears once the user picks a date.
 *
 * The composer used to derive the toggles purely from the data
 * (`showEnd: data.end !== undefined`). Opening the field wrote nothing, so the
 * next render derived `showEnd: false` again and the field vanished on the spot
 * — an end date could never be entered at all. Hence the split below: a toggle
 * that the user flipped, OR a value that already exists (so editing an item that
 * has an end date shows the field without any click).
 */

// Type-only, so this module keeps no runtime dependency on the composer
// (which imports it back) — the import is erased at build time.
import type { DateRange, WidgetData } from "./content-composer"

/** The three sub-fields the user can open by hand. */
export interface DateWidgetToggles {
  end: boolean
  time: boolean
  recurrence: boolean
}

export const NO_DATE_TOGGLES: DateWidgetToggles = { end: false, time: false, recurrence: false }

/** Sentinel the widget's recurrence picker uses for "no repetition". Never data. */
const RRULE_NONE = "none"

/** View model for the DateWidget: a field is visible if opened OR already filled. */
export function dateWidgetValue(data: WidgetData, toggles: DateWidgetToggles): DateRange {
  return {
    start: data.start ?? "",
    end: data.end,
    rrule: data.rrule,
    showEnd: toggles.end || data.end !== undefined,
    showTime: toggles.time || (typeof data.start === "string" && data.start.includes("T")),
    showRecurrence: toggles.recurrence || data.rrule !== undefined,
  }
}

/** Toggle state to remember after the widget reported a change. */
export function dateWidgetToggles(value: DateRange): DateWidgetToggles {
  return {
    end: value.showEnd ?? false,
    time: value.showTime ?? false,
    recurrence: value.showRecurrence ?? false,
  }
}

/**
 * Data patch for a widget change. Cleared inputs arrive as `""` and the
 * recurrence picker's "Keine" as the `"none"` sentinel; both become `undefined`
 * so downstream code (and the persisted item) never sees a placeholder value.
 */
export function dateWidgetPatch(value: DateRange): Pick<WidgetData, "start" | "end" | "rrule"> {
  return {
    start: value.start || undefined,
    end: value.end || undefined,
    rrule: value.rrule && value.rrule !== RRULE_NONE ? value.rrule : undefined,
  }
}
