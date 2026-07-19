import type { Meta, StoryObj } from "@storybook/react-vite"
import { NotificationCenter } from "./notification-center"

const notification = {
  groupId: "garten", groupName: "Gemeinschaftsgarten", subjectId: "post-1", subjectType: "post", subjectTitle: "Gießplan",
  semanticAction: "commented" as const, priority: "high" as const, muted: false, entryId: "entry-1", readKey: '["garten","entry-1"]', actorId: "maria", actor: { id: "maria", displayName: "Maria" },
  ts: "2026-07-18T11:00:00.000Z", targetExists: true, readKeys: { '["garten","entry-1"]': "2026-07-18T11:00:00.000Z" }, actorCount: 1, isRead: false,
}

const meta = { title: "RLS/Activity/NotificationCenter", component: NotificationCenter, args: { onOpenSubject: () => {}, onOpenGroup: () => {}, onMarkRead: () => {}, onMarkAllRead: () => {}, onMuteGroup: () => {}, onOpenActivity: () => {} } } satisfies Meta<typeof NotificationCenter>
export default meta
type Story = StoryObj<typeof meta>

export const Full: Story = { args: { notifications: [notification] } }
export const Empty: Story = { args: { notifications: [] } }
export const DegradedReadOnly: Story = { args: { notifications: [{ ...notification, isRead: true }], onMarkRead: undefined, onMarkAllRead: undefined, onMuteGroup: undefined } }
