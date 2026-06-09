import { useState, useMemo } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Item, User } from "@real-life-stack/data-interface"
import { KanbanToolbar, applyItemListFilter, type ItemListFilter } from "./kanban-toolbar"
import { KanbanBoard } from "./kanban-board"

const users: User[] = [
  { id: "user-1", displayName: "Max Mustermann", avatarUrl: "https://randomuser.me/api/portraits/men/32.jpg" },
  { id: "user-2", displayName: "Anna Schmidt", avatarUrl: "https://randomuser.me/api/portraits/women/44.jpg" },
  { id: "user-3", displayName: "Thomas Müller", avatarUrl: "https://randomuser.me/api/portraits/men/67.jpg" },
]

const tasks: Item[] = [
  {
    id: "task-1",
    type: "task",
    createdAt: new Date().toISOString(),
    createdBy: "user-1",
    data: { title: "Beete vorbereiten", description: "Erde umgraben und Kompost einarbeiten", status: "open", order: 0, tags: ["garten"] },
    relations: [{ predicate: "assignedTo", target: "global:user-2" }],
  },
  {
    id: "task-2",
    type: "task",
    createdAt: new Date().toISOString(),
    createdBy: "user-2",
    data: { title: "Samen bestellen", description: "Tomaten, Zucchini, Kräuter", status: "in-progress", order: 0, tags: ["garten", "einkauf"] },
    relations: [{ predicate: "assignedTo", target: "global:user-2" }],
  },
  {
    id: "task-3",
    type: "task",
    createdAt: new Date().toISOString(),
    createdBy: "user-1",
    data: { title: "Wasserschlauch reparieren", description: "Leck am Verbindungsstück abdichten", status: "done", order: 0, tags: ["infrastruktur"] },
    relations: [{ predicate: "assignedTo", target: "global:user-3" }],
  },
  {
    id: "task-4",
    type: "task",
    createdAt: new Date().toISOString(),
    createdBy: "user-3",
    data: { title: "Gartenplan zeichnen", description: "Welches Beet bekommt welche Pflanzen?", status: "open", order: 1, tags: ["planung"] },
  },
  {
    id: "task-5",
    type: "task",
    createdAt: new Date().toISOString(),
    createdBy: "user-1",
    data: { title: "Kompost umsetzen", description: "Der Kompost muss umgesetzt und belüftet werden", status: "in-progress", order: 1, tags: ["garten"] },
    relations: [{ predicate: "assignedTo", target: "global:user-1" }],
  },
]

const meta: Meta<typeof KanbanToolbar> = {
  title: "RLS/Space Modules/Kanban/Toolbar",
  component: KanbanToolbar,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
}

export default meta
type Story = StoryObj<typeof KanbanToolbar>

export const Default: Story = {
  args: {
    items: tasks,
    users,
    onCreateItem: () => console.log("Create item"),
    onEditColumns: () => console.log("Edit columns"),
    onFilterChange: (filter) => console.log("Filter:", filter),
  },
}

export const WithCurrentUser: Story = {
  args: {
    items: tasks,
    users,
    currentUserId: "user-1",
    onCreateItem: () => console.log("Create item"),
    onMultiSelectChange: (enabled) => console.log("Multi-select:", enabled),
    onEditColumns: () => console.log("Edit columns"),
    onFilterChange: (filter) => console.log("Filter:", filter),
  },
}

export const ToolbarWithBoard: Story = {
  render: () => {
    const [filter, setFilter] = useState<ItemListFilter>({
      searchText: "",
      assignedTo: null,
      myItemsOnly: false,
      tags: [],
    })
    const [items, setItems] = useState(tasks)

    const filteredItems = useMemo(
      () => applyItemListFilter(items, filter, "user-1"),
      [items, filter]
    )

    const handleMoveItem = (itemId: string, newStatus: string, position: number) => {
      setItems((prev) => {
        const item = prev.find((t) => t.id === itemId)
        if (!item) return prev

        const columnItems = prev
          .filter((t) => (t.data.status as string) === newStatus && t.id !== itemId)
          .sort((a, b) => ((a.data.order as number) ?? 0) - ((b.data.order as number) ?? 0))

        const movedItem = { ...item, data: { ...item.data, status: newStatus } }
        columnItems.splice(position, 0, movedItem)

        const updated = columnItems.map((t, i) => ({
          ...t,
          data: { ...t.data, order: i },
        }))

        const otherItems = prev.filter(
          (t) => (t.data.status as string) !== newStatus && t.id !== itemId
        )
        return [...otherItems, ...updated]
      })
    }

    return (
      <div className="space-y-4">
        <KanbanToolbar
          items={items}
          users={users}
          currentUserId="user-1"
          onFilterChange={setFilter}
          onCreateItem={() => {
            const id = `task-${Date.now()}`
            setItems((prev) => [
              ...prev,
              {
                id,
                type: "task",
                createdAt: new Date().toISOString(),
                createdBy: "user-1",
                data: { title: "Neuer Task", status: "open", order: prev.length, tags: [] },
              },
            ])
          }}
          onMultiSelectChange={(enabled) => console.log("Multi-select:", enabled)}
          onEditColumns={() => console.log("Edit columns")}
        />
        <KanbanBoard
          items={filteredItems}
          users={users}
          onMoveItem={handleMoveItem}
          onItemClick={(item) => console.log("Clicked:", item.id)}
        />
      </div>
    )
  },
}
