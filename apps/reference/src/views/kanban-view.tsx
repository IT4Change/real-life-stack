import { useState, useMemo, useCallback, type DragEvent } from "react"
import {
  Layers,
  LayoutList,
  ChevronDown,
  ChevronRight,
} from "lucide-react"

import {
  KanbanBoard,
  computeColumnReorder,
  useModulePanel,
  ModuleSettingsPlaceholder,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  ItemPreview,
  ItemAssignees,
  ItemTypeBadge,
  ItemScopeBadge,
  ReactionBar,
  CreateFab,
  Skeleton,
  ItemPreviewSkeleton,
  FilterBar,
  FilterSection,
  FilterToggle,
  FilterMultiSelect,
  emptyFilterBarValue,
  useFilterableItems,
  type FilterBarValue,
  useItemsWithDraft,
  useUpdateItem,
  useMembers,
  useCurrentUser,
  useConnector,
  useItemGroupColorResolver,
  usePersonalGroupId,
} from "@real-life-stack/toolkit"
import { Input } from "@real-life-stack/toolkit"
import { Search, Settings } from "lucide-react"
import type { Item, User, Group } from "@real-life-stack/data-interface"
import { hasItemGroups } from "@real-life-stack/data-interface"
import { useItemFocus } from "../hooks/use-item-focus"
import { useCreate, useRegisterCreate, type CreateConfig } from "../create-host"
import { useRegisterDetail, type DetailConfig } from "../detail-host"
import { useItemDetailEdit } from "../hooks/use-item-detail-edit"
import { withGroupOptions, mapComposerSubmission } from "../composer-mapping"
import { KANBAN_CREATE_TYPES } from "../content-types"

interface KanbanViewProps {
  activeWorkspaceId: string | null
  groups: Group[]
}

/**
 * The mutation half of Kanban's drag handler.  Keeping it at module scope
 * makes the user-visible drag path directly contract-testable.
 */
export function handleKanbanDrag(
  tasks: Item[],
  itemId: string,
  newStatus: string,
  position: number,
  updateItem: (id: string, updates: { data: Record<string, unknown> }) => unknown,
): void {
  const item = tasks.find((task) => task.id === itemId)
  if (!item) return
  for (const update of computeColumnReorder(tasks, item, newStatus, position)) {
    void updateItem(update.id, { data: update.data })
  }
}

export function KanbanView(props: KanbanViewProps) {
  // Renders into the app-level shared panel (one host for all modules);
  // pin + mode config lives on that provider (App.tsx).
  return <KanbanViewInner {...props} />
}

function KanbanViewInner({ activeWorkspaceId, groups }: KanbanViewProps) {
  const connector = useConnector()
  // Active-item glow uses the colour of each card's origin group.
  const resolveItemGroupColor = useItemGroupColorResolver(
    activeWorkspaceId === "__overview__" ? undefined : (activeWorkspaceId ?? undefined),
  )
  // Personal space → „Privat" option in the picker.
  const personalGroupId = usePersonalGroupId()
  // Scope tag on the card (Privat OR group), only in the meta group („Mein
  // Netzwerk") — in a concrete space the scope is clear, so no tag. Same
  // ItemScopeBadge as the detail + the other modules (private and group items
  // are now treated consistently, not just the private ones).
  const renderTaskAdornment = useCallback(
    (item: Item) =>
      activeWorkspaceId === "__overview__" ? <ItemScopeBadge item={item} /> : null,
    [activeWorkspaceId],
  )
  // Kanban activates on data.status (task/v1). After the PR-1a status
  // migration only tasks carry this field, so no event/place leakage.
  const { data: tasks, isLoading: tasksLoading } = useItemsWithDraft({ hasField: ["status"] })
  const { data: members } = useMembers(activeWorkspaceId === "__overview__" ? null : (activeWorkspaceId ?? "group-1"))
  const { data: currentUser } = useCurrentUser()
  const { mutate: updateItem } = useUpdateItem()
  // Shared filter state for the top-of-board FilterBar (tags) plus
  // kanban-specific extras (myItemsOnly + assignedTo + searchText).
  // searchText stays a free text input in the trailing actions —
  // FilterBar's controlled value covers the structured filters.
  const [filterBarValue, setFilterBarValue] = useState<FilterBarValue>(emptyFilterBarValue)
  const [myItemsOnly, setMyItemsOnly] = useState(false)
  const [assignedTo, setAssignedTo] = useState<string[]>([])
  const [searchText, setSearchText] = useState("")
  const modulePanel = useModulePanel()
  // The shared host owns the detail (read↔edit) for the focused item; a card
  // click just points the URL focus at it (like the other modules). The host
  // opens/closes the panel and runs the group-move on save.
  const { focusItem } = useItemFocus()
  const { startCreate } = useCreate()
  // Edit + create share the same composer wiring (geocoder, map-pick, people) —
  // reuse the one the edit config already built (don't recompute it).
  const editConfig = useItemDetailEdit(members)
  const composerProps = editConfig.composerProps
  const [groupedView, setGroupedView] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)

  // FilterBar covers tag (and type) — types is empty for the Kanban
  // case since the board only renders status-bearing tasks.
  const filteredByBar = useFilterableItems(tasks, filterBarValue)

  // Apply the kanban-specific extras on top: text search across title
  // / description, assignee filter via relations, "nur meine" toggle.
  const filteredTasks = useMemo(() => {
    const needle = searchText.trim().toLowerCase()
    const assigneeSet = new Set(assignedTo)
    return filteredByBar.filter((task) => {
      if (needle) {
        const haystack = [task.data.title, task.data.description, task.data.content]
          .map((v) => String(v ?? "").toLowerCase())
          .join(" ")
        if (!haystack.includes(needle)) return false
      }
      const relations = task.relations ?? []
      const taskAssignees = relations
        .filter((r) => r.predicate === "assignedTo")
        .map((r) => r.target.replace(/^global:/, ""))
      if (assigneeSet.size > 0) {
        if (!taskAssignees.some((id) => assigneeSet.has(id))) return false
      }
      // Fail-closed: while the toggle is on but currentUser hasn't
      // resolved yet, show nothing rather than leaking every task.
      if (myItemsOnly) {
        if (!currentUser?.id) return false
        if (!taskAssignees.includes(currentUser.id)) return false
      }
      return true
    })
  }, [filteredByBar, searchText, assignedTo, myItemsOnly, currentUser?.id])

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const task of tasks) {
      for (const tag of task.tags ?? []) tagSet.add(tag)
    }
    return Array.from(tagSet)
  }, [tasks])

  const handleMoveItem = (itemId: string, newStatus: string, position: number) => {
    handleKanbanDrag(tasks, itemId, newStatus, position, updateItem)
  }

  // A card click points the URL focus at the task; the host opens its detail.
  const handleItemClick = useCallback((item: Item) => {
    focusItem(item.id)
  }, [focusItem])

  // Determine if the active workspace is the overview view
  const isAggregate = activeWorkspaceId === "__overview__"
  const currentSpace = isAggregate ? undefined : (activeWorkspaceId ?? undefined)

  // All groups are concrete — no aggregate/overview group in the list anymore
  const concreteGroups = groups

  // Create offers the task type; the detail edit uses the full registry (shared
  // hook), so a task is editable with its own fields wherever it's opened.
  const kanbanCreateTypes = useMemo(
    () => withGroupOptions(KANBAN_CREATE_TYPES, groups, currentSpace, personalGroupId),
    [groups, currentSpace, personalGroupId],
  )

  const resolveAuthor = useCallback(
    (createdBy: string): User | undefined => {
      const member = members.find((m) => m.id === createdBy)
      if (member) return member
      if (currentUser?.id === createdBy) return currentUser
      return undefined
    },
    [members, currentUser],
  )

  // Register the task detail with the host (read↔edit for the focused task).
  // The read view mirrors the card (assignees), the edit side is the shared,
  // type-driven config + the board's tag suggestions.
  const detailConfig = useMemo<DetailConfig>(
    () => ({
      renderRead: (current, actions) => {
        const assignees = (current.relations ?? [])
          .filter((r) => r.predicate === "assignedTo")
          .map((r) => members.find((m) => m.id === r.target.replace(/^global:/, "")))
          .filter((u): u is User => !!u)
        return (
          <ItemPreview
            item={current}
            author={resolveAuthor(current.createdBy)}
            headerAdornment={
              <>
                <ItemTypeBadge type={current.type} />
                {isAggregate && <ItemScopeBadge item={current} />}
              </>
            }
            actions={actions}
            footerAdornment={assignees.length > 0 ? <ItemAssignees users={assignees} /> : undefined}
          />
        )
      },
      ...editConfig,
      composerProps: {
        ...editConfig.composerProps,
        tagSuggestions: availableTags,
        tagQuickSuggestions: availableTags.slice(0, 10),
      },
      renderCommentReactions: (commentId) => <ReactionBar itemId={commentId} />,
      onShare: () => {
        void navigator.clipboard?.writeText(window.location.href)
      },
    }),
    [resolveAuthor, members, isAggregate, editConfig, availableTags],
  )
  useRegisterDetail("kanban", detailConfig)

  // Register the task create form with the host (sheet shell). "+" then just
  // points the URL at `?compose=task` (prefilled with status "open").
  const createConfig = useMemo<CreateConfig>(
    () => ({
      contentTypes: kanbanCreateTypes,
      mapper: mapComposerSubmission,
      shell: "sheet",
      composerProps: {
        ...composerProps,
        tagSuggestions: availableTags,
        tagQuickSuggestions: availableTags.slice(0, 10),
      },
    }),
    [kanbanCreateTypes, composerProps, availableTags],
  )
  useRegisterCreate("kanban", createConfig)

  const handleCreateItem = useCallback(
    () => startCreate("task", { status: "open" }),
    [startCreate],
  )

  // Group tasks by their group for the grouped view
  const tasksByGroup = useMemo(() => {
    if (!isAggregate || !groupedView || !hasItemGroups(connector)) return null
    const map = new Map<string, Item[]>()
    for (const g of concreteGroups) {
      map.set(g.id, [])
    }
    // Collect items without a group under a special key
    map.set("__ungrouped__", [])
    for (const task of filteredTasks) {
      const gid = connector.getItemGroupId(task.id)
      if (gid && map.has(gid)) {
        map.get(gid)!.push(task)
      } else {
        map.get("__ungrouped__")!.push(task)
      }
    }
    return map
  }, [isAggregate, groupedView, connector, concreteGroups, filteredTasks])

  const toggleGroupCollapse = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }, [])

  const viewModeToggle = isAggregate ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          {groupedView ? <LayoutList className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuCheckboxItem
          checked={!groupedView}
          onCheckedChange={() => setGroupedView(false)}
        >
          Zusammengeführt
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={groupedView}
          onCheckedChange={() => setGroupedView(true)}
        >
          Nach Gruppe
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : undefined

  const moveToGroup = useCallback((itemId: string, targetGroupId: string) => {
    if (!hasItemGroups(connector)) return
    const currentGroupId = connector.getItemGroupId(itemId)
    if (currentGroupId !== targetGroupId) {
      connector.moveItemToGroup(itemId, targetGroupId)
    }
  }, [connector])

  const handleGroupDrop = useCallback((e: DragEvent<HTMLDivElement>, targetGroupId: string) => {
    e.preventDefault()
    const itemId = e.dataTransfer.getData("text/plain")
    if (!itemId) return
    moveToGroup(itemId, targetGroupId)
  }, [moveToGroup])

  // Stable map of group-specific external drop handlers (avoids new closures per render)
  const externalDropHandlers = useMemo(() => {
    if (!tasksByGroup) return new Map<string, (itemId: string, newStatus: string, position: number) => void>()
    const map = new Map<string, (itemId: string, newStatus: string, position: number) => void>()
    for (const g of concreteGroups) {
      map.set(g.id, (itemId: string, newStatus: string, position: number) => {
        const item = tasks.find((t) => t.id === itemId)
        if (!item) return

        // Move to target group first
        moveToGroup(itemId, g.id)

        // Recalculate positions scoped to the TARGET GROUP's items in the
        // target column. The dragged item comes from another group, so it
        // is not part of that pool — computeColumnReorder takes it
        // explicitly.
        const groupItems = tasksByGroup.get(g.id) ?? []
        for (const update of computeColumnReorder(groupItems, item, newStatus, position)) {
          updateItem(update.id, { data: update.data })
        }
      })
    }
    return map
  }, [concreteGroups, moveToGroup, tasks, tasksByGroup, updateItem])

  const memberOptions = useMemo(
    () => members.map((m) => ({ id: m.id, label: m.displayName ?? m.id })),
    [members],
  )

  return (
    <div className="space-y-4">
      <FilterBar
        value={filterBarValue}
        onChange={setFilterBarValue}
        availableTags={availableTags}
        drawerExtra={
          <>
            <FilterSection label="Schnellfilter">
              <FilterToggle
                label="Nur meine Aufgaben"
                value={myItemsOnly}
                onChange={setMyItemsOnly}
              />
            </FilterSection>
            {memberOptions.length > 0 && (
              <FilterSection label="Zuweisung">
                <FilterMultiSelect
                  options={memberOptions}
                  value={assignedTo}
                  onChange={setAssignedTo}
                />
              </FilterSection>
            )}
          </>
        }
        chipsExtra={
          <>
            {myItemsOnly && (
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 pl-2 pr-1 py-0.5 text-xs font-medium">
                Nur meine
                <button
                  type="button"
                  onClick={() => setMyItemsOnly(false)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  aria-label="Filter entfernen"
                >
                  ×
                </button>
              </span>
            )}
          </>
        }
        leadingActions={
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Suche…"
              aria-label="Aufgaben durchsuchen"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 w-full pl-7 text-xs sm:w-40"
            />
          </div>
        }
        trailingActions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                modulePanel.open({
                  kind: "settings",
                  content: (
                    <ModuleSettingsPlaceholder
                      moduleLabel="Kanban"
                      plannedItems={["Spalten bearbeiten", "Standard-Gruppierung", "Sichtbarkeit der Spalten"]}
                    />
                  ),
                })
              }
              title="Moduleinstellungen"
            >
              <Settings className="h-4 w-4" />
            </Button>
            {viewModeToggle}
          </>
        }
      />

      {tasksLoading ? (
        // Loading: a board-shaped skeleton (columns with placeholder cards).
        // The empty board (loaded, no tasks) intentionally stays as-is — the
        // columns themselves communicate "nothing here yet, drop/create".
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-hidden>
          {[3, 2, 2].map((cards, c) => (
            <div key={c} className="space-y-3">
              <Skeleton className="h-5 w-24" />
              {Array.from({ length: cards }).map((_, i) => (
                <ItemPreviewSkeleton key={i} />
              ))}
            </div>
          ))}
        </div>
      ) : isAggregate && groupedView && tasksByGroup ? (
        <div className="space-y-6">
          {concreteGroups.map((group) => {
            const groupTasks = tasksByGroup.get(group.id) ?? []
            if (groupTasks.length === 0 && dragOverGroupId !== group.id) return null
            const isCollapsed = collapsedGroups.has(group.id)
            const isDragOver = dragOverGroupId === group.id
            return (
              <div key={group.id}>
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = "move"
                    setDragOverGroupId(group.id)
                  }}
                  onDragLeave={(e) => {
                    const related = e.relatedTarget as Node | null
                    if (related && e.currentTarget.contains(related)) return
                    setDragOverGroupId((prev) => prev === group.id ? null : prev)
                  }}
                  onDrop={(e) => {
                    setDragOverGroupId(null)
                    handleGroupDrop(e, group.id)
                  }}
                  className={`flex items-center gap-2 mb-3 px-2 py-1 -mx-2 rounded-lg transition-colors${isDragOver ? " bg-primary/10 ring-2 ring-primary/30" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapse(group.id)}
                    className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                  >
                    {isCollapsed
                      ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    }
                    {group.name}
                    <span className="text-xs font-normal text-muted-foreground">({groupTasks.length})</span>
                  </button>
                </div>
                {!isCollapsed && (
                  <KanbanBoard
                    items={groupTasks}
                    users={members}
                    onMoveItem={handleMoveItem}
                    onItemClick={handleItemClick}
                    activeItemId={modulePanel.current?.itemId}
                    resolveItemGroupColor={resolveItemGroupColor}
                    renderCardAdornment={renderTaskAdornment}
                    onExternalDrop={externalDropHandlers.get(group.id)}
                  />
                )}
              </div>
            )
          })}
          {(tasksByGroup.get("__ungrouped__") ?? []).length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => toggleGroupCollapse("__ungrouped__")}
                className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                {collapsedGroups.has("__ungrouped__")
                  ? <ChevronRight className="h-4 w-4" />
                  : <ChevronDown className="h-4 w-4" />
                }
                Ohne Gruppe
                <span className="text-xs font-normal">({tasksByGroup.get("__ungrouped__")!.length})</span>
              </button>
              {!collapsedGroups.has("__ungrouped__") && (
                <KanbanBoard
                  items={tasksByGroup.get("__ungrouped__")!}
                  users={members}
                  onMoveItem={handleMoveItem}
                  onItemClick={handleItemClick}
                  activeItemId={modulePanel.current?.itemId}
                  resolveItemGroupColor={resolveItemGroupColor}
                  renderCardAdornment={renderTaskAdornment}
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <KanbanBoard
          items={filteredTasks}
          users={members}
          onMoveItem={handleMoveItem}
          onItemClick={handleItemClick}
          activeItemId={modulePanel.current?.itemId}
          resolveItemGroupColor={resolveItemGroupColor}
          renderCardAdornment={renderTaskAdornment}
        />
      )}

      <CreateFab onClick={handleCreateItem} label="Aufgabe erstellen" />
    </div>
  )
}
