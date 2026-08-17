"use client"

import * as React from "react"
import { Input } from "@/components/primitives/input"
import type { WidgetComponentProps, CustomWidgetDefinition } from "../content-composer"

/**
 * Generic single-value input widget for the ContentComposer.
 *
 * The composer's built-in widgets cover fixed semantics (title, text, date,
 * location, people, tags, status, group). This widget fills the gap for
 * arbitrary structured string fields — `givenName`, `familyName`,
 * `organization`, `jobTitle`, `website`, `postalCode`, etc. — used by
 * vocabularies like contact/v1.
 *
 * The widget itself is stateless. `createInputWidget` builds a
 * `CustomWidgetDefinition` that closes over the field-specific config (HTML
 * input type, placeholder, autocomplete hint, icon), so many instances can
 * coexist in one composer with different labels and behaviors.
 */

export type InputWidgetType = "text" | "email" | "tel" | "url"

export interface InputWidgetConfig {
  /**
   * The `data` key this widget reads and writes. Must be unique per
   * composer. This is also the `CustomWidgetDefinition.id`.
   */
  id: string
  /** Fallback label if `widgetLabels[id]` is not provided by the content type. */
  label: string
  /** Icon for the widget picker "+"-menu. */
  icon: React.ComponentType<{ className?: string }>
  /** HTML input type. Defaults to "text". */
  inputType?: InputWidgetType
  /** Placeholder shown when the field is empty. */
  placeholder?: string
  /** HTML autocomplete hint. */
  autoComplete?: string
  /** HTML inputMode hint for mobile keyboards. */
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"]
}

interface InputWidgetProps {
  value: unknown
  onChange: (value: string) => void
  label: string
  inputType?: InputWidgetType
  placeholder?: string
  autoComplete?: string
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"]
}

export function InputWidget({
  value,
  onChange,
  label,
  inputType = "text",
  placeholder,
  autoComplete,
  inputMode,
}: InputWidgetProps) {
  const stringValue = typeof value === "string" ? value : ""
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        type={inputType}
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        autoComplete={autoComplete}
        inputMode={inputMode}
      />
    </div>
  )
}

/**
 * Build a `CustomWidgetDefinition` from a config, so the ContentComposer can
 * register multiple InputWidget instances (each with its own `id`, label, and
 * input type) via its `widgets` prop.
 *
 * Example:
 *
 *   const fields = [
 *     createInputWidget({ id: "givenName", label: "Vorname", icon: User }),
 *     createInputWidget({ id: "familyName", label: "Nachname", icon: User }),
 *     createInputWidget({ id: "email", label: "E-Mail", icon: Mail,
 *                         inputType: "email", inputMode: "email" }),
 *   ]
 *   <ContentComposer widgets={fields} ... />
 */
export function createInputWidget(config: InputWidgetConfig): CustomWidgetDefinition {
  const BoundWidget: React.ComponentType<WidgetComponentProps<unknown>> = (props) => (
    <InputWidget
      value={props.value}
      onChange={props.onChange as (value: string) => void}
      label={props.label}
      inputType={config.inputType}
      placeholder={config.placeholder}
      autoComplete={config.autoComplete}
      inputMode={config.inputMode}
    />
  )
  BoundWidget.displayName = `InputWidget(${config.id})`
  return {
    id: config.id,
    label: config.label,
    icon: config.icon,
    component: BoundWidget,
  }
}
