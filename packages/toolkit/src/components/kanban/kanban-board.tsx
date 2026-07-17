import { useState, useCallback, useMemo, type DragEvent, type ReactNode } from "react"
import type { Item, User, Relation } from "@real-life-stack/data-interface"
import { Card, CardContent, CardHeader, CardTitle } from "../primitives/card"
import { cn, getActivePanelGlow } from "../../lib/utils"
import { ItemPreview } from "../preview/item-preview"
import { ItemAssignees } from "../preview/item-assignees"
import { ItemCommentCount } from "../preview/item-comment-count"
import { normalizeStatus } from "./reorder"
import { EyeOff, Eye, ChevronDown, ChevronRight } from "lucide-react"

export interface KanbanColumn {
  id: string
  label: string
}

// IDs follow task/v1 spec enum: open | in-progress | done | archived.
// `archived` is intentionally omitted from the default UI — it's a valid
// status, but boards stay readable with three columns. Apps that need
// different columns pass their own set via the `columns` prop;
// `feature.kanban.customColumns` is a separate capability flag, not a
// column source.
export const defaultColumns: KanbanColumn[] = [
  { id: "open", label: "To Do" },
  { id: "in-progress", label: "In Arbeit" },
  { id: "done", label: "Erledigt" },
]

export interface KanbanBoardProps {
  items: Item[]
  columns?: KanbanColumn[]
  /** Field whose non-empty string value determines a card's column. */
  statusField?: string
  /** Presentation-only board: cards cannot be dragged or dropped. */
  readOnly?: boolean
  users?: User[]
  onMoveItem?: (itemId: string, newStatus: string, position: number) => void
  onItemClick?: (item: Item) => void
  /** Id of the item currently open in the shared panel — its card is highlighted. */
  activeItemId?: string
  /** Colour for the active-item glow per item (usually its origin-group colour). */
  resolveItemGroupColor?: (item: Item) => string
  /** Optional header badge per card (e.g. a „Privat" marker), rendered next to
   *  the title in the card's `headerAdornment` slot. Return `null` for none. */
  renderCardAdornment?: (item: Item) => ReactNode
  /** Called when an item not belonging to this board is dropped onto it */
  onExternalDrop?: (itemId: string, newStatus: string, position: number) => void
}

interface DropTarget {
  columnId: string
  index: number
}

function getAssigneeIds(item: Item): string[] {
  return (item.relations ?? [])
    .filter((r: Relation) => r.predicate === "assignedTo")
    .map((r: Relation) => r.target.replace(/^global:/, ""))
}


interface KanbanCardProps {
  item: Item
  users?: User[]
  readOnly: boolean
  isDragged: boolean
  active?: boolean
  /** Optional header badge (e.g. „Privat") next to the card title. */
  headerAdornment?: ReactNode
  /** Colour of the active glow when this card's item is open in the panel. */
  glowColor?: string
  onDragStart?: (e: DragEvent, itemId: string) => void
  onDragEnd?: () => void
  onClick?: (item: Item) => void
}

function KanbanCard({ item, users, readOnly, isDragged, active, headerAdornment, glowColor, onDragStart, onDragEnd, onClick }: KanbanCardProps) {
  const assigneeIds = getAssigneeIds(item)
  const userMap = new Map((users ?? []).map((u) => [u.id, u]))
  const assignees = assigneeIds.map((id) => userMap.get(id)).filter((u): u is User => u != null)
  const commentCount = (item.data.commentCount as number | undefined) ?? 0
  const showFooter = assignees.length > 0 || commentCount > 0

  // Empty-title fallback: a freshly created task lands with `data.title = ""`
  // and the user only opens it to fill in. Without a placeholder the card
  // is visually blank. We don't mutate the upstream item — synthesize a
  // shadow item only when needed.
  const displayItem = useMemo<Item>(() => {
    const title = typeof item.data.title === "string" ? item.data.title : ""
    if (title.length > 0) return item
    return { ...item, data: { ...item.data, title: "Ohne Titel" } }
  }, [item])

  // Drag lives on the wrapper. ItemPreview owns the keyboard / click
  // semantics for opening the detail panel — wrapper handles drag,
  // ItemPreview handles `onClick`.
  return (
    <div
      data-item-id={item.id}
      {...(!readOnly ? {
        draggable: true,
        onDragStart: (e: DragEvent<HTMLDivElement>) => onDragStart?.(e, item.id),
        onDragEnd,
      } : {})}
      className={cn(
        !readOnly && "cursor-grab active:cursor-grabbing select-none",
        isDragged && "opacity-50"
      )}
    >
      <ItemPreview
        item={displayItem}
        author={null}
        density="compact"
        headerAdornment={headerAdornment}
        style={active && glowColor ? getActivePanelGlow(glowColor) : undefined}
        onClick={onClick ? () => onClick(item) : undefined}
        footerAdornment={
          showFooter ? (
            <>
              <ItemAssignees users={assignees} />
              {commentCount > 0 && (
                <div className="ml-auto">
                  <ItemCommentCount count={commentCount} />
                </div>
              )}
            </>
          ) : undefined
        }
      />
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

function itemColumnValue(item: Item, statusField: string, columns: readonly KanbanColumn[]): string | null {
  if (item.type === "relation") return null

  const value = item.data[statusField]
  if (statusField === "status") {
    const rawStatus = typeof value === "string" ? value : columns[0]?.id
    return rawStatus ? normalizeStatus(rawStatus) : null
  }

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function compareTextAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Stable, data-derived ordering used by presentation-only boards. */
export function sortReadOnlyKanbanItems(items: readonly Item[]): Item[] {
  return [...items].sort((a, b) => (
    compareTextAsc(a.createdAt, b.createdAt) ||
    compareTextAsc(typeof a.data.title === "string" ? a.data.title : "", typeof b.data.title === "string" ? b.data.title : "") ||
    compareTextAsc(a.id, b.id)
  ))
}

export function KanbanBoard({
  items,
  columns,
  statusField = "status",
  readOnly = false,
  users,
  onMoveItem,
  onItemClick,
  activeItemId,
  resolveItemGroupColor,
  renderCardAdornment,
  onExternalDrop,
}: KanbanBoardProps) {
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [floatingHoverColumn, setFloatingHoverColumn] = useState<string | null>(null)
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(new Set())
  const [collapsedColumnIds, setCollapsedColumnIds] = useState<Set<string>>(new Set())
  const [hiddenChipHoverColumn, setHiddenChipHoverColumn] = useState<string | null>(null)

  const resolvedColumns = useMemo(() => {
    if (columns) return columns
    if (statusField === "status") return defaultColumns

    const ids = new Set<string>()
    for (const item of items) {
      const value = itemColumnValue(item, statusField, [])
      if (value) ids.add(value)
    }
    return [...ids].sort(compareTextAsc).map((id) => ({ id, label: id }))
  }, [columns, items, statusField])

  const visibleColumns = useMemo(
    () => resolvedColumns.filter((col) => !hiddenColumnIds.has(col.id)),
    [resolvedColumns, hiddenColumnIds]
  )
  const hiddenColumns = useMemo(
    () => resolvedColumns.filter((col) => hiddenColumnIds.has(col.id)),
    [resolvedColumns, hiddenColumnIds]
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
    for (const col of resolvedColumns) {
      map.set(col.id, [])
    }
    for (const item of items) {
      const columnId = itemColumnValue(item, statusField, resolvedColumns)
      const list = columnId ? map.get(columnId) : undefined
      if (list) list.push(item)
    }
    for (const list of map.values()) {
      if (readOnly) {
        list.splice(0, list.length, ...sortReadOnlyKanbanItems(list))
      } else {
        list.sort((a, b) => ((a.data.order as number) ?? 0) - ((b.data.order as number) ?? 0))
      }
    }
    return map
  }, [items, readOnly, resolvedColumns, statusField])

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
      {!readOnly && hiddenColumns.length > 0 && (
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
        {resolvedColumns.map((column) => {
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
              {...(!readOnly ? {
                onDragOver: (e: DragEvent<HTMLDivElement>) => handleColumnDragOver(e, column.id, columnItems.length),
                onDragLeave: handleDragLeave,
                onDrop: (e: DragEvent<HTMLDivElement>) => handleDrop(e, column.id, columnItems.length),
              } : {})}
            >
              <CardHeader className={cn("px-3", isCollapsed ? "pb-0 @3xl:pb-1" : "pb-1")}>
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {/* Mobile: collapse toggle */}
                    {!readOnly && <button
                      type="button"
                      onClick={() => toggleCollapseColumn(column.id)}
                      className="@3xl:hidden p-0.5 rounded hover:bg-muted transition-colors"
                      aria-label={isCollapsed ? "Spalte ausklappen" : "Spalte einklappen"}
                    >
                      {isCollapsed
                        ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      }
                    </button>}
                    <span>{column.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      {columnItems.length}
                    </span>
                    {/* Desktop: hide button */}
                    {!readOnly && <button
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
                    </button>}
                  </div>
                </CardTitle>
              </CardHeader>
              {/* Mobile: hide content when collapsed. Desktop: always show (hidden columns aren't in grid). */}
              <CardContent className={cn(
                "space-y-0 min-h-[40px] @3xl:min-h-[60px] px-3 pb-1",
                isCollapsed && "hidden @3xl:block"
              )}>
                {!readOnly && <DropIndicator
                  visible={dropTarget?.columnId === column.id && dropTarget.index === 0}
                />}
                {columnItems.map((item, idx) => (
                  <div
                    key={item.id}
                    {...(!readOnly ? {
                      onDragOver: (e: DragEvent<HTMLDivElement>) => handleCardDragOver(e, column.id, idx),
                    } : {})}
                    className="py-1"
                  >
                    <KanbanCard
                      item={item}
                      users={users}
                      readOnly={readOnly}
                      isDragged={draggedItemId === item.id}
                      active={activeItemId === item.id}
                      headerAdornment={renderCardAdornment?.(item)}
                      glowColor={resolveItemGroupColor?.(item)}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onClick={onItemClick}
                    />
                    {!readOnly && <DropIndicator
                      visible={
                        dropTarget?.columnId === column.id && dropTarget.index === idx + 1
                      }
                    />}
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
      {!readOnly && draggedItemId !== null && (
        <div className="fixed bottom-20 left-4 right-4 z-40 animate-in slide-in-from-bottom-4 fade-in @3xl:hidden">
          <div className="flex flex-wrap gap-2 p-2 rounded-xl border bg-background/95 backdrop-blur shadow-lg">
            {resolvedColumns.filter((col) => col.id !== draggedItemColumnId).map((column) => (
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
