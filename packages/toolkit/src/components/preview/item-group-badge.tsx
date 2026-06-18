"use client"

import { cn } from "../../lib/utils"

/**
 * `ItemGroupBadge` — small chip showing which group/space an item belongs to,
 * a coloured dot in the group's colour plus its name. Belongs in the
 * `headerAdornment` slot of `ItemPreview`, next to {@link ItemTypeBadge}.
 *
 * Intended for aggregate ("Mein Netzwerk") views that mix items from several
 * groups; inside a single group it is redundant and should be omitted by the
 * caller.
 */
export interface ItemGroupBadgeProps {
  /** Group/space name. */
  name: string
  /** Group colour (`#rrggbb`) — rendered as the leading dot. */
  color: string
  className?: string
}

export function ItemGroupBadge({ name, color, className }: ItemGroupBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground/80",
        className,
      )}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {name}
    </span>
  )
}
