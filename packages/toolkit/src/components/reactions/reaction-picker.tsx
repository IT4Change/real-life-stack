"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { REACTION_EMOJIS, REACTION_NAMES } from "./reaction-constants"

export interface ReactionPickerProps {
  /** Callback when an emoji is selected. */
  onSelect: (emoji: string) => void
  /** Callback when the picker is dismissed. */
  onClose: () => void
  /** Anchor element for positioning. */
  anchorRef: React.RefObject<HTMLElement | null>
  /** Additional CSS classes. */
  className?: string
}

/**
 * Floating panel showing the 16 available reaction emojis.
 * Positions itself near the anchor element, flipping if needed to fit on screen.
 */
export function ReactionPicker({ onSelect, onClose, anchorRef, className }: ReactionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  // Calculate position
  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    const picker = pickerRef.current
    if (!anchor || !picker) return

    const anchorRect = anchor.getBoundingClientRect()
    const pickerRect = picker.getBoundingClientRect()
    const margin = 8

    // Preferred: below-left aligned
    let top = anchorRect.bottom + 4
    let left = anchorRect.left

    // Flip vertically if not enough space below
    if (top + pickerRect.height + margin > window.innerHeight) {
      top = anchorRect.top - pickerRect.height - 4
    }

    // Flip horizontally if not enough space to the right
    if (left + pickerRect.width + margin > window.innerWidth) {
      left = window.innerWidth - pickerRect.width - margin
    }

    // Clamp to viewport
    top = Math.max(margin, Math.min(top, window.innerHeight - pickerRect.height - margin))
    left = Math.max(margin, Math.min(left, window.innerWidth - pickerRect.width - margin))

    setPosition({ top, left })
  }, [anchorRef])

  useEffect(() => {
    requestAnimationFrame(updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("resize", updatePosition)
    return () => {
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("resize", updatePosition)
    }
  }, [updatePosition])

  // Close on click outside (delayed registration to avoid the opening click triggering close)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const anchor = anchorRef.current
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        (!anchor || !anchor.contains(e.target as Node))
      ) {
        onClose()
      }
    }
    const frame = requestAnimationFrame(() => {
      document.addEventListener("mousedown", handleClickOutside)
    })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [onClose, anchorRef])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <>
      <style>{`
        @keyframes reaction-picker-in {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div
        ref={pickerRef}
        role="dialog"
        aria-label="Choose a reaction"
        className={cn(
          "fixed z-50 grid grid-cols-8 gap-1 p-2 rounded-lg border bg-popover shadow-lg",
          className
        )}
        style={{
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          animation: position ? "reaction-picker-in 200ms ease-out both" : undefined,
        }}
      >
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={REACTION_NAMES[emoji] ?? emoji}
            className="flex items-center justify-center h-9 w-9 rounded-md text-lg hover:bg-accent transition-colors cursor-pointer"
            onClick={() => {
              onSelect(emoji)
              onClose()
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  )
}
