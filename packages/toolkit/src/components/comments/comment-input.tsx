"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Send, X } from "lucide-react"
import { Button } from "@/components/primitives/button"
import { cn } from "@/lib/utils"

export interface CommentQuote {
  id: string
  authorName: string
  text: string
}

export interface CommentInputProps {
  /** Callback when a comment is submitted. */
  onSubmit: (text: string) => void
  /** Comment being replied to (shows quote preview). */
  replyTo?: CommentQuote | null
  /** Callback to cancel reply mode. */
  onCancelReply?: () => void
  /** Placeholder text. */
  placeholder?: string
  /** Whether the input is disabled (e.g. unauthenticated). */
  disabled?: boolean
  /** Additional CSS classes. */
  className?: string
}

/**
 * Messenger-style comment input with auto-expanding textarea,
 * quote preview for replies, and Enter-to-send.
 * Designed to be sticky at the bottom of its container.
 */
export function CommentInput({
  onSubmit,
  replyTo,
  onCancelReply,
  placeholder = "Kommentar schreiben...",
  disabled = false,
  className,
}: CommentInputProps) {
  const [text, setText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  useEffect(() => {
    resize()
  }, [text, resize])

  // Auto-focus when entering reply mode
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus()
    }
  }, [replyTo])

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setText("")
    // Reset height after clear
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) el.style.height = "auto"
    })
  }, [text, onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  if (disabled) return null

  return (
    <div className={cn("border-t bg-background", className)}>
      {/* Quote preview when replying */}
      {replyTo && (
        <div className="flex items-start gap-2 px-3 pt-2 pb-1">
          <div className="flex-1 min-w-0 rounded bg-muted/60 px-2.5 py-1.5 text-xs">
            <span className="font-medium text-foreground">↩ {replyTo.authorName}</span>
            <p className="text-muted-foreground truncate mt-0.5">{replyTo.text}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
            onClick={onCancelReply}
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 p-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-lg border bg-muted/30 px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40",
            "transition-colors"
          )}
          style={{ overflow: "hidden" }}
        />
        <Button
          size="sm"
          className="h-9 w-9 p-0 shrink-0"
          disabled={!text.trim()}
          onClick={handleSubmit}
          aria-label="Send comment"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
