import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Item, User } from "@real-life-stack/data-interface"
import { Calendar, CheckSquare, MapPin, MessageCircle } from "lucide-react"
import { ItemPreview } from "./item-preview"
import { cn } from "../../lib/utils"

const now = new Date()

const lena: User = {
  id: "user-lena",
  displayName: "Lena Berg",
  avatarUrl: "https://randomuser.me/api/portraits/women/68.jpg",
}

const anton: User = {
  id: "user-anton",
  displayName: "Anton T.",
  avatarUrl: "https://randomuser.me/api/portraits/men/22.jpg",
}

function isoMinutesAgo(min: number): string {
  return new Date(now.getTime() - min * 60_000).toISOString()
}

const postItem: Item = {
  id: "post-1",
  type: "post",
  createdAt: isoMinutesAgo(25),
  createdBy: lena.id,
  data: {
    content:
      "Heute morgen war ich mit Anton im Markthallen-Garten. Wir haben die ersten Tomatenpflanzen gesetzt, der Boden hat nach dem Regen super getragen.",
  },
  tags: ["garten", "permakultur"],
}

const eventItem: Item = {
  id: "event-workshop",
  type: "event",
  createdAt: isoMinutesAgo(120),
  createdBy: anton.id,
  data: {
    title: "Permakultur-Workshop in der Markthalle",
    description: "Wir bauen Hochbeete für die kommende Saison zusammen.",
    start: "2026-07-15T18:00:00Z",
    address: "Marheinekeplatz 15, 10961 Berlin",
  },
  tags: ["workshop", "permakultur"],
}

const taskItem: Item = {
  id: "task-beete",
  type: "task",
  createdAt: isoMinutesAgo(60 * 24 * 3),
  createdBy: lena.id,
  data: {
    title: "Beete vorbereiten",
    description: "Erde umgraben und Kompost einarbeiten — bis zum Wochenende.",
    status: "in-progress",
    order: 1,
  },
  tags: ["garten"],
}

// Reusable adornment helpers for the stories.
function TypeBadge({ type }: { type: string }) {
  if (type === "post") return null
  const config: Record<string, { Icon: typeof Calendar; label: string; className: string }> = {
    event: { Icon: Calendar, label: "Event", className: "bg-blue-50 text-blue-700 border-blue-200" },
    task: { Icon: CheckSquare, label: "Task", className: "bg-amber-50 text-amber-700 border-amber-200" },
  }
  const cfg = config[type]
  if (!cfg) return null
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", cfg.className)}>
      <cfg.Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

function MetaRow({ start, address }: { start?: string; address?: string }) {
  if (!start && !address) return null
  return (
    <div className="flex flex-wrap gap-3">
      {start && (
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {new Date(start).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
      {address && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {address}
        </span>
      )}
    </div>
  )
}

function CommentCount({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <button
      type="button"
      onClick={(e) => e.stopPropagation()}
      className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <MessageCircle className="h-3 w-3" />
      {count} Kommentar{count !== 1 ? "e" : ""}
    </button>
  )
}

const meta: Meta<typeof ItemPreview> = {
  title: "Module Components / ItemPreview",
  component: ItemPreview,
  decorators: [
    (Story) => (
      <div className="max-w-2xl mx-auto p-6 bg-background">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ItemPreview>

export const Bare: Story = {
  name: "Bare — text post, no adornments",
  args: {
    item: postItem,
    author: lena,
    onClick: () => console.log("click"),
  },
}

export const WithHeaderBadge: Story = {
  name: "With header badge — event card",
  args: {
    item: eventItem,
    author: anton,
    headerAdornment: <TypeBadge type="event" />,
    metaAdornment: <MetaRow start={eventItem.data.start as string} address={eventItem.data.address as string} />,
    onClick: () => console.log("click"),
  },
}

export const TaskCard: Story = {
  name: "Task — with status badge and assignees",
  args: {
    item: taskItem,
    author: lena,
    headerAdornment: <TypeBadge type="task" />,
    footerAdornment: (
      <div className="flex items-center gap-3 text-xs">
        <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-medium">in Arbeit</span>
        <CommentCount count={3} />
      </div>
    ),
    onClick: () => console.log("click"),
  },
}

export const AnonymousAuthor: Story = {
  name: "Falls back to createdBy when author is missing",
  args: {
    item: postItem,
    author: undefined,
    onClick: () => console.log("click"),
  },
}

export const NoAuthorRow: Story = {
  name: "author={null} suppresses the entire author block",
  args: {
    item: { ...postItem, data: { ...postItem.data } },
    author: null,
  },
}

export const NoTitleNoDescription: Story = {
  name: "Edge — only tags",
  args: {
    item: {
      id: "post-2",
      type: "post",
      createdAt: isoMinutesAgo(5),
      createdBy: lena.id,
      data: {},
      tags: ["garten", "test"],
    },
    author: lena,
  },
}

export const LongDescriptionClamped: Story = {
  name: "Long description is clamped to 4 lines",
  args: {
    item: {
      ...postItem,
      data: {
        content: Array.from({ length: 10 }, () =>
          "Wir haben heute den Garten besucht, die ersten Tomatenpflanzen gesetzt, den Boden gelockert, die Beete neu sortiert.",
        ).join(" "),
      },
    },
    author: lena,
  },
}
