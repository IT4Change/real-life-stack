"use client"

import type { ComponentType } from "react"
import { Calendar, CheckSquare, MapPin, MessageSquareQuote, Shapes, User } from "lucide-react"
import { cn } from "../../lib/utils"

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

const DEFAULT_CONFIG: Record<string, ItemTypeBadgeConfig> = {
  event: {
    icon: Calendar,
    label: "Event",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  task: {
    icon: CheckSquare,
    label: "Task",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  place: {
    icon: MapPin,
    label: "Ort",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  person: {
    icon: User,
    label: "Profil",
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
  statement: {
    icon: MessageSquareQuote,
    label: "Aussage",
    className: "bg-sky-50 text-sky-700 border-sky-200",
  },
}

export function ItemTypeBadge({ type, config, fallback = false, className }: ItemTypeBadgeProps) {
  const merged = config ? { ...DEFAULT_CONFIG, ...config } : DEFAULT_CONFIG
  const cfg = merged[type] ?? (fallback
    ? {
        icon: Shapes,
        label: type,
        className: "bg-muted text-muted-foreground border-border",
      }
    : undefined)
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
