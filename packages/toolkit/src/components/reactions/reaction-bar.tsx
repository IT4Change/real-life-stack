"use client"

import { useCallback, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/primitives/button"
import { useReactions } from "@/hooks/use-reactions"
import type { AggregatedReaction } from "@/hooks/use-reactions"
import { REACTION_NAMES } from "./reaction-constants"
import { ReactionPicker } from "./reaction-picker"

export interface ReactionBarProps {
  /** ID of the item to show reactions for. */
  itemId: string
  /** Maximum number of distinct emojis to show before collapsing. Default: 6. */
  maxVisible?: number
  /** Callback when user clicks count (desktop) or long-presses (mobile) a pill to view details. */
  onOpenDetails?: (emoji?: string) => void
  /** Additional CSS classes. */
  className?: string
}

/** Duration in ms for long press detection on mobile. */
const LONG_PRESS_MS = 500
/** Duration in ms before visual feedback starts. */
const LONG_PRESS_FEEDBACK_MS = 200

interface PillProps {
  reaction: AggregatedReaction
  onReact: (emoji: string) => void
  onOpenDetails?: (emoji: string) => void
}

function ReactionPill({ reaction, onReact, onOpenDetails }: PillProps) {
  const { emoji, count, isMyReaction } = reaction
  const pressTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const [pressing, setPressing] = useState(false)
  const didLongPressRef = useRef(false)

  const handlePointerDown = useCallback(() => {
    didLongPressRef.current = false

    // Start visual feedback after 200ms
    feedbackTimerRef.current = setTimeout(() => {
      setPressing(true)
    }, LONG_PRESS_FEEDBACK_MS)

    // Long press triggers details
    pressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true
      setPressing(false)
      onOpenDetails?.(emoji)
    }, LONG_PRESS_MS)
  }, [emoji, onOpenDetails])

  const handlePointerUp = useCallback(() => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    setPressing(false)

    // Short tap = toggle reaction (only if long press didn't fire)
    if (!didLongPressRef.current) {
      onReact(emoji)
    }
  }, [emoji, onReact])

  const handlePointerCancel = useCallback(() => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    setPressing(false)
  }, [])

  const name = REACTION_NAMES[emoji] ?? emoji

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border text-sm transition-all select-none cursor-pointer",
        isMyReaction
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
        pressing && "scale-105"
      )}
      aria-label={`${name}, ${count} reaction${count !== 1 ? "s" : ""}${isMyReaction ? ", your reaction" : ""}`}
      aria-pressed={isMyReaction}
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onReact(emoji)
        }
      }}
    >
      {/* Emoji area — tap/click to toggle */}
      <span className="pl-1.5 py-0.5 text-base leading-none">{emoji}</span>
      {/* Count area — click to open details (desktop), part of long-press zone (mobile) */}
      <span
        className="pr-1.5 pl-1 py-0.5 text-xs tabular-nums hover:underline"
        onClick={(e) => {
          // Desktop: clicking count opens details
          e.stopPropagation()
          onOpenDetails?.(emoji)
        }}
      >
        {count}
      </span>
    </span>
  )
}

/**
 * Inline display of reactions on an item.
 * Shows emoji pills sorted by frequency, a + button to add reactions,
 * and supports opening ReactionDetails via count click / long press.
 */
export function ReactionBar({ itemId, maxVisible = 6, onOpenDetails, className }: ReactionBarProps) {
  const { reactions, react, canReact } = useReactions(itemId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const addButtonRef = useRef<HTMLButtonElement>(null)

  const visibleReactions = reactions.slice(0, maxVisible)
  const overflowCount = reactions.length - maxVisible

  const handleReact = useCallback(
    (emoji: string) => {
      if (!canReact) return
      react(emoji)
    },
    [canReact, react]
  )

  // Don't render anything if no reactions and user can't react
  if (reactions.length === 0 && !canReact) return null

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {visibleReactions.map((r) => (
        <ReactionPill
          key={r.emoji}
          reaction={r}
          onReact={handleReact}
          onOpenDetails={onOpenDetails}
        />
      ))}

      {overflowCount > 0 && (
        <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
          +{overflowCount}
        </span>
      )}

      {canReact && (
        <>
          <Button
            ref={addButtonRef}
            variant="ghost"
            size="sm"
            className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-foreground"
            aria-label="Add reaction"
            onClick={() => setPickerOpen((prev) => !prev)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>

          {pickerOpen && (
            <ReactionPicker
              anchorRef={addButtonRef}
              onSelect={handleReact}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </>
      )}
    </div>
  )
}
