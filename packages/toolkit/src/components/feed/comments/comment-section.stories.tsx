import { useState, useCallback } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { CommentWithAuthor } from "@/hooks/use-comments"
import type { Item } from "@real-life-stack/data-interface"
import { CommentInput, type CommentQuote } from "./comment-input"
import { CommentBubble } from "./comment-bubble"
import { CommentThread } from "./comment-thread"

// ---- Mock Data ----

function mockItem(id: string, createdBy: string, createdAt: string, data: Record<string, unknown>): Item {
  return { id, type: "comment", createdBy, createdAt, data, relations: [] }
}

const MOCK_COMMENTS: CommentWithAuthor[] = [
  {
    item: mockItem("c1", "user-1", "2026-03-20T10:00:00Z", { content: "Tolle Idee! Bin dabei." }),
    authorName: "Anna Schmidt",
    authorAvatar: "https://randomuser.me/api/portraits/women/44.jpg",
    replyCount: 2,
  },
  {
    item: mockItem("c2", "user-2", "2026-03-20T11:00:00Z", { content: "Wann genau? Samstag passt mir gut." }),
    authorName: "Thomas Müller",
    authorAvatar: "https://randomuser.me/api/portraits/men/32.jpg",
    replyCount: 0,
  },
  {
    item: mockItem("c3", "user-3", "2026-03-20T12:30:00Z", { content: "Ich bringe Kuchen mit! 🎂" }),
    authorName: "Lena Weber",
    authorAvatar: "https://randomuser.me/api/portraits/women/68.jpg",
    replyCount: 1,
  },
]

const MOCK_REPLIES_C1: CommentWithAuthor[] = [
  {
    item: mockItem("r1", "user-2", "2026-03-20T10:15:00Z", { content: "Super, ich komme auch!", replyTo: "c1" }),
    authorName: "Thomas Müller",
    authorAvatar: "https://randomuser.me/api/portraits/men/32.jpg",
    replyCount: 0,
  },
  {
    item: mockItem("r2", "user-3", "2026-03-20T10:30:00Z", {
      content: "Ich bringe Kuchen mit!",
      replyTo: "c1",
      replyToComment: "r1",
    }),
    authorName: "Lena Weber",
    authorAvatar: "https://randomuser.me/api/portraits/women/68.jpg",
    replyCount: 0,
  },
]

const MOCK_REPLIES_C3: CommentWithAuthor[] = [
  {
    item: mockItem("r3", "user-1", "2026-03-20T13:00:00Z", { content: "Lecker! Was für einen?", replyTo: "c3" }),
    authorName: "Anna Schmidt",
    authorAvatar: "https://randomuser.me/api/portraits/women/44.jpg",
    replyCount: 0,
  },
]

function getReplies(commentId: string): CommentWithAuthor[] {
  if (commentId === "c1") return MOCK_REPLIES_C1
  if (commentId === "c3") return MOCK_REPLIES_C3
  return []
}


// ---- Standalone CommentSection for Storybook ----

function StandaloneCommentSection() {
  const [comments, setComments] = useState(MOCK_COMMENTS)
  const [replyTo, setReplyTo] = useState<CommentQuote | null>(null)
  const [replyToFirstLevel, setReplyToFirstLevel] = useState<string | null>(null)

  const handleReply = useCallback((comment: CommentWithAuthor) => {
    const data = comment.item.data as { content: string; replyTo?: string }
    const isSecondLevel = !!data.replyTo

    setReplyTo({
      id: comment.item.id,
      authorName: comment.authorName,
      text: (data.content ?? "").slice(0, 80),
    })
    setReplyToFirstLevel(isSecondLevel ? data.replyTo! : comment.item.id)
  }, [])

  const handleSubmit = useCallback((text: string) => {
    const newComment: CommentWithAuthor = {
      item: mockItem(
        `c-new-${Date.now()}`,
        "user-current",
        new Date().toISOString(),
        {
          content: text,
          ...(replyToFirstLevel ? { replyTo: replyToFirstLevel } : {}),
          ...(replyTo && replyTo.id !== replyToFirstLevel ? { replyToComment: replyTo.id } : {}),
        }
      ),
      authorName: "Du",
      replyCount: 0,
    }

    if (replyToFirstLevel) {
      setComments((prev) =>
        prev.map((c) =>
          c.item.id === replyToFirstLevel ? { ...c, replyCount: c.replyCount + 1 } : c
        )
      )
    } else {
      setComments((prev) => [...prev, newComment])
    }

    setReplyTo(null)
    setReplyToFirstLevel(null)
  }, [replyTo, replyToFirstLevel])

  return (
    <div className="flex flex-col h-[500px] border rounded-lg bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          {comments.map((comment) => (
            <CommentThread
              key={comment.item.id}
              comment={comment}
              replies={getReplies(comment.item.id)}
              onReply={handleReply}

            />
          ))}
        </div>
      </div>

      <CommentInput
        onSubmit={handleSubmit}
        replyTo={replyTo}
        onCancelReply={() => { setReplyTo(null); setReplyToFirstLevel(null) }}
      />
    </div>
  )
}

// ---- Stories ----

const meta: Meta = {
  title: "RLS/Module Components/Comments/CommentSection",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="p-8 min-h-screen">
        <div className="max-w-lg mx-auto">
          <Story />
        </div>
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj

export const FullSection: Story = {
  name: "CommentSection",
  render: () => <StandaloneCommentSection />,
}

export const InputDefault: Story = {
  name: "CommentInput — Default",
  render: () => (
    <div className="max-w-lg border rounded-lg bg-background">
      <CommentInput onSubmit={(text) => console.log("Submit:", text)} />
    </div>
  ),
}

export const InputWithReply: Story = {
  name: "CommentInput — Reply Mode",
  render: () => (
    <div className="max-w-lg border rounded-lg bg-background">
      <CommentInput
        onSubmit={(text) => console.log("Reply:", text)}
        replyTo={{ id: "c1", authorName: "Anna Schmidt", text: "Tolle Idee! Bin dabei." }}
        onCancelReply={() => console.log("Cancel reply")}
      />
    </div>
  ),
}

export const SingleBubble: Story = {
  name: "CommentBubble",
  render: () => (
    <div className="max-w-lg p-4">
      <CommentBubble
        authorName="Anna Schmidt"
        authorAvatar="https://randomuser.me/api/portraits/women/44.jpg"
        content="Tolle Idee! Bin dabei. Wer kommt noch mit?"
        timestamp={new Date(Date.now() - 2 * 3600000).toISOString()}
        onReply={() => console.log("Reply")}
      />
    </div>
  ),
}

export const BubbleWithQuote: Story = {
  name: "CommentBubble — with Quote",
  render: () => (
    <div className="max-w-lg p-4">
      <CommentBubble
        authorName="Lena Weber"
        authorAvatar="https://randomuser.me/api/portraits/women/68.jpg"
        content="Ich bringe Kuchen mit!"
        timestamp={new Date(Date.now() - 30 * 60000).toISOString()}
        quotedAuthor="Thomas"
        quotedText="Super, ich komme auch!"
        onReply={() => console.log("Reply")}
      />
    </div>
  ),
}

export const ThreadWithReplies: Story = {
  name: "CommentThread — with Replies",
  render: () => (
    <div className="max-w-lg p-4">
      <CommentThread
        comment={MOCK_COMMENTS[0]}
        replies={MOCK_REPLIES_C1}
        defaultExpanded
        onReply={(c) => console.log("Reply to:", c.authorName)}
      />
    </div>
  ),
}

export const ThreadCollapsed: Story = {
  name: "CommentThread — Collapsed",
  render: () => (
    <div className="max-w-lg p-4">
      <CommentThread
        comment={MOCK_COMMENTS[0]}
        replies={MOCK_REPLIES_C1}
        onReply={(c) => console.log("Reply to:", c.authorName)}
      />
    </div>
  ),
}
