"use client"

import { useEffect, useState } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CommentWithAuthor } from "@/hooks/use-comments"
import { CommentBubble } from "./comment-bubble"

export interface CommentThreadProps {
  /** The first-level comment. */
  comment: CommentWithAuthor
  /** Second-level replies. */
  replies: CommentWithAuthor[]
  /** Whether replies are initially expanded. Default: false. */
  defaultExpanded?: boolean
  /** Incrementing trigger to force-expand replies (e.g. after creating a reply). */
  expandTrigger?: number
  /** Callback when reply button is clicked on any comment in the thread. */
  onReply?: (comment: CommentWithAuthor) => void
  /** Whether the user can reply. */
  canReply?: boolean
  /** Slot builder for ReactionBar per comment. */
  renderReactions?: (itemId: string) => React.ReactNode
}

/**
 * A first-level comment with collapsible second-level replies.
 */
export function CommentThread({
  comment,
  replies,
  defaultExpanded = false,
  expandTrigger,
  onReply,
  canReply = true,
  renderReactions,
}: CommentThreadProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  // Force expand when trigger changes (e.g. after creating a reply)
  useEffect(() => {
    if (expandTrigger !== undefined) setExpanded(true)
  }, [expandTrigger])
  const replyCount = replies.length

  return (
    <div>
      {/* First-level comment */}
      <CommentBubble
        authorName={comment.authorName}
        authorAvatar={comment.authorAvatar}
        content={(comment.item.data as { content: string }).content}
        timestamp={comment.item.createdAt}
        onReply={() => onReply?.(comment)}
        canReply={canReply}
        reactionSlot={renderReactions?.(comment.item.id)}
      />

      {/* Reply count toggle */}
      {replyCount > 0 && (
        <button
          type="button"
          className="ml-10 mt-1.5 flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-label={`${replyCount} Antwort${replyCount !== 1 ? "en" : ""}, ${expanded ? "einklappen" : "aufklappen"}`}
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
          {replyCount} Antwort{replyCount !== 1 ? "en" : ""}
        </button>
      )}

      {/* Second-level replies (collapsible) */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="ml-10 mt-2 space-y-3">
            {replies.map((reply) => {
              const data = reply.item.data as {
                content: string
                replyToComment?: string
                replyTo?: string
              }

              // Find quoted comment if replying to a different second-level comment
              const quotedReply = data.replyToComment && data.replyToComment !== data.replyTo
                ? replies.find((r) => r.item.id === data.replyToComment)
                : undefined

              return (
                <div key={reply.item.id} data-reply>
                <CommentBubble
                  authorName={reply.authorName}
                  authorAvatar={reply.authorAvatar}
                  content={data.content}
                  timestamp={reply.item.createdAt}
                  onReply={() => onReply?.(reply)}
                  canReply={canReply}
                  quotedAuthor={quotedReply?.authorName}
                  quotedText={quotedReply ? (quotedReply.item.data as { content: string }).content.slice(0, 80) : undefined}
                  reactionSlot={renderReactions?.(reply.item.id)}
                />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
