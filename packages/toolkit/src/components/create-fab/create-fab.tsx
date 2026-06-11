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
 * The button positions itself with `fixed` + safe-area padding so it
 * stays clear of the bottom navigation on mobile. Use inside a relative
 * or full-screen container; the high z-index keeps it above Leaflet
 * panes and module drawers but below modal sheets.
 */
export function CreateFab({ onClick, label = "Erstellen", className }: CreateFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95",
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <Plus className="h-6 w-6" />
    </button>
  )
}
