"use client"

import { CalendarPlus, Clock, Repeat, X } from "lucide-react"
import { Input } from "@/components/primitives/input"
import { Button } from "@/components/primitives/button"
import { cn } from "@/lib/utils"

interface DateRange {
  start: string
  end?: string
  showEnd?: boolean
  showTime?: boolean
  showRecurrence?: boolean
  rrule?: string
}

interface DateWidgetProps {
  value: DateRange
  onChange: (value: DateRange) => void
  label: string
}

const RECURRENCE_OPTIONS = [
  { id: "none", label: "Keine" },
  { id: "FREQ=DAILY", label: "Taeglich" },
  { id: "FREQ=WEEKLY", label: "Woechentlich" },
  { id: "FREQ=MONTHLY", label: "Monatlich" },
]

/** Strip time portion from a datetime-local value, keep only date */
function toDateOnly(val: string): string {
  return val ? val.split("T")[0] : ""
}

/** Append T00:00 to a date-only value so datetime-local accepts it */
function toDatetime(val: string): string {
  if (!val) return ""
  return val.includes("T") ? val : `${val}T00:00`
}

export function DateWidget({ value, onChange, label }: DateWidgetProps) {
  const showEnd = value.showEnd ?? false
  const showTime = value.showTime ?? false
  const showRecurrence = value.showRecurrence ?? false
  const inputType = showTime ? "datetime-local" : "date"

  const updateField = (field: keyof DateRange, val: string | boolean) => {
    onChange({ ...value, [field]: val })
  }

  const toggleTime = () => {
    if (showTime) {
      onChange({
        ...value,
        showTime: false,
        start: toDateOnly(value.start),
        ...(value.end ? { end: toDateOnly(value.end) } : {}),
      })
    } else {
      onChange({
        ...value,
        showTime: true,
        start: toDatetime(value.start),
        ...(value.end ? { end: toDatetime(value.end) } : {}),
      })
    }
  }

  const toggleEnd = () => {
    if (showEnd) {
      onChange({ ...value, showEnd: false, end: undefined })
    } else {
      onChange({ ...value, showEnd: true })
    }
  }

  const toggleRecurrence = () => {
    if (showRecurrence) {
      onChange({ ...value, showRecurrence: false, rrule: undefined })
    } else {
      onChange({ ...value, showRecurrence: true, rrule: value.rrule || "none" })
    }
  }

  // Options that aren't active yet
  const inactiveOptions = [
    !showEnd && { key: "end", icon: CalendarPlus, label: "Enddatum", onClick: toggleEnd },
    !showTime && { key: "time", icon: Clock, label: "Uhrzeit", onClick: toggleTime },
    !showRecurrence && { key: "recurrence", icon: Repeat, label: "Wiederholung", onClick: toggleRecurrence },
  ].filter(Boolean) as { key: string; icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }[]

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {/* Start date (label only when end is visible) */}
      <div className="flex items-center gap-2">
        {showEnd && (
          <span className="w-12 shrink-0 text-xs text-muted-foreground">Start</span>
        )}
        <Input
          type={inputType}
          value={value.start}
          onChange={(e) => updateField("start", e.target.value)}
          className="text-sm"
        />
        {showTime && (
          <button
            type="button"
            onClick={toggleTime}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            title="Uhrzeit entfernen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* End date (only when toggled on) */}
      {showEnd && (
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-xs text-muted-foreground">Ende</span>
          <Input
            type={inputType}
            value={value.end || ""}
            onChange={(e) => updateField("end", e.target.value)}
            className="text-sm"
          />
          <button
            type="button"
            onClick={toggleEnd}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            title="Enddatum entfernen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {/* Recurrence (toggled independently) */}
      {showRecurrence && (
        <div className="flex items-center gap-2">
          {showEnd && (
            <span className="w-12 shrink-0 text-xs text-muted-foreground">Wiederh.</span>
          )}
          <div className="flex flex-1 flex-wrap gap-1.5">
            {RECURRENCE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange({ ...value, rrule: option.id === "none" ? undefined : option.id })}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  (value.rrule || "none") === option.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleRecurrence}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            title="Wiederholung entfernen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {/* Toggle buttons for inactive options */}
      {inactiveOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {inactiveOptions.map(({ key, icon: Icon, label: optLabel, onClick }) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClick}
              className="h-6 gap-1 px-2 text-xs text-muted-foreground"
            >
              <Icon className="h-3 w-3" />
              {optLabel}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
