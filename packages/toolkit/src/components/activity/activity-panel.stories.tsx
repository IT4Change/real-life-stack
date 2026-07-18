import type { Meta, StoryObj } from "@storybook/react"
import { ActivityPanel } from "./activity-panel"

const meta: Meta<typeof ActivityPanel> = { title: "RLS/Shell/Activity Panel", component: ActivityPanel }
export default meta
type Story = StoryObj<typeof ActivityPanel>

export const Full: Story = { args: { entries: [{ id: "1", ts: "2026-07-18T09:00:00.000Z", actor: "user-1", action: "update", targetId: "task-1", targetType: "task", summary: "Aufgabe verschoben" }] } }
export const Empty: Story = { args: { entries: [] } }
export const DeleteWithoutCreate: Story = { args: { entries: [{ id: "2", ts: "2026-07-18T09:00:00.000Z", actor: "user-1", action: "delete", targetId: "gone", targetType: "task", summary: "Gelöschte Aufgabe" }] } }
