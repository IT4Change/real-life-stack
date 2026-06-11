"use client"

import { MessageCircle } from "lucide-react"
import { cn } from "../../lib/utils"

/**
 * `ItemCommentCount` — comment-count badge for the `footerAdornment`
 * slot of `ItemPreview`. Renders nothing when `count <= 0` so callers
 * can drop it in unconditionally.
 *
 * Spec: `docs/spec/modules/shared-components.md` → `ItemCommentCount`.
 *
 * Two render modes depending on `onClick`:
 * - **With `onClick`**: renders a `<button>` (focusable, hover style)
 *   and calls `event.stopPropagation()` so a card-wide click on
 *   `ItemPreview` doesn't double-fire.
 * - **Without `onClick`**: renders a plain `<span>` (non-interactive,
 *   not in the tab order). That way a purely informational count
 *   doesn't show up as a focus stop that performs no action.
 */
export interface ItemCommentCountProps {
  count: number
  onClick?: () => void
  className?: string
}

const baseClass =
  "inline-flex items-center gap-1 text-xs text-muted-foreground"

export function ItemCommentCount({ count, onClick, className }: ItemCommentCountProps) {
  if (count <= 0) return null
  const label = (
    <>
      <MessageCircle className="h-3 w-3" />
      {count} Kommentar{count !== 1 ? "e" : ""}
    </>
  )
  if (!onClick) {
    return <span className={cn(baseClass, className)}>{label}</span>
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        baseClass,
        "hover:text-foreground transition-colors",
        className,
      )}
    >
      {label}
    </button>
  )
}
