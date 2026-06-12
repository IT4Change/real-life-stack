"use client"

import type { ReactNode } from "react"
import { Check, X } from "lucide-react"
import { cn } from "../../lib/utils"

/**
 * Building blocks for the shared `FilterBar` UI.
 *
 * Spec: `docs/spec/modules/shared-components.md` → `FilterBar`.
 *
 * Module-specific filters live in the `chipsExtra` / `drawerExtra`
 * slots of `FilterBar`.
 * Composing them out of these primitives keeps the look consistent
 * with the built-in tag/type filters — same chip shape, same toggle
 * affordance, same focus ring.
 *
 * The components are deliberately controlled: each takes a `value` and
 * an `onChange` (or one-shot `onRemove`). State lives in the caller.
 */

// ────────────────────────────────────────────────────────────────────────
// FilterChip — single active-filter chip with a remove button.
// ────────────────────────────────────────────────────────────────────────

export interface FilterChipProps {
  label: ReactNode
  onRemove: () => void
  /** Optional small icon at the chip's leading edge. */
  icon?: ReactNode
  className?: string
}

export function FilterChip({ label, onRemove, icon, className }: FilterChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-muted/40 pl-2 pr-1 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {icon}
      <span>{label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
        aria-label="Filter entfernen"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

// ────────────────────────────────────────────────────────────────────────
// FilterMultiSelect — a list of toggleable options with checkmark icons.
// Used in the drawer for tag and type pickers.
// ────────────────────────────────────────────────────────────────────────

export interface FilterMultiSelectOption {
  id: string
  label: ReactNode
  /** Optional leading icon. */
  icon?: ReactNode
}

export interface FilterMultiSelectProps {
  options: readonly FilterMultiSelectOption[]
  value: readonly string[]
  onChange: (next: string[]) => void
  /** Optional empty-state copy (no options at all). */
  emptyLabel?: string
  className?: string
}

export function FilterMultiSelect({
  options,
  value,
  onChange,
  emptyLabel = "Keine Optionen",
  className,
}: FilterMultiSelectProps) {
  if (options.length === 0) {
    return <p className={cn("text-xs text-muted-foreground", className)}>{emptyLabel}</p>
  }
  const selected = new Set(value)
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((option) => {
        const isOn = selected.has(option.id)
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              const next = new Set(selected)
              if (isOn) next.delete(option.id)
              else next.add(option.id)
              onChange([...next])
            }}
            aria-pressed={isOn}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              isOn
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {isOn ? <Check className="h-3 w-3" /> : option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// FilterToggle — a single boolean toggle (e.g. "nur meine").
// ────────────────────────────────────────────────────────────────────────

export interface FilterToggleProps {
  label: ReactNode
  value: boolean
  onChange: (next: boolean) => void
  icon?: ReactNode
  className?: string
}

export function FilterToggle({ label, value, onChange, icon, className }: FilterToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        value
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card text-foreground hover:bg-muted",
        className,
      )}
    >
      {value ? <Check className="h-3 w-3" /> : icon}
      {label}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────
// FilterSection — visual grouping for a labelled filter row in the drawer.
// ────────────────────────────────────────────────────────────────────────

export interface FilterSectionProps {
  label: string
  children: ReactNode
  className?: string
}

export function FilterSection({ label, children, className }: FilterSectionProps) {
  return (
    <section className={cn("space-y-2", className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  )
}
