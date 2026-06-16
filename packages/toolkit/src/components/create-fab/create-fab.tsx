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
 * The button positions itself with `fixed`. On mobile it sits ~12px above
 * the `BottomNav` (fixed bottom-0, `md:hidden`): the 5.25rem offset clears
 * the nav's content height with a small gap, and the added
 * `env(safe-area-inset-bottom)` mirrors the nav's own safe-area padding so
 * the gap stays consistent on notched devices (the nav height is not fixed —
 * it's content + that inset). From `md` up there is no BottomNav, so it
 * drops back to a normal corner offset. Its right edge follows the shared
 * panel via the `--adaptive-panel-margin-right` CSS variable, so an open
 * sidebar panel pushes the FAB left to sit beside it instead of covering it.
 * Use inside a relative or full-screen container; the z-index keeps it above
 * Leaflet panes but below modal sheets / drawers.
 */
export function CreateFab({ onClick, label = "Erstellen", className }: CreateFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      // Right edge tracks the shared panel's inset: when a sidebar panel
      // opens, AdaptivePanel publishes its width as --adaptive-panel-margin-right,
      // so the FAB slides left to sit beside the panel instead of being overlaid.
      style={{ right: "calc(1rem + var(--adaptive-panel-margin-right, 0px))" }}
      className={cn(
        "fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-300 ease-out in-[.adaptive-panel-resizing]:transition-none hover:scale-105 hover:shadow-xl active:scale-95 md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <Plus className="h-6 w-6" />
    </button>
  )
}
