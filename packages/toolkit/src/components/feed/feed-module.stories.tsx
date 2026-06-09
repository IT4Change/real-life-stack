import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Item } from "@real-life-stack/data-interface"
import { useMemo, useState } from "react"
import { ContentComposer, type ContentComposerSubmitData } from "./content-composer"
import { FeedComposerTrigger } from "./feed-composer-trigger"
import { FeedItem } from "./feed-item"

const now = new Date()

type FeedEntry = {
  item: Item
  author: { name: string; avatar?: string }
  comments?: number
  reactions?: Array<{ emoji: string; count: number }>
}

const currentUser = {
  id: "user-1",
  name: "Anna Schmidt",
  avatar: "https://randomuser.me/api/portraits/women/44.jpg",
}

const initialItems: FeedEntry[] = [
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
    author: { name: currentUser.name, avatar: currentUser.avatar },
    comments: 4,
    reactions: [
      { emoji: "❤️", count: 5 },
      { emoji: "👍", count: 3 },
    ],
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
    reactions: [{ emoji: "👍", count: 6 }],
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
        status: "in-progress",
        tags: ["infrastruktur"],
      },
    },
    author: { name: "Thomas Müller", avatar: "https://randomuser.me/api/portraits/men/67.jpg" },
    comments: 1,
  },
]

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function StaticReactionSlot({ reactions }: { reactions: Array<{ emoji: string; count: number }> }) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {reactions.map((reaction) => (
        <span key={reaction.emoji} className="rounded-full border bg-muted/50 px-2 py-0.5">
          {reaction.emoji} {reaction.count}
        </span>
      ))}
    </div>
  )
}

function FeedModuleOverview() {
  const [feedItems, setFeedItems] = useState(initialItems)
  const sortedItems = useMemo(
    () => [...feedItems].sort((a, b) => Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt)),
    [feedItems],
  )

  const handleCreatePost = (submitData: ContentComposerSubmitData) => {
    const text = typeof submitData.data.text === "string" ? submitData.data.text.trim() : ""
    const title = typeof submitData.data.title === "string" ? submitData.data.title.trim() : ""
    const tags = getStringArray(submitData.data.tags)

    if (!text && !title) return

    const item: Item = {
      id: `post-${Date.now()}`,
      type: submitData.contentType,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id,
      data: {
        title,
        content: text,
        tags,
      },
    }

    setFeedItems((current) => [
      {
        item,
        author: { name: currentUser.name, avatar: currentUser.avatar },
        comments: 0,
      },
      ...current,
    ])
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <FeedComposerTrigger
        userName={currentUser.name}
        userAvatar={currentUser.avatar}
        placeholder="Was gibt es Neues im Gemeinschaftsgarten?"
      >
        {({ onClose, initialText }) => (
          <div className="p-4 sm:p-6">
            <ContentComposer
              contentTypes={[
                {
                  id: "post",
                  label: "Post",
                  defaultWidgets: ["text", "tags"],
                  submitLabel: "Posten",
                },
              ]}
              initialData={{ text: initialText ?? "" }}
              showPreview={false}
              showVisibility={false}
              tagQuickSuggestions={["garten", "planung", "infrastruktur", "workshop"]}
              onSubmit={(data) => {
                handleCreatePost(data)
                onClose()
              }}
              onCancel={onClose}
            />
          </div>
        )}
      </FeedComposerTrigger>

      {sortedItems.map(({ item, author, comments, reactions }) => (
        <FeedItem
          key={item.id}
          item={item}
          author={author}
          commentCount={comments}
          reactionSlot={reactions ? <StaticReactionSlot reactions={reactions} /> : undefined}
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
