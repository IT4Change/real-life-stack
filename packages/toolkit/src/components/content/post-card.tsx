"use client"

import { Heart, MessageCircle, Share2, Calendar, HelpCircle } from "lucide-react"

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type PostType = "text" | "event" | "request"

export interface PostAuthor {
  name: string
  avatar?: string
}

export interface Post {
  id: string
  author: PostAuthor
  content: string
  timestamp: string
  likes: number
  comments: number
  type: PostType
}

interface PostCardProps {
  post: Post
  onLike?: (postId: string) => void
  onComment?: (postId: string) => void
  onShare?: (postId: string) => void
  className?: string
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function PostTypeBadge({ type }: { type: PostType }) {
  if (type === "text") return null

  const config = {
    event: {
      icon: Calendar,
      label: "Event",
      className: "bg-secondary/10 text-secondary border-secondary/20",
    },
    request: {
      icon: HelpCircle,
      label: "Anfrage",
      className: "bg-accent/10 text-accent border-accent/20",
    },
  }

  const { icon: Icon, label, className } = config[type]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

export function PostCard({
  post,
  onLike,
  onComment,
  onShare,
  className,
}: PostCardProps) {
  const { author, content, timestamp, likes, comments, type } = post

  return (
    <Card
      className={cn(
        "transition-all hover:border-border/80 hover:shadow-md",
        className
      )}
    >
      <CardHeader className="flex-row items-start gap-3 space-y-0 pb-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={author.avatar} alt={author.name} />
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
            {getInitials(author.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground">{author.name}</p>
            <PostTypeBadge type={type} />
          </div>
          <p className="text-xs text-muted-foreground">{timestamp}</p>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-foreground leading-relaxed">{content}</p>
      </CardContent>
      <CardFooter className="border-t pt-3 gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50"
          onClick={() => onLike?.(post.id)}
        >
          <Heart className="h-4 w-4" />
          <span className="text-sm">{likes}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5"
          onClick={() => onComment?.(post.id)}
        >
          <MessageCircle className="h-4 w-4" />
          <span className="text-sm">{comments}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 ml-auto"
          onClick={() => onShare?.(post.id)}
        >
          <Share2 className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  )
}
