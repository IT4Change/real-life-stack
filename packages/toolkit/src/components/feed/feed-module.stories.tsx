import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Item } from "@real-life-stack/data-interface"
import { FeedItem } from "./feed-item"

const now = new Date()

const items: Array<{ item: Item; author: { name: string; avatar?: string }; comments?: number }> = [
  {
    item: {
      id: "post-1",
      type: "post",
      createdAt: new Date(now.getTime() - 1000 * 60 * 35).toISOString(),
      createdBy: "user-1",
      data: {
        title: "Gemeinschaftsgarten: Samstagstreffen",
        content: "Wir treffen uns am Samstag zum Beete vorbereiten und planen die nächsten Schritte.",
        tags: ["garten", "planung"],
      },
    },
    author: { name: "Anna Schmidt", avatar: "https://randomuser.me/api/portraits/women/44.jpg" },
    comments: 4,
  },
  {
    item: {
      id: "event-1",
      type: "event",
      createdAt: new Date(now.getTime() - 1000 * 60 * 90).toISOString(),
      createdBy: "user-2",
      data: {
        title: "Workshop: Kompost richtig anlegen",
        content: "Kurzer Praxisworkshop mit Materialliste und offener Fragerunde.",
        start: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3).toISOString(),
        address: "Gemeinschaftsgarten Nord",
        tags: ["workshop"],
      },
    },
    author: { name: "Max Mustermann", avatar: "https://randomuser.me/api/portraits/men/32.jpg" },
    comments: 2,
  },
  {
    item: {
      id: "task-1",
      type: "task",
      createdAt: new Date(now.getTime() - 1000 * 60 * 140).toISOString(),
      createdBy: "user-3",
      data: {
        title: "Wasserschlauch reparieren",
        description: "Leck am Verbindungsstück abdichten und Materialbedarf dokumentieren.",
        status: "doing",
        tags: ["infrastruktur"],
      },
    },
    author: { name: "Thomas Müller", avatar: "https://randomuser.me/api/portraits/men/67.jpg" },
  },
]

function StaticReactionSlot() {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="rounded-full border bg-muted/50 px-2 py-0.5">❤️ 5</span>
      <span className="rounded-full border bg-muted/50 px-2 py-0.5">👍 3</span>
    </div>
  )
}

function FeedModuleOverview() {
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {items.map(({ item, author, comments }) => (
        <FeedItem
          key={item.id}
          item={item}
          author={author}
          commentCount={comments}
          reactionSlot={<StaticReactionSlot />}
        />
      ))}
    </div>
  )
}

const meta: Meta<typeof FeedModuleOverview> = {
  title: "RLS/Space Modules/Feed/Overview",
  component: FeedModuleOverview,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
}

export default meta
type Story = StoryObj<typeof FeedModuleOverview>

export const Default: Story = {}
