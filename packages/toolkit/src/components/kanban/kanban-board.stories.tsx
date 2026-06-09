import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Item, User } from "@real-life-stack/data-interface"
import { KanbanBoard, defaultColumns } from "./kanban-board"

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
    data: { title: "Beete vorbereiten", description: "Erde umgraben und Kompost einarbeiten", status: "todo", order: 0, tags: ["garten"] },
    relations: [{ predicate: "assignedTo", target: "global:user-2" }],
  },
  {
    id: "task-2",
    type: "task",
    createdAt: new Date().toISOString(),
    createdBy: "user-2",
    data: { title: "Samen bestellen", description: "Tomaten, Zucchini, Kräuter", status: "doing", order: 0, tags: ["garten", "einkauf"] },
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
    data: { title: "Gartenplan zeichnen", description: "Welches Beet bekommt welche Pflanzen?", status: "todo", order: 1, tags: ["planung"] },
  },
  {
    id: "task-5",
    type: "task",
    createdAt: new Date().toISOString(),
    createdBy: "user-1",
    data: { title: "Kompost umsetzen", description: "Der Kompost muss umgesetzt und belüftet werden", status: "doing", order: 1, tags: ["garten"] },
    relations: [{ predicate: "assignedTo", target: "global:user-1" }],
  },
]

const meta: Meta<typeof KanbanBoard> = {
  title: "RLS/Space Modules/Kanban/Board",
  component: KanbanBoard,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
}

export default meta
type Story = StoryObj<typeof KanbanBoard>

export const Default: Story = {
  args: {
    items: tasks,
    users,
    onMoveItem: (itemId, newStatus, position) => console.log("Move:", itemId, "→", newStatus, "at", position),
    onItemClick: (item) => console.log("Clicked:", item.id),
  },
}

export const Interactive: Story = {
  render: () => {
    const [items, setItems] = useState(tasks)

    const handleMoveItem = (itemId: string, newStatus: string, position: number) => {
      setItems((prev) => {
        const item = prev.find((t) => t.id === itemId)
        if (!item) return prev

        // Get items in target column excluding dragged item
        const columnItems = prev
          .filter((t) => (t.data.status as string) === newStatus && t.id !== itemId)
          .sort((a, b) => ((a.data.order as number) ?? 0) - ((b.data.order as number) ?? 0))

        // Insert at position
        const movedItem = { ...item, data: { ...item.data, status: newStatus } }
        columnItems.splice(position, 0, movedItem)

        // Reassign positions
        const updated = columnItems.map((t, i) => ({
          ...t,
          data: { ...t.data, order: i },
        }))

        // Merge back: keep items from other columns, replace target column
        const otherItems = prev.filter(
          (t) => (t.data.status as string) !== newStatus && t.id !== itemId
        )
        return [...otherItems, ...updated]
      })
    }

    return (
      <KanbanBoard
        items={items}
        users={users}
        onMoveItem={handleMoveItem}
        onItemClick={(item) => console.log("Clicked:", item.id)}
      />
    )
  },
}

export const CustomColumns: Story = {
  args: {
    items: [
      { id: "1", type: "task", createdAt: new Date().toISOString(), createdBy: "user-1", data: { title: "Idee: Regenwasser sammeln", status: "backlog", order: 0 } },
      { id: "2", type: "task", createdAt: new Date().toISOString(), createdBy: "user-1", data: { title: "Website aktualisieren", status: "review", order: 0, tags: ["web"] } },
      { id: "3", type: "task", createdAt: new Date().toISOString(), createdBy: "user-2", data: { title: "Newsletter versenden", status: "doing", order: 0 } },
    ],
    columns: [
      { id: "backlog", label: "Backlog" },
      { id: "doing", label: "In Arbeit" },
      { id: "review", label: "Review" },
      { id: "done", label: "Fertig" },
    ],
  },
}

export const Empty: Story = {
  args: {
    items: [],
    columns: defaultColumns,
  },
}

export const WithoutUsers: Story = {
  args: {
    items: tasks,
  },
}

export const MobileLayout: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    chromatic: { viewports: [375] },
  },
  render: () => {
    const [items, setItems] = useState(tasks)

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
      <div style={{ maxWidth: 375 }}>
        <KanbanBoard
          items={items}
          users={users}
          onMoveItem={handleMoveItem}
          onItemClick={(item) => console.log("Clicked:", item.id)}
        />
      </div>
    )
  },
}

export const MultipleAssignees: Story = {
  args: {
    items: [
      {
        id: "a-1",
        type: "task",
        createdAt: new Date().toISOString(),
        createdBy: "user-1",
        data: { title: "Einzelner Assignee", status: "todo", order: 0, tags: ["beispiel"] },
        relations: [{ predicate: "assignedTo", target: "global:user-1" }],
      },
      {
        id: "a-2",
        type: "task",
        createdAt: new Date().toISOString(),
        createdBy: "user-1",
        data: { title: "Zwei Assignees (kommasepariert)", status: "todo", order: 1, tags: ["beispiel"] },
        relations: [
          { predicate: "assignedTo", target: "global:user-1" },
          { predicate: "assignedTo", target: "global:user-2" },
        ],
      },
      {
        id: "a-3",
        type: "task",
        createdAt: new Date().toISOString(),
        createdBy: "user-1",
        data: { title: "Drei Assignees (+ N weitere)", status: "doing", order: 0, tags: ["beispiel"] },
        relations: [
          { predicate: "assignedTo", target: "global:user-1" },
          { predicate: "assignedTo", target: "global:user-2" },
          { predicate: "assignedTo", target: "global:user-3" },
        ],
      },
      {
        id: "a-4",
        type: "task",
        createdAt: new Date().toISOString(),
        createdBy: "user-1",
        data: { title: "Ohne Assignee", status: "done", order: 0 },
      },
    ],
    users,
    onItemClick: (item) => console.log("Clicked:", item.id),
  },
}

export const ManyColumns: Story = {
  render: () => {
    const manyColumns = [
      { id: "backlog", label: "Backlog" },
      { id: "todo", label: "To Do" },
      { id: "doing", label: "In Arbeit" },
      { id: "review", label: "Review" },
      { id: "testing", label: "Testing" },
      { id: "done", label: "Fertig" },
    ]

    const manyItems: Item[] = [
      { id: "m-1", type: "task", createdAt: new Date().toISOString(), createdBy: "user-1", data: { title: "Feature planen", status: "backlog", order: 0 } },
      { id: "m-2", type: "task", createdAt: new Date().toISOString(), createdBy: "user-1", data: { title: "API Design", status: "backlog", order: 1, tags: ["backend"] } },
      { id: "m-3", type: "task", createdAt: new Date().toISOString(), createdBy: "user-2", data: { title: "UI Mockups", status: "todo", order: 0, tags: ["design"] } },
      { id: "m-4", type: "task", createdAt: new Date().toISOString(), createdBy: "user-1", data: { title: "Datenbank Schema", status: "doing", order: 0, tags: ["backend"] } },
      { id: "m-5", type: "task", createdAt: new Date().toISOString(), createdBy: "user-3", data: { title: "Code Review Auth", status: "review", order: 0 } },
      { id: "m-6", type: "task", createdAt: new Date().toISOString(), createdBy: "user-2", data: { title: "E2E Tests", status: "testing", order: 0, tags: ["qa"] } },
      { id: "m-7", type: "task", createdAt: new Date().toISOString(), createdBy: "user-1", data: { title: "Deploy Pipeline", status: "done", order: 0, tags: ["infra"] } },
      { id: "m-8", type: "task", createdAt: new Date().toISOString(), createdBy: "user-2", data: { title: "Monitoring Setup", status: "done", order: 1, tags: ["infra"] } },
    ]

    const [items, setItems] = useState(manyItems)

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
      <KanbanBoard
        items={items}
        columns={manyColumns}
        users={users}
        onMoveItem={handleMoveItem}
        onItemClick={(item) => console.log("Clicked:", item.id)}
      />
    )
  },
}
