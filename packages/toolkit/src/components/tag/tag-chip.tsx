"use client"

import { X } from "lucide-react"
import { cn, getTagColor } from "../../lib/utils"

export interface TagChipProps {
  tag: string
  /** Visual size. `sm` matches post/preview cards, `md` the filter UI. */
  size?: "sm" | "md"
  /**
   * Toggle mode (filter picker): renders a button with a pressed state.
   * Selected tags show at full strength, unselected are dimmed — the tag
   * colour stays visible either way, so the palette reads the same as on
   * posts.
   */
  selected?: boolean
  onToggle?: () => void
  /** Removable mode (active filter chip): renders an inline ✕ button. */
  onRemove?: () => void
  className?: string
}

const SIZES = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2 py-0.5",
} as const

/**
 * Shared tag chip — one source of truth for how a tag looks everywhere:
 * post/preview cards, the filter picker and active filter chips. Keeps the
 * deterministic `getTagColor` palette consistent across all surfaces (the
 * filter used to ignore it and render muted/primary chips instead).
 *
 * Three modes, picked by props:
 * - static (default): a plain coloured label.
 * - toggle (`onToggle`): a pressable option for the filter picker.
 * - removable (`onRemove`): a coloured chip with a ✕ for active filters.
 */
export function TagChip({ tag, size = "sm", selected, onToggle, onRemove, className }: TagChipProps) {
  const base = cn(
    "inline-flex items-center gap-1 rounded-full font-medium",
    SIZES[size],
    getTagColor(tag),
    className,
  )

  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className={cn(
          base,
          "transition-opacity",
          selected
            ? "opacity-100 ring-2 ring-inset ring-foreground/30"
            : "opacity-50 hover:opacity-80",
        )}
      >
        {tag}
      </button>
    )
  }

  if (onRemove) {
    return (
      <span className={base}>
        {tag}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="-mr-0.5 rounded-full p-0.5 hover:bg-foreground/10"
          aria-label={`Filter ${tag} entfernen`}
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    )
  }

  return <span className={base}>{tag}</span>
}
