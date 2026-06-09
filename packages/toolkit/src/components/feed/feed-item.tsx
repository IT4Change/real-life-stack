"use client"

import { Calendar, CheckSquare, MapPin, MessageCircle, Tag } from "lucide-react"
import type { Item } from "@real-life-stack/data-interface"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/primitives/avatar"
import { RelativeTime } from "@/components/primitives/relative-time"
import { cn } from "@/lib/utils"
import { isAllDayDate, parseEventDate } from "@/lib/date-utils"

export interface FeedItemProps {
  /** The item to display. */
  item: Item
  /** Resolved author info. */
  author: { name: string; avatar?: string }
  /** Click handler — opens detail view. */
  onClick?: () => void
  /** Slot for ReactionBar. */
  reactionSlot?: React.ReactNode
  /** Comment count (from Commentable mixin or computed). */
  commentCount?: number
  /** Callback when comment count is clicked. */
  onCommentClick?: () => void
  /** Additional CSS classes. */
  className?: string
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

function TypeBadge({ type }: { type: string }) {
  if (type === "post") return null

  const config: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; className: string }> = {
    event: {
      icon: Calendar,
      label: "Event",
      className: "bg-blue-50 text-blue-700 border-blue-200",
    },
    task: {
      icon: CheckSquare,
      label: "Task",
      className: "bg-amber-50 text-amber-700 border-amber-200",
    },
  }

  const cfg = config[type]
  if (!cfg) return null
  const Icon = cfg.icon

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", cfg.className)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

/**
 * A single feed item. Renders any item type with type-specific metadata.
 * Uses Item.data fields directly — no adapter needed.
 */
export function FeedItem({
  item,
  author,
  onClick,
  reactionSlot,
  commentCount,
  onCommentClick,
  className,
}: FeedItemProps) {
  const data = item.data as Record<string, unknown>
  const title = data.title as string | undefined
  const content = (data.content ?? data.description ?? "") as string
  const tags = (data.tags as string[] | undefined) ?? []
  const start = data.start as string | undefined
  const end = data.end as string | undefined
  const address = data.address as string | undefined

  return (
    <article
      className={cn(
        "rounded-lg border bg-card transition-all",
        onClick && "cursor-pointer hover:border-primary/30 hover:shadow-md",
        className
      )}
      onClick={onClick}
    >
      {/* Header: author + type badge + timestamp */}
      <div className="flex items-start gap-3 p-4 pb-2">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarImage src={author.avatar} alt={author.name} />
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
            {getInitials(author.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm">{author.name}</span>
            <TypeBadge type={item.type} />
          </div>
          <RelativeTime date={item.createdAt} className="text-xs" />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        {title && (
          <h3 className="font-semibold text-foreground mb-1">{title}</h3>
        )}
        {content && (
          <p className="text-sm text-foreground leading-relaxed line-clamp-4">{content}</p>
        )}
      </div>

      {/* Metadata: date, location, tags */}
      {(start || address || tags.length > 0) && (
        <div className="px-4 pb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {start && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatEventDate(start, end)}
            </span>
          )}
          {address && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {address}
            </span>
          )}
          {tags.length > 0 && (
            <span className="inline-flex items-center gap-1 flex-wrap">
              <Tag className="h-3 w-3" />
              {tags.join(" · ")}
            </span>
          )}
        </div>
      )}

      {/* Footer: reactions + comment count */}
      {(reactionSlot || (commentCount != null && commentCount > 0)) && (
        <div className="border-t px-4 py-2 flex items-center gap-3">
          {reactionSlot}
          {commentCount != null && commentCount > 0 && (
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onCommentClick?.() }}
            >
              <MessageCircle className="h-3 w-3" />
              {commentCount} Kommentar{commentCount !== 1 ? "e" : ""}
            </button>
          )}
        </div>
      )}
    </article>
  )
}

function formatEventDate(start: string, end?: string): string {
  // All-day events (bare YYYY-MM-DD) render date-only — no clock time.
  // Anything with a time component renders date + time.
  const startAllDay = isAllDayDate(start)
  const s = parseEventDate(start)
  const dateStr = s.toLocaleDateString("de-DE", { day: "numeric", month: "short" })
  const timeStr = startAllDay
    ? null
    : s.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })

  if (!end) return timeStr ? `${dateStr}, ${timeStr}` : dateStr

  const endAllDay = isAllDayDate(end)
  const e = parseEventDate(end)
  const endTimeStr = endAllDay
    ? null
    : e.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })

  // Same day. Four cases — handle the mixed ones explicitly so a null
  // side doesn't get interpolated into the string.
  if (s.toDateString() === e.toDateString()) {
    if (!timeStr && !endTimeStr) return dateStr
    if (timeStr && endTimeStr) return `${dateStr}, ${timeStr} – ${endTimeStr}`
    if (timeStr) return `${dateStr}, ${timeStr}`
    return `${dateStr}, bis ${endTimeStr}`
  }

  const endDateStr = e.toLocaleDateString("de-DE", { day: "numeric", month: "short" })
  const startPart = timeStr ? `${dateStr}, ${timeStr}` : dateStr
  const endPart = endTimeStr ? `${endDateStr}, ${endTimeStr}` : endDateStr
  return `${startPart} – ${endPart}`
}
