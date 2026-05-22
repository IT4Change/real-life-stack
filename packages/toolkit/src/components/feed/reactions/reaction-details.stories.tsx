import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { AggregatedReaction } from "@/hooks/use-reactions"

// Standalone ReactionDetails for Storybook (no connector needed)
// We inline the UI here since the real component uses useReactionUsers which needs a connector.

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/primitives/avatar"

interface MockUser {
  id: string
  displayName: string
  avatarUrl?: string
  emoji: string
}

const MOCK_USERS: MockUser[] = [
  { id: "u1", displayName: "Anna Schmidt", avatarUrl: "https://randomuser.me/api/portraits/women/44.jpg", emoji: "❤️" },
  { id: "u2", displayName: "Thomas Müller", avatarUrl: "https://randomuser.me/api/portraits/men/32.jpg", emoji: "❤️" },
  { id: "u3", displayName: "Lena Weber", avatarUrl: "https://randomuser.me/api/portraits/women/68.jpg", emoji: "👍" },
  { id: "u4", displayName: "Sebastian Koch", avatarUrl: "https://randomuser.me/api/portraits/men/67.jpg", emoji: "😂" },
  { id: "u5", displayName: "Marie Fischer", emoji: "❤️" },
  { id: "u6", displayName: "Anton Berger", avatarUrl: "https://randomuser.me/api/portraits/men/45.jpg", emoji: "👍" },
  { id: "u7", displayName: "Timo Richter", emoji: "🔥" },
  { id: "u8", displayName: "Ulf Neumann", avatarUrl: "https://randomuser.me/api/portraits/men/52.jpg", emoji: "❤️" },
  { id: "u9", displayName: "Clara Hoffmann", avatarUrl: "https://randomuser.me/api/portraits/women/22.jpg", emoji: "😂" },
  { id: "u10", displayName: "Jan Becker", emoji: "🔥" },
]

const MOCK_REACTIONS: AggregatedReaction[] = [
  { emoji: "❤️", count: 4, isMyReaction: false },
  { emoji: "👍", count: 2, isMyReaction: true },
  { emoji: "😂", count: 2, isMyReaction: false },
  { emoji: "🔥", count: 2, isMyReaction: false },
]

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

interface StandaloneDetailsProps {
  reactions: AggregatedReaction[]
  users: MockUser[]
  initialEmoji?: string
}

function StandaloneDetails({ reactions, users, initialEmoji }: StandaloneDetailsProps) {
  const [activeFilter, setActiveFilter] = useState<string | undefined>(initialEmoji)

  const filteredUsers = activeFilter
    ? users.filter((u) => u.emoji === activeFilter)
    : users

  const totalCount = reactions.reduce((sum, r) => sum + r.count, 0)

  return (
    <div className="flex flex-col h-80 border rounded-lg bg-background shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Reactions</h3>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            activeFilter === undefined
              ? "bg-primary/10 text-primary"
              : "bg-muted/60 text-muted-foreground hover:bg-muted"
          )}
          onClick={() => setActiveFilter(undefined)}
        >
          All <span className="tabular-nums">{totalCount}</span>
        </button>

        {reactions.map((r) => (
          <button
            key={r.emoji}
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors",
              activeFilter === r.emoji
                ? "bg-primary/10 text-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
            onClick={() => setActiveFilter(r.emoji)}
          >
            <span className="text-base leading-none">{r.emoji}</span>
            <span className="tabular-nums">{r.count}</span>
          </button>
        ))}
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto">
        <ul>
          {filteredUsers.map((user) => (
            <li key={user.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatarUrl} alt={user.displayName} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                  {getInitials(user.displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 text-sm text-foreground truncate">
                {user.displayName}
              </span>
              <span className="text-base leading-none">{user.emoji}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const meta: Meta<typeof StandaloneDetails> = {
  title: "RLS/Module Components/Reactions/ReactionDetails",
  component: StandaloneDetails,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
}

export default meta
type Story = StoryObj<typeof StandaloneDetails>

export const AllReactions: Story = {
  args: {
    reactions: MOCK_REACTIONS,
    users: MOCK_USERS,
  },
}

export const FilteredByEmoji: Story = {
  args: {
    reactions: MOCK_REACTIONS,
    users: MOCK_USERS,
    initialEmoji: "❤️",
  },
}

export const FewReactions: Story = {
  args: {
    reactions: [
      { emoji: "👍", count: 1, isMyReaction: true },
    ],
    users: [
      { id: "u1", displayName: "Du", emoji: "👍" },
    ],
  },
}
