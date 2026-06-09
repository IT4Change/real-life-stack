import type { Item, User, Relation } from "@real-life-stack/data-interface"
import { Avatar, AvatarFallback, AvatarImage } from "../primitives/avatar"
import { cn, getTagColor } from "../../lib/utils"
import { normalizeStatus } from "./reorder"
import { Calendar, Tag, User as UserIcon, AlignLeft } from "lucide-react"

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function getAssigneeIds(item: Item): string[] {
  return (item.relations ?? [])
    .filter((r: Relation) => r.predicate === "assignedTo")
    .map((r: Relation) => r.target.replace(/^global:/, ""))
}


// Keys are task/v1 spec IDs; legacy todo/doing get folded in via
// normalizeStatus before lookup, so persisted items don't render as
// raw IDs.
function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: "To Do",
    "in-progress": "In Arbeit",
    done: "Erledigt",
    archived: "Archiviert",
  }
  return labels[normalizeStatus(status)] ?? status
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    open: "bg-muted text-muted-foreground",
    "in-progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    archived: "bg-muted/60 text-muted-foreground",
  }
  return colors[normalizeStatus(status)] ?? "bg-muted text-muted-foreground"
}

export interface KanbanCardDetailProps {
  item: Item
  users?: User[]
  className?: string
}

export function KanbanCardDetail({ item, users, className }: KanbanCardDetailProps) {
  const assigneeIds = getAssigneeIds(item)
  const assignees = (users ?? []).filter((u) => assigneeIds.includes(u.id))
  const tags = (item.data.tags as string[]) ?? []
  const status = (item.data.status as string) ?? "open"
  const title = String(item.data.title ?? "")
  const description = item.data.description != null ? String(item.data.description) : null
  const createdAt = item.createdAt

  return (
    <div className={cn("space-y-5 p-4", className)}>
      {/* Title */}
      <div>
        <h2 className="text-lg font-semibold text-foreground leading-tight">{title}</h2>
        <span
          className={cn(
            "inline-block mt-2 text-xs px-2.5 py-1 rounded-full font-medium",
            getStatusColor(status)
          )}
        >
          {getStatusLabel(status)}
        </span>
      </div>

      {/* Description */}
      {description && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <AlignLeft className="h-3.5 w-3.5" />
            Beschreibung
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {description}
          </p>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <Tag className="h-3.5 w-3.5" />
            Tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  getTagColor(tag)
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Assignees */}
      {assignees.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <UserIcon className="h-3.5 w-3.5" />
            Zugewiesen
          </div>
          <div className="space-y-2">
            {assignees.map((user) => (
              <div key={user.id} className="flex items-center gap-2.5">
                <Avatar className="h-7 w-7 border border-border">
                  <AvatarImage src={user.avatarUrl} alt={user.displayName} />
                  <AvatarFallback className="text-[10px] bg-muted">
                    {getInitials(user.displayName ?? user.id)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-foreground">{user.displayName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Created date */}
      {createdAt && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <Calendar className="h-3.5 w-3.5" />
            Erstellt
          </div>
          <p className="text-sm text-foreground/80">
            {new Date(createdAt).toLocaleDateString("de-DE", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      )}
    </div>
  )
}
