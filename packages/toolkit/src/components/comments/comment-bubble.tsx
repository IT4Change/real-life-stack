"use client"

import { Reply } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/primitives/avatar"
import { RelativeTime } from "@/components/primitives/relative-time"
import { cn } from "@/lib/utils"

export interface CommentBubbleProps {
  /** Author display name. */
  authorName: string
  /** Author avatar URL. */
  authorAvatar?: string
  /** Comment text content. */
  content: string
  /** ISO-8601 date string or relative timestamp string. */
  timestamp: string
  /** Callback when reply button is clicked. */
  onReply?: () => void
  /** Whether the reply button is visible. */
  canReply?: boolean
  /** Quote reference for replies to second-level comments. */
  quotedAuthor?: string
  quotedText?: string
  /** Slot for ReactionBar below the comment text. */
  reactionSlot?: React.ReactNode
  /** Additional CSS classes. */
  className?: string
}

function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value)
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Single comment display: avatar, author, timestamp, text, reactions, reply button.
 */
export function CommentBubble({
  authorName,
  authorAvatar,
  content,
  timestamp,
  onReply,
  canReply = true,
  quotedAuthor,
  quotedText,
  reactionSlot,
  className,
}: CommentBubbleProps) {
  return (
    <div className={cn("flex gap-2.5", className)}>
      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
        <AvatarImage src={authorAvatar} alt={authorName} />
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
          {getInitials(authorName)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        {/* Author + timestamp */}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{authorName}</span>
          {isISODate(timestamp)
            ? <RelativeTime date={timestamp} className="text-xs" />
            : <span className="text-xs text-muted-foreground">{timestamp}</span>
          }
        </div>

        {/* Quote reference (for replies to second-level comments) */}
        {quotedAuthor && quotedText && (
          <div className="mt-1 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/70">↩ @{quotedAuthor}: </span>
            <span className="truncate">{quotedText}</span>
          </div>
        )}

        {/* Comment text */}
        <p className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words">{content}</p>

        {/* Actions row: reactions + reply */}
        <div className="mt-1.5 flex items-center gap-2">
          {reactionSlot}
          {canReply && onReply && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={onReply}
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
