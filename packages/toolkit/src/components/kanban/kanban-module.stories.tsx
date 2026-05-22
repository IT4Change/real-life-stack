import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Item, User } from "@real-life-stack/data-interface"
import { KanbanBoard } from "./kanban-board"

const users: User[] = [
  { id: "user-1", displayName: "Anna Schmidt", avatarUrl: "https://randomuser.me/api/portraits/women/44.jpg" },
  { id: "user-2", displayName: "Max Mustermann", avatarUrl: "https://randomuser.me/api/portraits/men/32.jpg" },
  { id: "user-3", displayName: "Thomas Müller", avatarUrl: "https://randomuser.me/api/portraits/men/67.jpg" },
]

const initialItems: Item[] = [
  {
    id: "task-1",
    type: "task",
    createdAt: new Date().toISOString(),
    createdBy: "user-1",
    data: {
      title: "Materialliste fertigstellen",
      description: "Holz, Schrauben und Erde für den Hochbeetbau prüfen.",
      status: "todo",
      position: 0,
      tags: ["hochbeet"],
    },
    relations: [{ predicate: "assignedTo", target: "global:user-1" }],
  },
  {
    id: "project-1",
    type: "project",
    createdAt: new Date().toISOString(),
    createdBy: "user-2",
    data: {
      title: "Hochbeet-Projekt koordinieren",
      description: "Status ist Board-Workflow, keine Projektbewertung.",
      status: "doing",
      position: 0,
      tags: ["projekt"],
    },
    relations: [{ predicate: "assignedTo", target: "global:user-2" }],
  },
  {
    id: "task-2",
    type: "task",
    createdAt: new Date().toISOString(),
    createdBy: "user-3",
    data: {
      title: "Dokumentation vorbereiten",
      description: "Fotos und kurze Notizen für den Feed sammeln.",
      status: "doing",
      position: 1,
      tags: ["doku"],
    },
    relations: [{ predicate: "assignedTo", target: "global:user-3" }],
  },
  {
    id: "task-3",
    type: "task",
    createdAt: new Date().toISOString(),
    createdBy: "user-1",
    data: {
      title: "Termin abstimmen",
      description: "Samstag 10 Uhr ist bestätigt.",
      status: "done",
      position: 0,
      tags: ["orga"],
    },
  },
]

function KanbanModuleOverview() {
  const [items, setItems] = useState(initialItems)

  const handleMoveItem = (itemId: string, newStatus: string, position: number) => {
    setItems((prev) => {
      const item = prev.find((candidate) => candidate.id === itemId)
      if (!item) return prev

      const columnItems = prev
        .filter((candidate) => (candidate.data.status as string) === newStatus && candidate.id !== itemId)
        .sort((a, b) => ((a.data.position as number) ?? 0) - ((b.data.position as number) ?? 0))

      columnItems.splice(position, 0, { ...item, data: { ...item.data, status: newStatus } })

      const updatedColumnItems = columnItems.map((candidate, index) => ({
        ...candidate,
        data: { ...candidate.data, position: index },
      }))

      const otherItems = prev.filter(
        (candidate) => (candidate.data.status as string) !== newStatus && candidate.id !== itemId
      )

      return [...otherItems, ...updatedColumnItems]
    })
  }

  return (
    <KanbanBoard
      items={items}
      users={users}
      onMoveItem={handleMoveItem}
    />
  )
}

const meta: Meta<typeof KanbanModuleOverview> = {
  title: "RLS/Space Modules/Kanban/Overview",
  component: KanbanModuleOverview,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
}

export default meta
type Story = StoryObj<typeof KanbanModuleOverview>

export const Default: Story = {}
