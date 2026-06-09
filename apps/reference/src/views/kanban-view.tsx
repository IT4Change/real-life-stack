import { useState, useMemo, useCallback, useEffect, type DragEvent } from "react"
import {
  Layers,
  LayoutList,
  ChevronDown,
  ChevronRight,
} from "lucide-react"

import {
  KanbanBoard,
  KanbanToolbar,
  applyItemListFilter,
  computeColumnReorder,
  ContentComposer,
  type ContentComposerSubmitData,
  type ContentTypeConfig,
  defaultColumns,
  AdaptivePanel,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  ItemDetailPanel,
  ReactionBar,
  useItems,
  useUpdateItem,
  useMembers,
  useCurrentUser,
  useCreateItem,
  useDeleteItem,
  useConnector,
  type ItemListFilter,
} from "@real-life-stack/toolkit"
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
          tags: (item.data.tags as string[]) ?? [],
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

export function KanbanView({ activeWorkspaceId, groups, selectedItemId, onItemSelect, onItemClose }: { activeWorkspaceId: string | null; groups: Group[]; selectedItemId?: string; onItemSelect?: (id: string) => void; onItemClose?: () => void }) {
  const connector = useConnector()
  // Kanban activates on data.status (task/v1). After the PR-1a status
  // migration only tasks carry this field, so no event/place leakage.
  const { data: tasks } = useItems({ hasField: ["status"] })
  const { data: members } = useMembers(activeWorkspaceId === "__overview__" ? null : (activeWorkspaceId ?? "group-1"))
  const { data: currentUser } = useCurrentUser()
  const { mutate: updateItem } = useUpdateItem()
  const { mutate: createItem } = useCreateItem()
  const { mutate: deleteItem } = useDeleteItem()
  const [filter, setFilter] = useState<ItemListFilter>({
    searchText: "",
    assignedTo: null,
    myItemsOnly: false,
    tags: [],
  })
  const [panelState, setPanelState] = useState<KanbanPanelState>({ mode: "closed" })
  const [panelPinned, setPanelPinned] = useState(false)

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

  const filteredTasks = useMemo(
    () => applyItemListFilter(tasks, filter, currentUser?.id),
    [tasks, filter, currentUser?.id]
  )

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const task of tasks) {
      const taskTags = task.data.tags as string[] | undefined
      if (taskTags) {
        for (const tag of taskTags) tagSet.add(tag)
      }
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

  const handleTaskCreate = useCallback(async () => {
    const newItem = await createItem({
      type: "task",
      createdBy: currentUser?.id ?? "user-1",
      data: { title: "", description: "", status: "open", order: tasks.length, tags: [] },
    })
    if (newItem) {
      setPanelState({ mode: "edit", item: newItem })
      onItemSelect?.(newItem.id)
    }
  }, [createItem, currentUser?.id, tasks.length, onItemSelect])

  const handleCreateItem = useCallback(() => {
    handleTaskCreate()
  }, [handleTaskCreate])

  const handleTaskEdit = useCallback(async (submitData: ContentComposerSubmitData) => {
    if (panelState.mode !== "edit") return
    const item = panelState.item
    const { data } = submitData
    const relations: Relation[] = (data.people ?? [])
      .map((id) => ({ predicate: "assignedTo", target: `global:${id}` }))
    try {
      await updateItem(item.id, {
        data: { ...item.data, title: data.title, description: data.text, status: data.status, tags: data.tags },
        relations,
      })
    } catch (err) {
      console.error("[KanbanView] updateItem failed:", err)
    }
    // Move item to different group if changed
    if (data.group && hasItemGroups(connector)) {
      const currentGroupId = connector.getItemGroupId(item.id)
      if (currentGroupId && currentGroupId !== data.group) {
        connector.moveItemToGroup(item.id, data.group)
      }
    }
  }, [panelState, updateItem, connector])

  const handleTaskDelete = useCallback(() => {
    if (panelState.mode !== "edit") return
    deleteItem(panelState.item.id)
    setPanelState({ mode: "closed" })
  }, [panelState, deleteItem])

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

  return (
    <div className="space-y-4">
      <KanbanToolbar
        items={tasks}
        users={members}
        currentUserId={currentUser?.id}
        onFilterChange={setFilter}
        onCreateItem={handleCreateItem}
        onEditColumns={() => console.log("Edit columns")}
        extraActions={viewModeToggle}
      />

      {isAggregate && groupedView && tasksByGroup ? (
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
        />
      )}
      <AdaptivePanel
        open={panelState.mode !== "closed"}
        onClose={handleForceClosePanel}
        allowedModes={["modal", "sidebar", "drawer"]}
        sidebarWidth="420px"
        sidebarMinWidth="300px"
        pinned={panelPinned}
        onPinnedChange={setPanelPinned}
      >
        {panelState.mode === "edit" && (
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
        )}
      </AdaptivePanel>
    </div>
  )
}
