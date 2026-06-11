"use client"

import { MessageCircle } from "lucide-react"
import { cn } from "../../lib/utils"

/**
 * `ItemCommentCount` — small button showing the number of comments on
 * an item. Belongs in the `footerAdornment` slot of `ItemPreview`.
 * Renders nothing when `count` is zero or negative so callers can drop
 * it in unconditionally.
 *
 * Spec: `docs/spec/modules/shared-components.md` → `ItemCommentCount`.
 *
 * Calls `event.stopPropagation()` on click so a clickable card around
 * the button doesn't also fire (`ItemPreview` exposes a card-wide
 * `onClick` for opening the detail).
 */
export interface ItemCommentCountProps {
  count: number
  onClick?: () => void
  className?: string
}

export function ItemCommentCount({ count, onClick, className }: ItemCommentCountProps) {
  if (count <= 0) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors",
        className,
      )}
    >
      <MessageCircle className="h-3 w-3" />
      {count} Kommentar{count !== 1 ? "e" : ""}
    </button>
  )
}
