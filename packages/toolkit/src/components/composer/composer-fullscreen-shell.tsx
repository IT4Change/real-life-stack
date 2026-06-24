"use client"

import { useEffect, useState, type ReactNode } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/primitives/button"
import { cn } from "@/lib/utils"

function EscapeHandler({ onEscape }: { onEscape: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onEscape])
  return null
}

export interface ComposerFullscreenShellProps {
  /** Whether the shell is open. The parent owns this (e.g. URL-driven); the shell
   *  animates the fade and unmounts itself ~200ms after it goes false. */
  open: boolean
  /** User dismissed via X / Escape. The parent decides what to do (usually close). */
  onRequestClose: () => void
  children: ReactNode
}

/**
 * Fullscreen fade-in shell for the content composer — a presentation *variant*
 * of the composer (the form is the same; only the surface differs). Reusable by
 * any module that wants the "write a post" fullscreen surface instead of the
 * side panel. Pure presentation: open state is controlled, dismissal is reported
 * via `onRequestClose`.
 *
 * Originally the modal half of `FeedComposerTrigger`, lifted out so create can be
 * shell-agnostic (sheet vs fullscreen) and URL-driven.
 */
export function ComposerFullscreenShell({ open, onRequestClose, children }: ComposerFullscreenShellProps) {
  // `mounted` keeps the node around for the fade-out; `visible` drives the opacity
  // transition. open=true → mount then fade in (double-rAF); open=false → fade
  // out then unmount after the 200ms transition.
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    const t = setTimeout(() => setMounted(false), 200)
    return () => clearTimeout(t)
  }, [open])

  if (!mounted) return null
  return (
    <>
      <EscapeHandler onEscape={onRequestClose} />
      <div
        className={cn(
          "fixed inset-0 z-50 bg-background transition-opacity duration-200 ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="absolute top-3 right-3 z-10">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:text-foreground"
            onClick={onRequestClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="mx-auto max-w-3xl h-full overflow-y-auto">{children}</div>
      </div>
    </>
  )
}
