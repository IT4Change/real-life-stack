"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useComments } from "@/hooks/use-comments"
import type { CommentWithAuthor } from "@/hooks/use-comments"
import { CommentInput, type CommentQuote } from "./comment-input"
import { CommentThread } from "./comment-thread"

export interface CommentSectionProps {
  /** ID of the item to show comments for. */
  itemId: string
  /** Placeholder text for the input. Default: "Kommentar schreiben..." */
  placeholder?: string
  /** Slot builder for ReactionBar per comment. */
  renderReactions?: (itemId: string) => React.ReactNode
  /** Hide the built-in input. Use this when placing CommentInput separately. */
  hideInput?: boolean
  /** Callback exposing reply state, so the consumer can render a separate CommentInput. */
  onReplyChange?: (replyTo: CommentQuote | null, submit: (text: string) => Promise<void>, cancel: () => void) => void
  /** Additional CSS classes for the comment list. */
  className?: string
}

/**
 * Complete comment section: comment list + input.
 * The list and the input are rendered as siblings so the consumer can place
 * them in separate layout zones (e.g. input outside a scroll container).
 *
 * The consumer controls layout. Use hideInput + onReplyChange to render
 * the CommentInput separately (e.g. outside a scroll container).
 */
export function CommentSection({
  itemId,
  placeholder,
  renderReactions,
  hideInput = false,
  onReplyChange,
  className,
}: CommentSectionProps) {
  const { comments, allComments, canComment, createComment } = useComments(itemId)
  const [replyTo, setReplyTo] = useState<CommentQuote | null>(null)
  const [replyToFirstLevel, setReplyToFirstLevel] = useState<string | null>(null)

  // Reset reply state when the section is reused for a different item
  // (same instance, no remount — e.g. a detail panel switching items).
  // Otherwise a pending reply quote from the previous item sticks around
  // and submitting would attach the comment to a parent that lives on
  // another item: invisible in both items' thread trees, lost for the
  // user. Render-time reset per React's "adjusting state when a prop
  // changes" pattern (no effect, no one-frame stale flash).
  const [prevItemId, setPrevItemId] = useState(itemId)
  if (itemId !== prevItemId) {
    setPrevItemId(itemId)
    setReplyTo(null)
    setReplyToFirstLevel(null)
  }
  const endRef = useRef<HTMLDivElement>(null)
  const shouldScrollRef = useRef(false)
  const scrollToThreadRef = useRef<string | null>(null)
  const [expandTrigger, setExpandTrigger] = useState<{ threadId: string; tick: number } | null>(null)
  const threadRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Build replies per first-level comment from allComments
  const repliesByParent = useMemo(() => {
    const map = new Map<string, CommentWithAuthor[]>()
    for (const c of allComments) {
      if (c.type !== "comment") continue
      const replyToId = (c.data as { replyTo?: string }).replyTo
      if (!replyToId) continue

      const list = map.get(replyToId) ?? []
      list.push({
        item: c,
        authorName: c.createdBy,
        authorAvatar: undefined,
        replyCount: 0,
      })
      map.set(replyToId, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.item.createdAt).getTime() - new Date(b.item.createdAt).getTime())
    }
    return map
  }, [allComments])

  const handleReply = useCallback((comment: CommentWithAuthor) => {
    const data = comment.item.data as { content: string; replyTo?: string }
    const isSecondLevel = !!data.replyTo

    setReplyTo({
      id: comment.item.id,
      authorName: comment.authorName,
      text: (data.content ?? "").slice(0, 80),
    })

    setReplyToFirstLevel(isSecondLevel ? data.replyTo! : comment.item.id)
  }, [])

  const handleSubmit = useCallback(async (text: string) => {
    if (replyTo && replyToFirstLevel) {
      const replyToComment = replyTo.id !== replyToFirstLevel ? replyTo.id : undefined
      await createComment(text, replyToFirstLevel, replyToComment)
      // Expand the thread and scroll to it
      setExpandTrigger((prev) => ({ threadId: replyToFirstLevel, tick: (prev?.tick ?? 0) + 1 }))
      scrollToThreadRef.current = replyToFirstLevel
    } else {
      await createComment(text)
      scrollToThreadRef.current = null
    }
    setReplyTo(null)
    setReplyToFirstLevel(null)
    shouldScrollRef.current = true
  }, [createComment, replyTo, replyToFirstLevel])

  const handleCancelReply = useCallback(() => {
    setReplyTo(null)
    setReplyToFirstLevel(null)
  }, [])

  // Scroll to the new comment after it appears in the DOM
  useEffect(() => {
    if (!shouldScrollRef.current) return
    shouldScrollRef.current = false

    const threadId = scrollToThreadRef.current
    scrollToThreadRef.current = null

    requestAnimationFrame(() => {
      if (threadId) {
        // Reply — scroll to the last reply in the thread
        const threadEl = threadRefs.current.get(threadId)
        if (threadEl) {
          const lastReply = threadEl.querySelector("[data-reply]:last-child")
          const target = lastReply ?? threadEl
          target.scrollIntoView({ behavior: "smooth", block: "end" })
        }
      } else {
        // Top-level comment — scroll to end
        endRef.current?.previousElementSibling?.scrollIntoView({ behavior: "smooth", block: "nearest" })
      }
    })
  }, [comments, allComments])

  // Notify consumer of reply state for external input rendering
  useEffect(() => {
    onReplyChange?.(replyTo, handleSubmit, handleCancelReply)
  }, [replyTo, handleSubmit, handleCancelReply, onReplyChange])

  return (
    <>
      {/* Comment list */}
      {comments.length > 0 && (
        <div className={cn("space-y-4 p-4", className)}>
          {comments.map((comment) => (
            <div key={comment.item.id} ref={(el) => { if (el) threadRefs.current.set(comment.item.id, el); else threadRefs.current.delete(comment.item.id) }}>
              <CommentThread
                comment={comment}
                replies={repliesByParent.get(comment.item.id) ?? []}
                expandTrigger={expandTrigger?.threadId === comment.item.id ? expandTrigger.tick : undefined}
                onReply={canComment ? handleReply : undefined}
                canReply={canComment}
                renderReactions={renderReactions}
              />
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {/* Built-in input (can be hidden when consumer renders it separately) */}
      {canComment && !hideInput && (
        <CommentInput
          onSubmit={handleSubmit}
          replyTo={replyTo}
          onCancelReply={handleCancelReply}
          placeholder={placeholder}
        />
      )}
    </>
  )
}
