import { useState, useCallback, useMemo, type DragEvent } from "react"
import type { Item, User, Relation } from "@real-life-stack/data-interface"
import { Card, CardContent, CardHeader, CardTitle } from "../primitives/card"
import { Avatar, AvatarFallback, AvatarImage } from "../primitives/avatar"
import { Tooltip, TooltipTrigger, TooltipContent } from "../primitives/tooltip"
import { cn, getTagColor } from "../../lib/utils"
import { EyeOff, Eye, ChevronDown, ChevronRight, MessageCircle } from "lucide-react"

export interface KanbanColumn {
  id: string
  label: string
}

// IDs follow task/v1 spec enum: open | in-progress | done | archived.
// `archived` is intentionally omitted from the default UI — it's a valid
// status, but boards stay readable with three columns. Groups that need
// it can override via the feature item's customColumns.
export const defaultColumns: KanbanColumn[] = [
  { id: "open", label: "To Do" },
  { id: "in-progress", label: "In Arbeit" },
  { id: "done", label: "Erledigt" },
]

export interface KanbanBoardProps {
  items: Item[]
  columns?: KanbanColumn[]
  users?: User[]
  onMoveItem?: (itemId: string, newStatus: string, position: number) => void
  onItemClick?: (item: Item) => void
  /** Called when an item not belonging to this board is dropped onto it */
  onExternalDrop?: (itemId: string, newStatus: string, position: number) => void
}

interface DropTarget {
  columnId: string
  index: number
}

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


interface KanbanCardProps {
  item: Item
  users?: User[]
  isDragged: boolean
  onDragStart: (e: DragEvent, itemId: string) => void
  onDragEnd?: () => void
  onClick?: (item: Item) => void
}

function KanbanCard({ item, users, isDragged, onDragStart, onDragEnd, onClick }: KanbanCardProps) {
  const assigneeIds = getAssigneeIds(item)
  const userMap = new Map((users ?? []).map((u) => [u.id, u]))
  const assignees = assigneeIds.map((id) => userMap.get(id)).filter((u): u is User => u != null)
  const tags = (item.data.tags as string[]) ?? []
  const commentCount = (item.data.commentCount as number | undefined) ?? 0

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick?.(item)}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing",
        "hover:border-primary/30 hover:shadow-md transition-all",
        "select-none",
        isDragged && "opacity-50"
      )}
    >
      <p className={cn(
        "font-medium text-sm leading-snug",
        String(item.data.title ?? "") ? "text-foreground" : "text-muted-foreground italic"
      )}>
        {String(item.data.title ?? "") || "Ohne Titel"}
      </p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", getTagColor(tag))}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        {assignees.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <div className="flex -space-x-1.5">
                  {assignees.map((user) => (
                    <Avatar key={user.id} className="h-5 w-5 border border-background">
                      <AvatarImage src={user.avatarUrl} alt={user.displayName} />
                      <AvatarFallback className="text-[8px] bg-muted">
                        {getInitials(user.displayName ?? user.id)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {assignees.length === 1
                    ? assignees[0].displayName
                    : assignees.length === 2
                      ? `${assignees[0].displayName}, ${assignees[1].displayName}`
                      : `${assignees[0].displayName} + ${assignees.length - 1} weitere`}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {assignees.map((u) => u.displayName ?? u.id).join(", ")}
            </TooltipContent>
          </Tooltip>
        )}

        {commentCount > 0 && (
          <div className="flex items-center gap-0.5 text-muted-foreground ml-auto">
            <MessageCircle className="h-3 w-3" />
            <span className="text-[10px]">{commentCount}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function DropIndicator({ visible }: { visible: boolean }) {
  return (
    <div
      className={cn(
        "h-0.5 rounded-full transition-all mx-1",
        visible ? "bg-primary scale-x-100 my-1" : "scale-x-0 my-0 h-0"
      )}
    />
  )
}

export function KanbanBoard({
  items,
  columns = defaultColumns,
  users,
  onMoveItem,
  onItemClick,
  onExternalDrop,
}: KanbanBoardProps) {
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [floatingHoverColumn, setFloatingHoverColumn] = useState<string | null>(null)
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(new Set())
  const [collapsedColumnIds, setCollapsedColumnIds] = useState<Set<string>>(new Set())
  const [hiddenChipHoverColumn, setHiddenChipHoverColumn] = useState<string | null>(null)

  const visibleColumns = useMemo(
    () => columns.filter((col) => !hiddenColumnIds.has(col.id)),
    [columns, hiddenColumnIds]
  )
  const hiddenColumns = useMemo(
    () => columns.filter((col) => hiddenColumnIds.has(col.id)),
    [columns, hiddenColumnIds]
  )

  const toggleHideColumn = useCallback((columnId: string) => {
    setHiddenColumnIds((prev) => {
      const next = new Set(prev)
      if (next.has(columnId)) {
        next.delete(columnId)
      } else {
        next.add(columnId)
      }
      return next
    })
  }, [])

  const toggleCollapseColumn = useCallback((columnId: string) => {
    setCollapsedColumnIds((prev) => {
      const next = new Set(prev)
      if (next.has(columnId)) {
        next.delete(columnId)
      } else {
        next.add(columnId)
      }
      return next
    })
  }, [])
  const handleDragStart = useCallback((e: DragEvent, itemId: string) => {
    e.dataTransfer.setData("text/plain", itemId)
    e.dataTransfer.effectAllowed = "move"
    setDraggedItemId(itemId)
  }, [])

  const handleCardDragOver = useCallback(
    (e: DragEvent, columnId: string, cardIndex: number) => {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "move"
      setDragOverColumn(columnId)

      const rect = e.currentTarget.getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      const index = e.clientY < midY ? cardIndex : cardIndex + 1

      setDropTarget((prev) => {
        if (prev && prev.columnId === columnId && prev.index === index) return prev
        return { columnId, index }
      })
    },
    []
  )

  const handleColumnDragOver = useCallback(
    (e: DragEvent, columnId: string, itemCount: number) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      setDragOverColumn(columnId)

      // Only set drop target to end if we're not over a card
      if (e.target === e.currentTarget) {
        setDropTarget({ columnId, index: itemCount })
      }
    },
    []
  )

  const handleDragLeave = useCallback((e: DragEvent) => {
    // Only clear if we're leaving the column entirely (not entering a child)
    const relatedTarget = e.relatedTarget as Node | null
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) return
    setDragOverColumn(null)
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent, columnId: string, fallbackIndex: number) => {
      e.preventDefault()
      setDragOverColumn(null)
      const position = dropTarget?.columnId === columnId ? dropTarget.index : fallbackIndex
      setDropTarget(null)
      setDraggedItemId(null)
      const itemId = e.dataTransfer.getData("text/plain")
      if (!itemId) return
      // Check if item belongs to this board
      const isOwnItem = items.some((item) => item.id === itemId)
      if (isOwnItem) {
        onMoveItem?.(itemId, columnId, position)
      } else {
        onExternalDrop?.(itemId, columnId, position)
      }
    },
    [onMoveItem, onExternalDrop, dropTarget, items]
  )

  const handleDragEnd = useCallback(() => {
    setDraggedItemId(null)
    setDragOverColumn(null)
    setDropTarget(null)
    setFloatingHoverColumn(null)
    setHiddenChipHoverColumn(null)
  }, [])

  const itemsByColumn = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const col of columns) {
      map.set(col.id, [])
    }
    for (const item of items) {
      const status = (item.data.status as string) ?? columns[0]?.id
      const list = map.get(status)
      if (list) list.push(item)
    }
    for (const list of map.values()) {
      list.sort((a, b) => ((a.data.order as number) ?? 0) - ((b.data.order as number) ?? 0))
    }
    return map
  }, [items, columns])

  const handleFloatingDrop = useCallback(
    (e: DragEvent, columnId: string) => {
      e.preventDefault()
      const itemId = e.dataTransfer.getData("text/plain")
      const columnItems = itemsByColumn.get(columnId) ?? []
      setDraggedItemId(null)
      setDragOverColumn(null)
      setDropTarget(null)
      setFloatingHoverColumn(null)
      if (!itemId) return
      const isOwnItem = items.some((item) => item.id === itemId)
      if (isOwnItem) {
        onMoveItem?.(itemId, columnId, columnItems.length)
      } else {
        onExternalDrop?.(itemId, columnId, columnItems.length)
      }
    },
    [onMoveItem, onExternalDrop, itemsByColumn, items]
  )

  // Derive the source column of the dragged item (no extra state needed)
  const draggedItemColumnId = useMemo(() => {
    if (!draggedItemId) return null
    for (const [colId, colItems] of itemsByColumn) {
      if (colItems.some((item) => item.id === draggedItemId)) return colId
    }
    return null
  }, [draggedItemId, itemsByColumn])

  const handleHiddenChipDrop = useCallback(
    (e: DragEvent, columnId: string) => {
      e.preventDefault()
      const itemId = e.dataTransfer.getData("text/plain")
      const columnItems = itemsByColumn.get(columnId) ?? []
      setDraggedItemId(null)
      setDragOverColumn(null)
      setDropTarget(null)
      setHiddenChipHoverColumn(null)
      if (!itemId) return
      const isOwnItem = items.some((item) => item.id === itemId)
      if (isOwnItem) {
        onMoveItem?.(itemId, columnId, columnItems.length)
      } else {
        onExternalDrop?.(itemId, columnId, columnItems.length)
      }
    },
    [onMoveItem, onExternalDrop, itemsByColumn, items]
  )

  return (
    <div className="@container">
      {/* Hidden Columns Bar — Desktop only */}
      {hiddenColumns.length > 0 && (
        <div className="hidden @3xl:flex flex-wrap gap-2 mb-3">
          {hiddenColumns.map((column) => {
            const columnItems = itemsByColumn.get(column.id) ?? []
            const isDragging = draggedItemId !== null
            const isHovered = hiddenChipHoverColumn === column.id
            return (
              <button
                key={column.id}
                type="button"
                onClick={() => !isDragging && toggleHideColumn(column.id)}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = "move"
                }}
                onDragEnter={() => setHiddenChipHoverColumn(column.id)}
                onDragLeave={() => setHiddenChipHoverColumn((prev) => prev === column.id ? null : prev)}
                onDrop={(e) => handleHiddenChipDrop(e, column.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  isDragging
                    ? cn(
                        "border-2 border-dashed",
                        isHovered
                          ? "border-solid border-primary bg-primary/15 text-primary"
                          : "border-primary/30 bg-muted text-muted-foreground"
                      )
                    : "bg-muted text-muted-foreground hover:bg-accent cursor-pointer"
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                {column.label}
                <span className="text-xs opacity-70">({columnItems.length})</span>
              </button>
            )
          })}
        </div>
      )}

      <div
        className="grid gap-4 grid-cols-1 @3xl:[grid-template-columns:var(--kanban-cols)]"
        style={{ '--kanban-cols': `repeat(${visibleColumns.length}, minmax(0, 1fr))` } as React.CSSProperties}
      >
        {/* Desktop: only visible columns. Mobile: all columns (hiddenColumnIds ignored). */}
        {columns.map((column) => {
          const isHiddenDesktop = hiddenColumnIds.has(column.id)
          const isCollapsed = collapsedColumnIds.has(column.id)
          const columnItems = itemsByColumn.get(column.id) ?? []
          return (
            <Card
              key={column.id}
              className={cn(
                "transition-colors gap-0 pt-2",
                isCollapsed ? "pb-0 @3xl:pb-2" : "pb-2",
                isHiddenDesktop && "@3xl:hidden",
                dragOverColumn === column.id && "border-primary/50 bg-primary/5"
              )}
              onDragOver={(e) => handleColumnDragOver(e, column.id, columnItems.length)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id, columnItems.length)}
            >
              <CardHeader className={cn("px-3", isCollapsed ? "pb-0 @3xl:pb-1" : "pb-1")}>
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {/* Mobile: collapse toggle */}
                    <button
                      type="button"
                      onClick={() => toggleCollapseColumn(column.id)}
                      className="@3xl:hidden p-0.5 rounded hover:bg-muted transition-colors"
                      aria-label={isCollapsed ? "Spalte ausklappen" : "Spalte einklappen"}
                    >
                      {isCollapsed
                        ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      }
                    </button>
                    <span>{column.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      {columnItems.length}
                    </span>
                    {/* Desktop: hide button */}
                    <button
                      type="button"
                      onClick={() => toggleHideColumn(column.id)}
                      disabled={visibleColumns.length <= 1}
                      className={cn(
                        "hidden @3xl:inline-flex p-1 rounded hover:bg-muted transition-colors",
                        visibleColumns.length <= 1 && "opacity-30 cursor-not-allowed"
                      )}
                      aria-label={`Spalte "${column.label}" ausblenden`}
                    >
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </CardTitle>
              </CardHeader>
              {/* Mobile: hide content when collapsed. Desktop: always show (hidden columns aren't in grid). */}
              <CardContent className={cn(
                "space-y-0 min-h-[40px] @3xl:min-h-[60px] px-3 pb-1",
                isCollapsed && "hidden @3xl:block"
              )}>
                <DropIndicator
                  visible={dropTarget?.columnId === column.id && dropTarget.index === 0}
                />
                {columnItems.map((item, idx) => (
                  <div
                    key={item.id}
                    onDragOver={(e) => handleCardDragOver(e, column.id, idx)}
                    className="py-1"
                  >
                    <KanbanCard
                      item={item}
                      users={users}
                      isDragged={draggedItemId === item.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onClick={onItemClick}
                    />
                    <DropIndicator
                      visible={
                        dropTarget?.columnId === column.id && dropTarget.index === idx + 1
                      }
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Floating Drop Bar — visible during drag for quick column changes.
          NOTE: HTML Drag & Drop API does not work on mobile touch devices.
          For Capacitor/mobile, @dnd-kit or manual touch handling will be needed. */}
      {draggedItemId !== null && (
        <div className="fixed bottom-20 left-4 right-4 z-40 animate-in slide-in-from-bottom-4 fade-in @3xl:hidden">
          <div className="flex flex-wrap gap-2 p-2 rounded-xl border bg-background/95 backdrop-blur shadow-lg">
            {columns.filter((col) => col.id !== draggedItemColumnId).map((column) => (
              <div
                key={column.id}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = "move"
                }}
                onDragEnter={() => setFloatingHoverColumn(column.id)}
                onDragLeave={() => setFloatingHoverColumn((prev) => prev === column.id ? null : prev)}
                onDrop={(e) => handleFloatingDrop(e, column.id)}
                className={cn(
                  "flex-1 min-w-[80px] rounded-lg border-2 border-dashed px-3 py-2 text-center text-sm font-medium transition-colors",
                  floatingHoverColumn === column.id
                    ? "border-solid border-primary bg-primary/15 text-primary scale-105"
                    : "border-primary/30 text-foreground"
                )}
              >
                {column.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
