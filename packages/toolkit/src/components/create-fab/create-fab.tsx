"use client"

import { Plus } from "lucide-react"
import { cn } from "../../lib/utils"

export interface CreateFabProps {
  onClick: () => void
  label?: string
  className?: string
}

/**
 * Floating Action Button for "create new item" — sits bottom-right of
 * its containing module surface. All four module views use the same
 * FAB so the create entry point is at one consistent screen location.
 *
 * The button positions itself with `fixed`. On mobile it clears the
 * `BottomNav` (fixed bottom-0, ~56px tall, `md:hidden`) by sitting a
 * nav-height above the bottom edge; from `md` up there is no BottomNav
 * so it drops back to a normal corner offset. The safe-area inset keeps
 * it above the home indicator on notched devices. Use inside a relative
 * or full-screen container; the z-index keeps it above Leaflet panes
 * but below modal sheets / drawers.
 */
export function CreateFab({ onClick, label = "Erstellen", className }: CreateFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "fixed right-6 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95 md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <Plus className="h-6 w-6" />
    </button>
  )
}
