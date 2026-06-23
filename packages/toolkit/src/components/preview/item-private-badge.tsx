"use client"

import { Lock } from "lucide-react"
import { cn } from "../../lib/utils"

/**
 * `ItemPrivateBadge` — small chip marking an item as private (it lives in the
 * user's personal space, shared with nobody). The counterpart to
 * {@link ItemGroupBadge}: where that names the group an item belongs to, this
 * marks the absence of any group. Belongs in the `headerAdornment` slot of
 * `ItemPreview`, next to `ItemTypeBadge`.
 *
 * A private item carries no group badge (it has no group), so the two never
 * appear together — the caller shows this one iff the item is private.
 */
export interface ItemPrivateBadgeProps {
  /** Override the label. Defaults to „Privat". */
  label?: string
  className?: string
}

export function ItemPrivateBadge({ label = "Privat", className }: ItemPrivateBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Lock className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </span>
  )
}
