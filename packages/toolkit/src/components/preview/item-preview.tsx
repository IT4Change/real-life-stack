"use client"

import type { CSSProperties, KeyboardEvent, ReactNode } from "react"
import type { Item, User } from "@real-life-stack/data-interface"
import { Avatar, AvatarFallback, AvatarImage } from "../primitives/avatar"
import { RelativeTime } from "../primitives/relative-time"
import { ProfileLink } from "../profile/profile-link"
import { TagChip } from "../tag/tag-chip"
import { cn, getActivePanelGlow } from "../../lib/utils"
import { useItemTags } from "../../hooks/use-item-tags"

/**
 * `ItemPreview` — shared item-card surface for list/board/feed contexts.
 *
 * Spec: `docs/spec/modules/shared-components.md` → `ItemPreview`.
 *
 * Renders only the generic, type-agnostic part of an item (author row,
 * title, description, tags). Module-specific cues — type badges, date
 * hints, status chips, assignees, marker colors, comment counts — flow
 * in through three Adornment slots, so each module decorates the same
 * card without forking the layout.
 *
 * Three slots, each renders independently of the data blocks so a card
 * with only some sections still places its adornments correctly:
 * - `headerAdornment`: next to the author name when the author row is
 *   rendered, otherwise its own top row above the title (e.g.
 *   `<TypeBadge>`).
 * - `metaAdornment`: its own row below the title block, also rendered
 *   when there is no title (e.g. a card with only date+address).
 * - `footerAdornment`: bordered footer row below tags (e.g. assignees,
 *   status chip, comment count).
 *
 * Caller owns the click handler (open detail, etc.). Adornments that
 * carry their own buttons should `event.stopPropagation()` so a button
 * click doesn't double-fire the card click. When `onClick` is set the
 * card also becomes keyboard-activatable (Enter / Space) and exposes
 * `role="button"` plus `tabIndex={0}` so assistive tech can reach it.
 *
 * Reads `data.title` / `data.content` / `data.description` via plain
 * field access. Tags come from `item.tags` (top-level, spec 07-tags.md).
 * Anything time- or place-shaped (date hint, address, distance) is the
 * caller's job and flows through `metaAdornment`. Author resolution
 * stays with the caller — pass a resolved `User` (e.g. via
 * `useItemAuthor`) or rely on the `createdBy` fallback.
 */
/**
 * Layout density. `comfortable` is the feed-card sized default (avatar
 * 10×10, font-base title, p-4 spacing, description shown). `compact`
 * is tuned for kanban boards and dense list views: no description in
 * the body, smaller padding/font/avatar so multiple cards fit a
 * column without bleeding off-screen.
 */
export type ItemPreviewDensity = "comfortable" | "compact"

/** Neutral toolkit default; apps may supply an origin-group colour instead. */
export const DEFAULT_ACTIVE_ITEM_GLOW_COLOR = "#64748b"

export interface ItemPreviewProps {
  item: Item
  /**
   * Resolved item author.
   * - `undefined` (or omitted): the card renders the author row with
   *   `item.createdBy` as the display name and an initials-only avatar.
   * - `User`: render with the resolved name/avatar.
   * - `null`: suppress the entire author row (useful when the
   *   surrounding view already shows the author context).
   */
  author?: User | null
  /** Card click — typically opens a detail view. */
  onClick?: () => void
  /** Slot next to the author name. */
  headerAdornment?: ReactNode
  /** Right-aligned actions at the end of the header row (e.g. the detail ⋮
   *  menu). Detail views pass it; list cards leave it empty so cards stay
   *  action-free. */
  actions?: ReactNode
  /** Slot between title and description. */
  metaAdornment?: ReactNode
  /** Slot below the tag chips. */
  footerAdornment?: ReactNode
  /**
   * Layout density. Default `comfortable` matches the feed card.
   * `compact` shrinks paddings and avatar, drops the description
   * block — fits kanban / dense list contexts.
   */
  density?: ItemPreviewDensity
  /** Highlights the selected item using the shared panel-glow treatment. */
  active?: boolean
  /** Optional `#rrggbb` override for the active-item glow. */
  activeGlowColor?: string
  className?: string
  /** Inline style on the card root — e.g. the active-item glow (box-shadow). */
  style?: CSSProperties
}

function getInitials(name: string): string {
  if (!name) return "?"
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!)
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function ItemPreview({
  item,
  author,
  onClick,
  headerAdornment,
  actions,
  metaAdornment,
  footerAdornment,
  density = "comfortable",
  active = false,
  activeGlowColor = DEFAULT_ACTIVE_ITEM_GLOW_COLOR,
  className,
  style,
}: ItemPreviewProps) {
  const data = item.data as Record<string, unknown>
  const title = typeof data.title === "string" ? data.title : undefined
  const description =
    density === "compact"
      ? ""
      : (typeof data.content === "string" && data.content) ||
        (typeof data.description === "string" && data.description) ||
        ""
  const tags = useItemTags(item)

  const authorName = author?.displayName ?? item.createdBy
  const authorAvatar = author?.avatarUrl
  const authorId = author?.id ?? item.createdBy
  const isCompact = density === "compact"

  // Keyboard activation: when the card is interactive, treat Enter and
  // Space like a button. We don't render a real <button> because the
  // card carries nested interactive content (adornment buttons, links)
  // which would be invalid inside a button; <article> + button-role is
  // the standard pattern for clickable cards with nested actions.
  const interactive = !!onClick
  const handleKeyDown = interactive
    ? (e: KeyboardEvent<HTMLElement>) => {
        if (e.target !== e.currentTarget) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick?.()
        }
      }
    : undefined

  return (
    <article
      data-preview-density={density}
      data-active-preview={active ? "true" : undefined}
      className={cn(
        "rounded-lg border bg-card transition-all",
        interactive &&
          "cursor-pointer hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className,
      )}
      style={{ ...(active ? getActivePanelGlow(activeGlowColor) : {}), ...style }}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={handleKeyDown}
    >
      {author !== null && (
        <div className={cn("flex items-start gap-3", isCompact ? "p-3 pb-1" : "p-4 pb-2")}>
          <ProfileLink userId={authorId} label={`Profil von ${authorName} öffnen`}>
            <Avatar className={cn("shrink-0", isCompact ? "h-6 w-6" : "h-10 w-10")}>
              <AvatarImage src={authorAvatar} alt={authorName} />
              <AvatarFallback className={cn("bg-primary/10 text-primary font-medium", isCompact ? "text-[10px]" : "text-sm")}>
                {getInitials(authorName)}
              </AvatarFallback>
            </Avatar>
          </ProfileLink>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("font-semibold text-foreground", isCompact ? "text-xs" : "text-sm")}>{authorName}</span>
              {headerAdornment}
            </div>
            {!isCompact && <RelativeTime date={item.createdAt} className="text-xs" />}
          </div>
          {actions && <div className="-mr-1 shrink-0">{actions}</div>}
        </div>
      )}

      {/* Header-only block — when the author row is suppressed. The adornment
          (e.g. a scope badge on a kanban card) sits on its OWN row only when
          there's no title to share a row with; with a title it renders inline
          next to it (below). Actions always get this row when present. */}
      {author === null && (actions || (headerAdornment && !title)) && (
        <div className={cn("flex items-center gap-2", isCompact ? "px-3 pt-2 pb-0.5" : "px-4 pt-3 pb-1")}>
          {!title && <div className="flex flex-1 flex-wrap items-center gap-2">{headerAdornment}</div>}
          {actions && <div className="-mr-1 shrink-0">{actions}</div>}
        </div>
      )}

      {(title || description) && (
        <div className={cn(isCompact ? "px-3 pb-2 pt-1.5" : "px-4 pb-3 pt-2")}>
          {title &&
            (author === null ? (
              // No author row → the scope badge shares the title's row, to its right.
              <div className="flex items-start justify-between gap-2">
                <h3 className={cn("min-w-0 text-foreground", isCompact ? "font-medium text-sm leading-snug" : "font-semibold text-base mb-1")}>
                  {title}
                </h3>
                {headerAdornment && <div className="shrink-0">{headerAdornment}</div>}
              </div>
            ) : (
              <h3 className={cn("text-foreground", isCompact ? "font-medium text-sm leading-snug" : "font-semibold text-base mb-1")}>
                {title}
              </h3>
            ))}
          {description && (
            <p className="text-sm text-foreground leading-relaxed line-clamp-4 mt-1">{description}</p>
          )}
        </div>
      )}

      {/* Meta adornment is its own row, independent of the title/description
          block. This way a card with date+address but no title still gets
          the meta hint rendered. */}
      {metaAdornment && (
        <div className={cn("text-xs text-muted-foreground", isCompact ? "px-3 pb-2" : "px-4 pb-3")}>{metaAdornment}</div>
      )}

      {tags.length > 0 && (
        <div className={cn("flex flex-wrap gap-1", isCompact ? "px-3 pb-2" : "px-4 pb-3 gap-1.5")}>
          {tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </div>
      )}

      {footerAdornment && (
        <div className={cn("flex items-center gap-3", isCompact ? "px-3 py-1.5" : "border-t px-4 py-2")}>
          {footerAdornment}
        </div>
      )}
    </article>
  )
}
