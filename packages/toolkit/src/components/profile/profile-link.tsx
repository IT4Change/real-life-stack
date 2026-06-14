import type { ReactNode } from "react"
import { cn } from "../../lib/utils"
import { useOpenProfile } from "../../hooks/use-open-profile"

export interface ProfileLinkProps {
  /** User whose profile opens on click. */
  userId: string
  children: ReactNode
  className?: string
  /**
   * Stop the click from bubbling to a wrapping clickable card (e.g. an
   * ItemPreview that opens the detail panel). Default `true` — an avatar
   * click should open the profile, not the card.
   */
  stopPropagation?: boolean
  /** Accessible label; defaults to a generic "Profil öffnen". */
  label?: string
}

/**
 * Wraps an avatar (or any user-bound element) so a click opens that
 * user's profile via `useOpenProfile`. Keyboard accessible and, by
 * default, isolates its click from a surrounding card.
 *
 * Without an `OpenProfileProvider` above it the underlying hook is a
 * no-op, so this stays safe in Storybook / test harnesses.
 */
export function ProfileLink({
  userId,
  children,
  className,
  stopPropagation = true,
  label = "Profil öffnen",
}: ProfileLinkProps) {
  const openProfile = useOpenProfile()

  const activate = (e: { stopPropagation: () => void }) => {
    if (stopPropagation) e.stopPropagation()
    openProfile(userId)
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          activate(e)
        }
      }}
      className={cn(
        "cursor-pointer rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </span>
  )
}
