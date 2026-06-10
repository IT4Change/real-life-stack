import { useState, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { cn } from "@/lib/utils"
import { Button } from "@/components/primitives/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/primitives/avatar"
import { Plus } from "lucide-react"
import type { AggregatedReaction } from "@/hooks/use-reactions"
import { REACTION_NAMES } from "./reaction-constants"
import { ReactionPicker } from "./reaction-picker"

// ---- Mock data for details panel ----

const MOCK_USERS: { id: string; name: string; avatar?: string; emoji: string }[] = [
  { id: "u1", name: "Anna Schmidt", avatar: "https://randomuser.me/api/portraits/women/44.jpg", emoji: "❤️" },
  { id: "u2", name: "Thomas Müller", avatar: "https://randomuser.me/api/portraits/men/32.jpg", emoji: "👍" },
  { id: "u3", name: "Lena Weber", avatar: "https://randomuser.me/api/portraits/women/68.jpg", emoji: "😂" },
  { id: "u4", name: "Sebastian Koch", avatar: "https://randomuser.me/api/portraits/men/67.jpg", emoji: "🔥" },
  { id: "u5", name: "Marie Fischer", emoji: "❤️" },
]

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

function StandaloneDetailsInline({
  reactions,
  initialEmoji,
  onClose,
}: {
  reactions: AggregatedReaction[]
  initialEmoji?: string
  onClose: () => void
}) {
  const [filter, setFilter] = useState<string | undefined>(initialEmoji)
  const filtered = filter ? MOCK_USERS.filter((u) => u.emoji === filter) : MOCK_USERS
  const total = reactions.reduce((s, r) => s + r.count, 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Reactions</h3>
        <button type="button" className="text-muted-foreground hover:text-foreground text-sm" onClick={onClose}>Close</button>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            filter === undefined ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground hover:bg-muted"
          )}
          onClick={() => setFilter(undefined)}
        >
          All <span className="tabular-nums">{total}</span>
        </button>
        {reactions.map((r) => (
          <button
            key={r.emoji}
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors",
              filter === r.emoji ? "bg-primary/10 text-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
            onClick={() => setFilter(r.emoji)}
          >
            <span className="text-base leading-none">{r.emoji}</span>
            <span className="tabular-nums">{r.count}</span>
          </button>
        ))}
      </div>
      <ul className="flex-1 overflow-y-auto">
        {filtered.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 transition-colors">
            <Avatar className="h-8 w-8">
              <AvatarImage src={u.avatar} alt={u.name} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">{getInitials(u.name)}</AvatarFallback>
            </Avatar>
            <span className="flex-1 text-sm text-foreground truncate">{u.name}</span>
            <span className="text-base leading-none">{u.emoji}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- Standalone ReactionBar for Storybook (no connector needed) ----

interface StandaloneReactionBarProps {
  initialReactions: AggregatedReaction[]
  maxVisible?: number
  className?: string
}

function StandaloneReactionBar({ initialReactions, maxVisible = 6, className }: StandaloneReactionBarProps) {
  const [reactions, setReactions] = useState(initialReactions)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsEmoji, setDetailsEmoji] = useState<string | undefined>()
  const addButtonRef = useRef<HTMLButtonElement>(null)

  const handleReact = (emoji: string) => {
    setReactions((prev) => {
      const myCurrentReaction = prev.find((r) => r.isMyReaction)
      let updated = prev.map((r) => ({
        ...r,
        // Remove old reaction
        count: r.isMyReaction ? r.count - 1 : r.count,
        isMyReaction: false,
      })).filter((r) => r.count > 0)

      if (myCurrentReaction?.emoji !== emoji) {
        const existing = updated.find((r) => r.emoji === emoji)
        if (existing) {
          updated = updated.map((r) =>
            r.emoji === emoji ? { ...r, count: r.count + 1, isMyReaction: true } : r
          )
        } else {
          updated.push({ emoji, count: 1, isMyReaction: true })
        }
      }

      return updated.sort((a, b) => b.count - a.count)
    })
  }

  const visibleReactions = reactions.slice(0, maxVisible)
  const overflowCount = reactions.length - maxVisible

  return (
    <div className={cn("space-y-3", className)}>
    <div className="flex flex-wrap items-center gap-1">
      {visibleReactions.map((r) => (
        <span
          key={r.emoji}
          className={cn(
            "inline-flex items-center rounded-full border text-sm transition-all select-none cursor-pointer",
            r.isMyReaction
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
          aria-label={`${REACTION_NAMES[r.emoji] ?? r.emoji}, ${r.count} reaction${r.count !== 1 ? "s" : ""}${r.isMyReaction ? ", your reaction" : ""}`}
          aria-pressed={r.isMyReaction}
          role="button"
          tabIndex={0}
          onClick={() => handleReact(r.emoji)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              handleReact(r.emoji)
            }
          }}
        >
          <span className="pl-1.5 py-0.5 text-base leading-none">{r.emoji}</span>
          <span
            className="pr-1.5 pl-1 py-0.5 text-xs tabular-nums hover:underline"
            onClick={(e) => {
              e.stopPropagation()
              setDetailsEmoji(r.emoji)
              setDetailsOpen(true)
            }}
          >
            {r.count}
          </span>
        </span>
      ))}

      {overflowCount > 0 && (
        <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
          +{overflowCount}
        </span>
      )}

      <Button
        ref={addButtonRef}
        variant="ghost"
        size="sm"
        className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-foreground"
        aria-label="Add reaction"
        onClick={() => { setPickerOpen((prev) => !prev); setDetailsOpen(false) }}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>

      {pickerOpen && (
        <ReactionPicker
          anchorRef={addButtonRef}
          onSelect={(emoji) => { handleReact(emoji); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      </div>

      {detailsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setDetailsOpen(false)}>
          <div
            className="bg-background rounded-t-lg sm:rounded-lg shadow-xl w-full sm:max-w-sm h-80"
            onClick={(e) => e.stopPropagation()}
          >
            <StandaloneDetailsInline
              reactions={reactions}
              initialEmoji={detailsEmoji}
              onClose={() => setDetailsOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Stories ----

const meta: Meta<typeof StandaloneReactionBar> = {
  title: "RLS/Module Components/Reactions/ReactionBar",
  component: StandaloneReactionBar,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="p-8 min-h-screen">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof StandaloneReactionBar>

export const Default: Story = {
  args: {
    initialReactions: [
      { emoji: "❤️", count: 12, isMyReaction: false },
      { emoji: "👍", count: 5, isMyReaction: true },
      { emoji: "😂", count: 3, isMyReaction: false },
      { emoji: "🔥", count: 2, isMyReaction: false },
    ],
  },
}

export const SingleReaction: Story = {
  args: {
    initialReactions: [
      { emoji: "❤️", count: 1, isMyReaction: true },
    ],
  },
}

export const NoReactions: Story = {
  args: {
    initialReactions: [],
  },
}

export const ManyReactions: Story = {
  args: {
    initialReactions: [
      { emoji: "❤️", count: 45, isMyReaction: false },
      { emoji: "👍", count: 32, isMyReaction: false },
      { emoji: "😂", count: 18, isMyReaction: true },
      { emoji: "🔥", count: 12, isMyReaction: false },
      { emoji: "🎉", count: 8, isMyReaction: false },
      { emoji: "🤔", count: 5, isMyReaction: false },
      { emoji: "🚀", count: 3, isMyReaction: false },
      { emoji: "✨", count: 2, isMyReaction: false },
    ],
  },
}

export const Overflow: Story = {
  args: {
    initialReactions: [
      { emoji: "❤️", count: 45, isMyReaction: false },
      { emoji: "👍", count: 32, isMyReaction: false },
      { emoji: "😂", count: 18, isMyReaction: false },
      { emoji: "🔥", count: 12, isMyReaction: false },
      { emoji: "🎉", count: 8, isMyReaction: false },
      { emoji: "🤔", count: 5, isMyReaction: false },
      { emoji: "🚀", count: 3, isMyReaction: false },
      { emoji: "✨", count: 2, isMyReaction: false },
    ],
    maxVisible: 4,
  },
}

export const InPostCard: Story = {
  render: () => (
    <div className="max-w-lg border rounded-lg bg-card">
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
            AS
          </div>
          <div>
            <p className="text-sm font-semibold">Anna Schmidt</p>
            <p className="text-xs text-muted-foreground">vor 2 Stunden</p>
          </div>
        </div>
        <p className="text-sm text-foreground">
          Wer hat Lust auf einen gemeinsamen Spaziergang im Park am Samstag?
          Treffpunkt wäre 14 Uhr am Eingang.
        </p>
      </div>
      <div className="border-t px-4 py-2">
        <StandaloneReactionBar
          initialReactions={[
            { emoji: "❤️", count: 5, isMyReaction: false },
            { emoji: "👍", count: 3, isMyReaction: true },
            { emoji: "🎉", count: 2, isMyReaction: false },
          ]}
        />
      </div>
    </div>
  ),
}
