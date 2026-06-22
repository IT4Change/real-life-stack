import { useState, useMemo, useCallback, useEffect, useRef, type DragEvent } from "react"
import {
  Layers,
  LayoutList,
  ChevronDown,
  ChevronRight,
} from "lucide-react"

import {
  KanbanBoard,
  computeColumnReorder,
  ContentComposer,
  type ContentComposerSubmitData,
  type ContentTypeConfig,
  defaultColumns,
  useModulePanel,
  ModuleSettingsPlaceholder,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  ItemDetailPanel,
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
  useItems,
  useUpdateItem,
  useMembers,
  useCurrentUser,
  useConnector,
  useItemEditor,
  useItemGroupColorResolver,
  type ItemEditorMapper,
} from "@real-life-stack/toolkit"
import { Input } from "@real-life-stack/toolkit"
import { Search, Settings } from "lucide-react"
import type { Item, User, Relation, Group, DataInterface } from "@real-life-stack/data-interface"
import { hasItemGroups } from "@real-life-stack/data-interface"

function TaskEditPanel({ item, taskContentType, onSubmit, onDelete, connector, activeWorkspaceId, members, availableTags }: {
  item: Item
  taskContentType: ContentTypeConfig
  onSubmit: (data: ContentComposerSubmitData) => void
  onDelete: () => void
  connector: DataInterface
  activeWorkspaceId: string | null
  members: User[]
  availableTags: string[]
}) {
  return (
    <ItemDetailPanel
      itemId={item.id}
      renderCommentReactions={(commentId) => <ReactionBar itemId={commentId} />}
    >
      <ContentComposer
        key={item.id}
        className="p-4"
        contentTypes={[taskContentType]}
        mode="task"
        liveUpdate
        editMode
        onSubmit={onSubmit}
        onDelete={onDelete}
        showVisibility={false}
        showPreview={false}
        initialData={{
          title: String(item.data.title ?? ""),
          text: String(item.data.description ?? ""),
          status: String(item.data.status ?? "open"),
          tags: item.tags ?? [],
          people: (item.relations ?? [])
            .filter((r: Relation) => r.predicate === "assignedTo")
            .map((r: Relation) => r.target.replace(/^global:/, "")),
          group: (hasItemGroups(connector)
            ? connector.getItemGroupId(item.id)
            : null) ?? activeWorkspaceId ?? undefined,
        }}
        peopleOptions={members.map((m) => ({ id: m.id, name: m.displayName ?? m.id }))}
        tagSuggestions={availableTags}
        tagQuickSuggestions={availableTags.slice(0, 10)}
        peopleQuickSuggestions={members.slice(0, 10).map((m) => ({ id: m.id, name: m.displayName ?? m.id }))}
      />
    </ItemDetailPanel>
  )
}

type KanbanPanelState =
  | { mode: "closed" }
  | { mode: "edit"; item: Item }

interface KanbanViewProps {
  activeWorkspaceId: string | null
  groups: Group[]
  selectedItemId?: string
  onItemSelect?: (id: string) => void
  onItemClose?: () => void
}

export function KanbanView(props: KanbanViewProps) {
  // Renders into the app-level shared panel (one host for all modules);
  // pin + mode config now lives on that provider (App.tsx).
  return <KanbanViewInner {...props} />
}

function KanbanViewInner({ activeWorkspaceId, groups, selectedItemId, onItemSelect, onItemClose }: KanbanViewProps) {
  const connector = useConnector()
  // Active-item glow uses the colour of each card's origin group.
  const resolveItemGroupColor = useItemGroupColorResolver(
    activeWorkspaceId === "__overview__" ? undefined : (activeWorkspaceId ?? undefined),
  )
  // Kanban activates on data.status (task/v1). After the PR-1a status
  // migration only tasks carry this field, so no event/place leakage.
  const { data: tasks, isLoading: tasksLoading } = useItems({ hasField: ["status"] })
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
  const [panelState, setPanelState] = useState<KanbanPanelState>({ mode: "closed" })
  const modulePanel = useModulePanel()

  // Open item panel from URL deep-link
  useEffect(() => {
    if (selectedItemId && tasks.length > 0) {
      const item = tasks.find((t) => t.id === selectedItemId)
      if (item) {
        setPanelState({ mode: "edit", item })
      }
    } else if (!selectedItemId && panelState.mode === "edit") {
      setPanelState({ mode: "closed" })
    }
  }, [selectedItemId, tasks.length]) // eslint-disable-line react-hooks/exhaustive-deps
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
    const item = tasks.find((t) => t.id === itemId)
    if (!item) return
    for (const update of computeColumnReorder(tasks, item, newStatus, position)) {
      updateItem(update.id, { data: update.data })
    }
  }

  const handleItemClick = useCallback((item: Item) => {
    setPanelState({ mode: "edit", item })
    onItemSelect?.(item.id)
  }, [onItemSelect])

  // Explicit close — always closes, ignoring pinned state (used by X button / drawer drag)
  const handleForceClosePanel = useCallback(() => {
    setPanelState({ mode: "closed" })
    onItemClose?.()
  }, [onItemClose])

  // Determine if the active workspace is the overview view
  const isAggregate = activeWorkspaceId === "__overview__"

  // All groups are concrete — no aggregate/overview group in the list anymore
  const concreteGroups = groups

  const taskContentType: ContentTypeConfig = useMemo(() => ({
    id: "task",
    label: "Task",
    defaultWidgets: ["title", "text", "status", "people", "tags"],
    widgetLabels: { text: "Beschreibung", people: "Zugewiesen" },
    statusOptions: defaultColumns.map((col) => ({
      id: col.id,
      label: col.label,
    })),
    defaultStatus: "open",
    groupOptions: concreteGroups.map((g) => ({ id: g.id, name: g.name })),
    groupRequired: true,
  }), [concreteGroups])

  // Bridge local panelState ↔ shared ModulePanel. Whenever the
  // task-edit state changes, push the TaskEditPanel into the shared
  // panel; on close, clear it. The shared panel's X / drawer-drag /
  // backdrop-click flows through `onClose` back into `handleForceClose`.
  // Tracks whether WE opened the shared panel, so we never close a detail
  // another module left open when kanban (re)mounts — the panel now persists
  // across module switches.
  const panelOwnedRef = useRef(false)
  useEffect(() => {
    if (panelState.mode === "edit") {
      panelOwnedRef.current = true
      modulePanel.open({
        kind: "detail",
        itemId: panelState.item.id,
        content: (
          <TaskEditPanel
            item={panelState.item}
            taskContentType={taskContentType}
            onSubmit={handleTaskEdit}
            onDelete={handleTaskDelete}
            connector={connector}
            activeWorkspaceId={activeWorkspaceId}
            members={members}
            availableTags={availableTags}
          />
        ),
        onClose: handleForceClosePanel,
      })
    } else if (panelOwnedRef.current) {
      panelOwnedRef.current = false
      modulePanel.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelState, taskContentType, members, availableTags, activeWorkspaceId])

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

  // Kanban-specific composer mapping. The same mapper covers both create
  // and edit; the `existingItem === null` branch supplies the defaults
  // a freshly-created task carries (status "open", order at end of
  // column). Field mapping otherwise: composer `text` →
  // item.data.description; composer-state `people` → assignedTo
  // relations. Tags are top-level on the item (spec 07-tags.md), so we
  // strip any legacy data.tags from the previous item before writing.
  const mapTaskSubmission = useCallback<ItemEditorMapper>((submission, { existingItem }) => {
    const { data } = submission
    const relations: Relation[] = (data.people ?? [])
      .map((id: string) => ({ predicate: "assignedTo", target: `global:${id}` }))
    const baseData = existingItem?.data ?? {}
    const { tags: _legacy, ...dataWithoutLegacyTags } = baseData as Record<string, unknown>
    const nextData: Record<string, unknown> = existingItem
      ? {
          ...dataWithoutLegacyTags,
          title: data.title,
          description: data.text,
          status: data.status,
        }
      : {
          title: data.title ?? "",
          description: data.text ?? "",
          status: data.status ?? "open",
          order: tasks.length,
        }
    const nextTags = Array.isArray(data.tags) ? data.tags : existingItem?.tags
    return {
      type: existingItem?.type ?? submission.contentType,
      data: nextData,
      ...(nextTags !== undefined ? { tags: nextTags } : {}),
      relations,
    }
  }, [tasks.length])

  const editor = useItemEditor({
    currentUserId: currentUser?.id,
    mapSubmission: mapTaskSubmission,
    onCreated: (item) => {
      setPanelState({ mode: "edit", item })
      onItemSelect?.(item.id)
    },
    onDeleted: () => setPanelState({ mode: "closed" }),
  })

  const handleTaskCreate = useCallback(() => {
    // Kanban has no create-modal — the "+" button creates an empty task
    // and opens the detail panel in edit mode. We feed an empty
    // composer submission so the mapper's create-branch fills in the
    // defaults (status "open", order: tasks.length).
    editor.submit({
      contentType: "task",
      isPublic: false,
      data: {},
    })
  }, [editor])

  const handleCreateItem = useCallback(() => {
    handleTaskCreate()
  }, [handleTaskCreate])

  const handleTaskEdit = useCallback(async (submitData: ContentComposerSubmitData) => {
    if (panelState.mode !== "edit") return
    const item = panelState.item
    const updated = await editor.submit(submitData, { existingItem: item })
    if (!updated) {
      // submit returned null: either the mapper aborted or the connector
      // rejected the update. The hook has surfaced the error via
      // editor.error; don't run the group-move side-effect on a write
      // that didn't land.
      console.warn("[KanbanView] task edit submit returned null — skipping group-move side-effect")
      return
    }
    const data = submitData.data
    if (data.group && hasItemGroups(connector)) {
      const currentGroupId = connector.getItemGroupId(item.id)
      if (currentGroupId && currentGroupId !== data.group) {
        connector.moveItemToGroup(item.id, data.group)
      }
    }
  }, [panelState, editor, connector])

  const handleTaskDelete = useCallback(() => {
    if (panelState.mode !== "edit") return
    editor.remove(panelState.item.id)
  }, [panelState, editor])

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
        />
      )}

      <CreateFab onClick={handleCreateItem} label="Aufgabe erstellen" />
    </div>
  )
}
