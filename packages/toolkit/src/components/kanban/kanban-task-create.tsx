import { useState, useRef, type KeyboardEvent } from "react"
import type { KanbanColumn } from "./kanban-board"
import type { User, Group } from "@real-life-stack/data-interface"
import { defaultColumns } from "./kanban-board"
import { Input } from "../primitives/input"
import { Textarea } from "../primitives/textarea"
import { Button } from "../primitives/button"
import { Avatar, AvatarFallback, AvatarImage } from "../primitives/avatar"
import { cn, getTagColor } from "../../lib/utils"
import { AlignLeft, Tag, Columns3, X, UserIcon, FolderOpen, ChevronRight, Trash2 } from "lucide-react"

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    todo: "To Do",
    doing: "In Arbeit",
    done: "Erledigt",
  }
  return labels[status] ?? status
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    todo: "bg-muted text-muted-foreground",
    doing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  }
  return colors[status] ?? "bg-muted text-muted-foreground"
}


export interface KanbanTaskFormData {
  title: string
  description: string
  status: string
  tags: string[]
  assigneeId: string | null
  groupId: string | null
}

export interface KanbanTaskFormProps {
  onSubmit: (data: KanbanTaskFormData) => void
  onCancel: () => void
  onDelete?: () => void
  initialData?: KanbanTaskFormData
  columns?: KanbanColumn[]
  users?: User[]
  groups?: Group[]
  defaultGroupId?: string | null
  availableTags?: string[]
  className?: string
}

export function KanbanTaskForm({
  onSubmit,
  onCancel,
  onDelete,
  initialData,
  columns = defaultColumns,
  users = [],
  groups = [],
  defaultGroupId,
  availableTags = [],
  className,
}: KanbanTaskFormProps) {
  const isEdit = !!initialData
  const defaultData: KanbanTaskFormData = {
    title: initialData?.title ?? "",
    description: initialData?.description ?? "",
    status: initialData?.status ?? "open",
    tags: initialData?.tags ?? [],
    assigneeId: initialData?.assigneeId ?? null,
    groupId: initialData?.groupId ?? defaultGroupId ?? null,
  }
  // Tracks the last saved state — updated after each submit
  const lastSavedRef = useRef<KanbanTaskFormData>(defaultData)
  const [title, setTitle] = useState(defaultData.title)
  const [description, setDescription] = useState(defaultData.description)
  const [status, setStatus] = useState(defaultData.status)
  const [tags, setTags] = useState<string[]>(defaultData.tags)
  const [tagInput, setTagInput] = useState("")
  const [assigneeId, setAssigneeId] = useState<string | null>(defaultData.assigneeId)
  const [groupId, setGroupId] = useState<string | null>(defaultData.groupId)
  const [groupOpen, setGroupOpen] = useState(!isEdit)

  // Filter out aggregate groups — items must belong to a concrete group
  const selectableGroups = groups.filter((g) => (g.data?.scope as string) !== "aggregate")

  const resetForm = () => {
    const d = lastSavedRef.current
    setTitle(d.title)
    setDescription(d.description)
    setStatus(d.status)
    setTags(d.tags)
    setTagInput("")
    setAssigneeId(d.assigneeId)
    setGroupId(d.groupId)
    setGroupOpen(!isEdit)
  }

  const handleSubmit = () => {
    if (!title.trim()) return
    if (selectableGroups.length > 0 && !groupId) return
    const data: KanbanTaskFormData = { title: title.trim(), description: description.trim(), status, tags, assigneeId, groupId }
    lastSavedRef.current = data
    onSubmit(data)
  }

  const handleCancel = () => {
    resetForm()
    onCancel()
  }

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
    }
    setTagInput("")
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addTag(tagInput)
    }
  }

  // Tags from availableTags that haven't been added yet
  const suggestedTags = availableTags.filter((t) => !tags.includes(t))

  return (
    <div className={cn("space-y-5 p-4", className)}>
      {/* Heading */}
      <h2 className="text-lg font-semibold text-foreground leading-tight">
        {isEdit ? "Task bearbeiten" : "Neuen Task erstellen"}
      </h2>

      {/* Group */}
      {selectableGroups.length > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setGroupOpen(!groupOpen)}
            className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide hover:text-foreground transition-colors"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Gruppe
            {!groupOpen && groupId && (
              <span className="normal-case tracking-normal text-foreground font-medium">
                — {selectableGroups.find((g) => g.id === groupId)?.name}
              </span>
            )}
            <ChevronRight className={cn("h-3 w-3 transition-transform", groupOpen && "rotate-90")} />
          </button>
          {groupOpen && (
            <div className="flex flex-wrap gap-1.5">
              {selectableGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setGroupId(group.id)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full font-medium transition-all",
                    "bg-muted text-muted-foreground",
                    groupId === group.id
                      ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                      : "opacity-50 hover:opacity-75"
                  )}
                >
                  {group.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Title */}
      <div className="space-y-1.5">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel eingeben..."
          autoFocus
        />
      </div>

      {/* Status */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
          <Columns3 className="h-3.5 w-3.5" />
          Status
        </div>
        <div className="flex flex-wrap gap-1.5">
          {columns.map((col) => (
            <button
              key={col.id}
              type="button"
              onClick={() => setStatus(col.id)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full font-medium transition-all",
                getStatusColor(col.id),
                status === col.id
                  ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                  : "opacity-50 hover:opacity-75"
              )}
            >
              {getStatusLabel(col.id)}
            </button>
          ))}
        </div>
      </div>

      {/* Assignee */}
      {users.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <UserIcon className="h-3.5 w-3.5" />
            Zugewiesen
          </div>
          <div className="flex flex-wrap gap-1.5">
            {/* Unassigned option */}
            <button
              type="button"
              onClick={() => setAssigneeId(null)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-all",
                "bg-muted text-muted-foreground",
                assigneeId === null
                  ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                  : "opacity-50 hover:opacity-75"
              )}
            >
              Niemand
            </button>
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setAssigneeId(user.id)}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-all",
                  "bg-muted text-muted-foreground",
                  assigneeId === user.id
                    ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                    : "opacity-50 hover:opacity-75"
                )}
              >
                <Avatar className="h-4 w-4">
                  <AvatarImage src={user.avatarUrl} alt={user.displayName} />
                  <AvatarFallback className="text-[7px] bg-background">
                    {getInitials(user.displayName ?? user.id)}
                  </AvatarFallback>
                </Avatar>
                {user.displayName ?? user.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
          <AlignLeft className="h-3.5 w-3.5" />
          Beschreibung
        </div>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Beschreibung hinzufuegen..."
          rows={3}
        />
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
          <Tag className="h-3.5 w-3.5" />
          Tags
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1",
                  getTagColor(tag)
                )}
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:opacity-70"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <Input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="Tag eingeben und Enter druecken..."
        />
        {suggestedTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestedTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium opacity-40 hover:opacity-70 transition-opacity",
                  getTagColor(tag)
                )}
              >
                + {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-2">
        {isEdit && onDelete && (
          <Button variant="outline" onClick={onDelete} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" onClick={handleCancel} className="flex-1">
          Abbrechen
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!title.trim() || (selectableGroups.length > 0 && !groupId)}
          className="flex-1"
        >
          {isEdit ? "Speichern" : "Task erstellen"}
        </Button>
      </div>
    </div>
  )
}

// Backwards-compatible aliases
export { KanbanTaskForm as KanbanTaskCreate }
export type { KanbanTaskFormData as KanbanTaskCreateData, KanbanTaskFormProps as KanbanTaskCreateProps }
