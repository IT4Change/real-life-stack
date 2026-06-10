"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/primitives/avatar"
import { useReactionUsers } from "@/hooks/use-reactions"
import type { AggregatedReaction } from "@/hooks/use-reactions"

export interface ReactionDetailsProps {
  /** ID of the item to show reaction details for. */
  itemId: string
  /** Emoji to pre-filter to when opening. If undefined, shows "All". */
  initialEmoji?: string
  /** Aggregated reactions (passed from ReactionBar to avoid re-fetching counts). */
  reactions: AggregatedReaction[]
  /** Callback when the panel is dismissed. */
  onClose: () => void
  /** Additional CSS classes. */
  className?: string
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Panel showing who reacted to an item.
 * Displays a filter row of emoji pills and a flat list of users.
 * Designed to be rendered inside an AdaptivePanel by the consumer.
 */
export function ReactionDetails({
  itemId,
  initialEmoji,
  reactions,
  onClose,
  className,
}: ReactionDetailsProps) {
  const [activeFilter, setActiveFilter] = useState<string | undefined>(initialEmoji)
  const { users, isLoading } = useReactionUsers(itemId, activeFilter)

  const totalCount = reactions.reduce((sum, r) => sum + r.count, 0)

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Reactions</h3>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground text-sm"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {/* "All" filter */}
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            activeFilter === undefined
              ? "bg-primary/10 text-primary"
              : "bg-muted/60 text-muted-foreground hover:bg-muted"
          )}
          onClick={() => setActiveFilter(undefined)}
        >
          All
          <span className="tabular-nums">{totalCount}</span>
        </button>

        {reactions.map((r) => (
          <button
            key={r.emoji}
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors",
              activeFilter === r.emoji
                ? "bg-primary/10 text-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
            onClick={() => setActiveFilter(r.emoji)}
          >
            <span className="text-base leading-none">{r.emoji}</span>
            <span className="tabular-nums">{r.count}</span>
          </button>
        ))}
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            Loading...
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            No reactions yet
          </div>
        ) : (
          <ul>
            {users.map((user) => (
              <li
                key={`${user.id}-${user.emoji}`}
                className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 transition-colors"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatarUrl} alt={user.displayName} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    {getInitials(user.displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm text-foreground truncate">
                  {user.displayName}
                </span>
                <span className="text-base leading-none">{user.emoji}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
