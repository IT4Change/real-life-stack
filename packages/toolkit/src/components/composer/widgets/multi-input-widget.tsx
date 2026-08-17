"use client"

import * as React from "react"
import { Plus, X } from "lucide-react"
import { Input } from "@/components/primitives/input"
import type { WidgetComponentProps, CustomWidgetDefinition } from "../content-composer"
import type { InputWidgetType } from "./input-widget"

/**
 * Generic multi-value input widget: renders one text input per entry with a
 * "+ Hinzufügen" affordance and per-row delete. Used for `contact/v1.email`
 * and `contact/v1.phone`, where the address book stores an ordered list of
 * values (the first being the primary).
 *
 * Value shape is `string[]`. Empty rows are stripped on change; the widget
 * itself keeps at least one visible input row for editing.
 */

export interface MultiInputWidgetConfig {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  inputType?: InputWidgetType
  placeholder?: string
  autoComplete?: string
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"]
  /** Button label. Defaults to "Hinzufuegen". */
  addLabel?: string
}

interface MultiInputWidgetProps {
  value: unknown
  onChange: (value: string[]) => void
  label: string
  inputType?: InputWidgetType
  placeholder?: string
  autoComplete?: string
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"]
  addLabel?: string
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string")
  if (typeof value === "string" && value.length > 0) return [value]
  return []
}

export function MultiInputWidget({
  value,
  onChange,
  label,
  inputType = "text",
  placeholder,
  autoComplete,
  inputMode,
  addLabel = "Hinzufuegen",
}: MultiInputWidgetProps) {
  const entries = toStringArray(value)
  const rows = entries.length > 0 ? entries : [""]

  const emit = (next: string[]) => {
    // Strip trailing empties on emit, but keep interior blanks so users can
    // edit them; the last "" is a placeholder row for adding a new entry.
    const trimmed = [...next]
    while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") trimmed.pop()
    onChange(trimmed)
  }

  const updateAt = (index: number, next: string) => {
    const copy = [...rows]
    copy[index] = next
    emit(copy)
  }

  const removeAt = (index: number) => {
    const copy = [...rows]
    copy.splice(index, 1)
    emit(copy.length === 0 ? [""] : copy)
  }

  const addEntry = () => {
    emit([...rows, ""])
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-1.5">
        {rows.map((entry, index) => (
          <div key={index} className="flex items-center gap-1">
            <Input
              type={inputType}
              value={entry}
              onChange={(e) => updateAt(index, e.target.value)}
              placeholder={placeholder ?? label}
              autoComplete={autoComplete}
              inputMode={inputMode}
              className="flex-1"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                title="Zeile entfernen"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addEntry}
          className="inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          <span>{addLabel}</span>
        </button>
      </div>
    </div>
  )
}

export function createMultiInputWidget(config: MultiInputWidgetConfig): CustomWidgetDefinition {
  const BoundWidget: React.ComponentType<WidgetComponentProps<unknown>> = (props) => (
    <MultiInputWidget
      value={props.value}
      onChange={props.onChange as (value: string[]) => void}
      label={props.label}
      inputType={config.inputType}
      placeholder={config.placeholder}
      autoComplete={config.autoComplete}
      inputMode={config.inputMode}
      addLabel={config.addLabel}
    />
  )
  BoundWidget.displayName = `MultiInputWidget(${config.id})`
  return {
    id: config.id,
    label: config.label,
    icon: config.icon,
    component: BoundWidget,
  }
}
