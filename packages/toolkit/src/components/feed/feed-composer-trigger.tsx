"use client"

import { useCallback, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/primitives/avatar"
import { cn } from "@/lib/utils"
import { ComposerFullscreenShell } from "@/components/composer/composer-fullscreen-shell"

export interface FeedComposerTriggerProps {
  /** Placeholder text. Default: "Was gibt's Neues?" */
  placeholder?: string
  /** Current user display name. */
  userName?: string
  /** Current user avatar URL. */
  userAvatar?: string
  /**
   * Trigger-only mode: clicking the card calls this (with any typed first
   * character) instead of opening the built-in fullscreen modal. Use this when
   * an app-level host owns the create surface (URL-driven). When provided,
   * `children` is ignored.
   */
  onCompose?: (initialText?: string) => void
  /** Content to render inside the built-in fullscreen modal (self-contained mode). */
  children?: (props: { onClose: () => void; initialText?: string }) => React.ReactNode
  /** Additional CSS classes for the trigger card. */
  className?: string
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

/**
 * Feed post creation trigger that opens a fullscreen modal. The trigger looks
 * like a text input field; on click it fades in the fullscreen composer shell
 * with the ContentComposer inside, auto-focused so the user can type right away.
 * The fullscreen surface itself is the reusable {@link ComposerFullscreenShell}.
 */
export function FeedComposerTrigger({
  placeholder = "Was gibt's Neues?",
  userName,
  userAvatar,
  onCompose,
  children,
  className,
}: FeedComposerTriggerProps) {
  const [open, setOpen] = useState(false)
  const [initialText, setInitialText] = useState<string | undefined>()

  // Trigger-only mode hands off to an app-level host; otherwise the built-in
  // fullscreen modal opens.
  const handleOpen = useCallback((text?: string) => {
    if (onCompose) {
      onCompose(text)
      return
    }
    setInitialText(text)
    setOpen(true)
  }, [onCompose])

  const handleClose = useCallback(() => {
    setOpen(false)
    setInitialText(undefined)
  }, [])

  return (
    <>
      {/* Trigger card — looks like a text input */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => handleOpen()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleOpen()
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // Printable character — open composer with that character as initial text
            e.preventDefault()
            handleOpen(e.key)
          }
        }}
        className={cn(
          "flex items-center gap-3 rounded-lg border bg-card p-3 cursor-pointer",
          "hover:border-primary/30 hover:shadow-sm transition-all",
          className,
        )}
      >
        {userName && (
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={userAvatar} alt={userName} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
        )}
        <span className="text-sm text-muted-foreground flex-1">{placeholder}</span>
      </div>

      {children && (
        <ComposerFullscreenShell open={open} onRequestClose={handleClose}>
          {children({ onClose: handleClose, initialText })}
        </ComposerFullscreenShell>
      )}
    </>
  )
}
