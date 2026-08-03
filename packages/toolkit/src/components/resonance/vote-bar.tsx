"use client"

import { useCallback } from "react"
import type { VoteValue } from "@real-life-stack/data-interface"
import { cn } from "@/lib/utils"
import { useVotes } from "@/hooks/use-votes"

export interface VoteBarProps {
  /** ID of the statement item to show votes for. */
  statementId: string
  /** Additional CSS classes. */
  className?: string
}

const VOTE_LABELS: Record<VoteValue, string> = {
  green: "Zustimmung",
  yellow: "Bedenken",
  red: "Ablehnung",
}

const VOTE_ORDER: readonly VoteValue[] = ["green", "yellow", "red"]

const SEGMENT_CLASSES: Record<VoteValue, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
}

const BUTTON_CLASSES: Record<VoteValue, { idle: string; active: string }> = {
  green: {
    idle: "border-border text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400",
    active: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  yellow: {
    idle: "border-border text-muted-foreground hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-900/30 dark:hover:text-amber-400",
    active: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  red: {
    idle: "border-border text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30 dark:hover:text-red-400",
    active: "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
}

const DOT_CLASSES: Record<VoteValue, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
}

/**
 * Inline vote display + controls for a statement (Resonance module).
 * Shows the green/yellow/red distribution as a proportional bar and one
 * button per stance. Clicking the own stance again withdraws the vote.
 * Sits in ItemPreview's footerAdornment, so all interactions stop propagation.
 */
export function VoteBar({ statementId, className }: VoteBarProps) {
  const { summary, vote, canVote } = useVotes(statementId)

  const handleVote = useCallback(
    (value: VoteValue) => {
      if (!canVote) return
      void vote(value)
    },
    [canVote, vote],
  )

  if (summary.total === 0 && !canVote) return null

  return (
    // Voting is its own interaction — it must never bubble into the card's
    // open-item click (ItemPreview wraps the bar in a clickable surface).
    <div
      className={cn("flex flex-col gap-1.5", className)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {summary.total > 0 && (
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={VOTE_ORDER.map((value) => `${VOTE_LABELS[value]}: ${summary[value]}`).join(", ")}
        >
          {VOTE_ORDER.map((value) =>
            summary[value] > 0 ? (
              <div
                key={value}
                className={SEGMENT_CLASSES[value]}
                style={{ flexGrow: summary[value] }}
              />
            ) : null,
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {VOTE_ORDER.map((value) => {
          const isMine = summary.myVote === value
          return (
            <button
              key={value}
              type="button"
              disabled={!canVote}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors select-none",
                canVote ? "cursor-pointer" : "cursor-default",
                isMine ? BUTTON_CLASSES[value].active : BUTTON_CLASSES[value].idle,
              )}
              aria-pressed={isMine}
              aria-label={`${VOTE_LABELS[value]}${isMine ? ", deine Stimme" : ""}`}
              title={isMine ? `${VOTE_LABELS[value]} zurückziehen` : VOTE_LABELS[value]}
              onClick={() => handleVote(value)}
            >
              <span className={cn("h-2 w-2 rounded-full", DOT_CLASSES[value])} />
              <span className="tabular-nums">{summary[value]}</span>
            </button>
          )
        })}
        <span className="pl-1 text-xs text-muted-foreground tabular-nums">
          {summary.total === 1 ? "1 Stimme" : `${summary.total} Stimmen`}
        </span>
      </div>
    </div>
  )
}
