"use client"

import type { ComponentType } from "react"
import { cn } from "../../lib/utils"
import { GENERIC_BADGE, resolveTypePresentation } from "./type-presentation"

/**
 * `ItemTypeBadge` — small chip showing what kind of item a card
 * represents (Event, Task, Place, Person, …). Belongs in the
 * `headerAdornment` slot of `ItemPreview`.
 *
 * Spec: `docs/spec/modules/shared-components.md` → `ItemTypeBadge`.
 *
 * Renders nothing for opaque or unknown types (e.g. `post`, `comment`,
 * `reaction`). That keeps the badge useful as a hint when something
 * non-default is in play without polluting every plain post with a
 * "Post" label.
 *
 * Module-specific item types that aren't in the default registry can be
 * supplied via the `config` prop.
 */
export interface ItemTypeBadgeProps {
  type: string
  /** Override or extend the type → presentation registry. */
  config?: Record<string, ItemTypeBadgeConfig>
  /** Show a neutral badge with the raw type when no registry entry exists. */
  fallback?: boolean
  className?: string
}

export interface ItemTypeBadgeConfig {
  icon: ComponentType<{ className?: string }>
  label: string
  className: string
}

export function ItemTypeBadge({ type, config, fallback = false, className }: ItemTypeBadgeProps) {
  // Label, icon and styling come from the type register (spec 06) — the
  // previous DEFAULT_CONFIG here was one of the four parallel type lists.
  // The `config` prop remains as a caller override for special surfaces.
  //
  // Rule 5 lives HERE, prop-independent: a type the register does not know
  // renders the neutral fallback badge on EVERY surface — an unknown type may
  // never be invisible. Only a REGISTERED type without badge style (plain
  // posts) deliberately renders nothing; `fallback` forces a badge even then.
  const resolved = resolveTypePresentation(type)
  const registryCfg: ItemTypeBadgeConfig | undefined = resolved.badge
    ? { icon: resolved.badge.icon, label: resolved.label, className: resolved.badge.className }
    : undefined
  const genericCfg: ItemTypeBadgeConfig = {
    icon: GENERIC_BADGE.icon,
    label: resolved.label,
    className: GENERIC_BADGE.className,
  }
  const cfg =
    config?.[type] ?? registryCfg ?? (resolved.generic || fallback ? genericCfg : undefined)
  if (!cfg) return null
  const Icon = cfg.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        cfg.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}
