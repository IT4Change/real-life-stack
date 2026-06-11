"use client"

import type { ReactNode } from "react"
import type { Item, User } from "@real-life-stack/data-interface"
import { Avatar, AvatarFallback, AvatarImage } from "../primitives/avatar"
import { RelativeTime } from "../primitives/relative-time"
import { cn, getTagColor } from "../../lib/utils"
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
 * Three slots:
 * - `headerAdornment`: next to the author name (e.g. `<TypeBadge>`)
 * - `metaAdornment`: between title and description (e.g. date hint, distance)
 * - `footerAdornment`: below tags (e.g. assignees, status chip, comment count)
 *
 * Caller owns the click handler (open detail, etc.). Adornments that
 * carry their own buttons should `event.stopPropagation()` so a button
 * click doesn't double-fire the card click.
 *
 * Reads `data.title` / `data.content` / `data.description` / `data.start`
 * / `data.end` via plain field access. Tags come from `item.tags`
 * (top-level, spec 07-tags.md). Author resolution stays with the caller
 * — pass a resolved `User` (e.g. via `useItemAuthor`) or rely on the
 * `createdBy` fallback shown below.
 */
export interface ItemPreviewProps {
  item: Item
  /**
   * Resolved item author. When absent, the card falls back to
   * `item.createdBy` as the display name and renders an initials-only
   * avatar. Pass `null`/`undefined` to suppress the entire author row.
   */
  author?: User | null
  /** Card click — typically opens a detail view. */
  onClick?: () => void
  /** Slot next to the author name. */
  headerAdornment?: ReactNode
  /** Slot between title and description. */
  metaAdornment?: ReactNode
  /** Slot below the tag chips. */
  footerAdornment?: ReactNode
  className?: string
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
  metaAdornment,
  footerAdornment,
  className,
}: ItemPreviewProps) {
  const data = item.data as Record<string, unknown>
  const title = typeof data.title === "string" ? data.title : undefined
  const description =
    (typeof data.content === "string" && data.content) ||
    (typeof data.description === "string" && data.description) ||
    ""
  const tags = useItemTags(item)

  const authorName = author?.displayName ?? item.createdBy
  const authorAvatar = author?.avatarUrl

  return (
    <article
      className={cn(
        "rounded-lg border bg-card transition-all",
        onClick && "cursor-pointer hover:border-primary/30 hover:shadow-md",
        className,
      )}
      onClick={onClick}
    >
      {author !== null && (
        <div className="flex items-start gap-3 p-4 pb-2">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={authorAvatar} alt={authorName} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {getInitials(authorName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground text-sm">{authorName}</span>
              {headerAdornment}
            </div>
            <RelativeTime date={item.createdAt} className="text-xs" />
          </div>
        </div>
      )}

      {(title || description) && (
        <div className="px-4 pb-3 pt-2">
          {title && <h3 className="font-semibold text-foreground mb-1">{title}</h3>}
          {metaAdornment && (
            <div className="text-xs text-muted-foreground mb-2">{metaAdornment}</div>
          )}
          {description && (
            <p className="text-sm text-foreground leading-relaxed line-clamp-4">{description}</p>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                getTagColor(tag),
              )}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {footerAdornment && (
        <div className="border-t px-4 py-2 flex items-center gap-3">{footerAdornment}</div>
      )}
    </article>
  )
}
