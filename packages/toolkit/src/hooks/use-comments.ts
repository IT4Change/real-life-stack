import { useCallback, useEffect, useMemo, useState, startTransition } from "react"
import type { Item, RelatedItemsOptions } from "@real-life-stack/data-interface"
import { isWritable, hasRelations, isAuthenticatable, deriveContext } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

/** A comment with resolved author info, for UI rendering. */
export interface CommentWithAuthor {
  item: Item
  authorName: string
  authorAvatar?: string
  replyCount: number
}

/** Return value of useComments hook. */
export interface UseCommentsResult {
  /** First-level comments sorted chronologically (oldest first). */
  comments: CommentWithAuthor[]
  /** All comments (first + second level) for threading. */
  allComments: Item[]
  /**
   * Resolved author info per user id, covering authors of ALL comments
   * (first + second level). Consumers building reply lists from
   * `allComments` use this instead of showing the raw `createdBy`
   * (which is a DID on the WoT connector).
   */
  authors: Map<string, { name: string; avatar?: string }>
  /** Whether the data is still loading. */
  isLoading: boolean
  /** Whether the current user can comment (authenticated + writable connector). */
  canComment: boolean
  /** Create a new comment. */
  createComment: (text: string, replyTo?: string, replyToComment?: string) => Promise<void>
}

/**
 * Hook for reading and creating comments on an item.
 * Returns first-level comments with reply counts.
 */
export function useComments(itemId: string): UseCommentsResult {
  const connector = useConnector()
  const supportsRelations = hasRelations(connector)
  const canWrite = isWritable(connector)
  const canComment = canWrite && supportsRelations

  const optionsKey = JSON.stringify({ direction: "to" } satisfies RelatedItemsOptions)

  const observable = useMemo(() => {
    if (!supportsRelations) return null
    return connector.observeRelatedItems(itemId, "commentOn", { direction: "to" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connector, supportsRelations, itemId, optionsKey])

  const [allComments, setAllComments] = useState<Item[]>(observable?.current ?? [])
  const update = useCallback((items: Item[]) => startTransition(() => setAllComments(items)), [])

  useEffect(() => {
    if (!observable) return
    setAllComments(observable.current)
    return observable.subscribe(update)
  }, [observable, update])

  // Resolve authors and separate first/second level
  const comments: CommentWithAuthor[] = useMemo(() => {
    const commentItems = allComments.filter((c) => c.type === "comment")

    // Count replies per first-level comment
    const replyCounts = new Map<string, number>()
    for (const c of commentItems) {
      const replyTo = (c.data as { replyTo?: string }).replyTo
      if (replyTo) {
        replyCounts.set(replyTo, (replyCounts.get(replyTo) ?? 0) + 1)
      }
    }

    // First-level comments only (no replyTo)
    const firstLevel = commentItems
      .filter((c) => !(c.data as { replyTo?: string }).replyTo)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((item) => ({
        item,
        authorName: item.createdBy,
        authorAvatar: undefined as string | undefined,
        replyCount: replyCounts.get(item.id) ?? 0,
      }))

    return firstLevel
  }, [allComments])

  // Resolve author info asynchronously
  const [resolvedAuthors, setResolvedAuthors] = useState<Map<string, { name: string; avatar?: string }>>(new Map())

  useEffect(() => {
    if (!isAuthenticatable(connector)) return

    const authConnector = connector
    const userIds = [...new Set(allComments.map((c) => c.createdBy))]
    let cancelled = false

    async function resolve() {
      const resolved = new Map<string, { name: string; avatar?: string }>()
      for (const userId of userIds) {
        try {
          const user = await authConnector.getUser(userId)
          if (user && !cancelled) {
            resolved.set(userId, { name: user.displayName ?? user.id, avatar: user.avatarUrl })
          }
        } catch {
          // Fallback to userId
        }
      }
      if (!cancelled) {
        setResolvedAuthors(resolved)
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [connector, allComments])

  // Merge resolved authors into comments
  const commentsWithAuthors: CommentWithAuthor[] = useMemo(() => {
    return comments.map((c) => {
      const author = resolvedAuthors.get(c.item.createdBy)
      return {
        ...c,
        authorName: author?.name ?? c.item.createdBy,
        authorAvatar: author?.avatar,
      }
    })
  }, [comments, resolvedAuthors])

  const createComment = useCallback(async (text: string, replyTo?: string, replyToComment?: string) => {
    if (!isWritable(connector) || !hasRelations(connector)) return

    let currentUserId = "anonymous"
    if (isAuthenticatable(connector)) {
      try {
        const user = await connector.getCurrentUser()
        if (user) currentUserId = user.id
      } catch {
        // Fallback
      }
    }

    const data: Record<string, unknown> = { content: text }
    if (replyTo) data.replyTo = replyTo
    if (replyToComment) data.replyToComment = replyToComment

    await connector.createItem({
      type: "comment",
      createdBy: currentUserId,
      "@context": deriveContext("comment", data),
      data,
      relations: [{ predicate: "commentOn", target: `item:${itemId}` }],
    })
  }, [connector, itemId])

  return {
    comments: commentsWithAuthors,
    allComments,
    authors: resolvedAuthors,
    isLoading: false,
    canComment,
    createComment,
  }
}

/** Return value of useReplies hook. */
export interface UseRepliesResult {
  /** Second-level replies sorted chronologically (oldest first). */
  replies: CommentWithAuthor[]
  /** Whether the data is still loading. */
  isLoading: boolean
}

/**
 * Hook for loading second-level replies to a first-level comment.
 * Filters from the parent item's full comment list.
 */
export function useReplies(itemId: string, commentId: string): UseRepliesResult {
  const connector = useConnector()
  const supportsRelations = hasRelations(connector)

  const [replies, setReplies] = useState<CommentWithAuthor[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!hasRelations(connector)) {
      setIsLoading(false)
      return
    }

    const relConnector = connector
    let cancelled = false

    async function load() {
      try {
        const allComments = await relConnector.getRelatedItems(itemId, "commentOn", { direction: "to" })
        if (cancelled) return

        const replyItems = allComments
          .filter((c: Item) => c.type === "comment" && (c.data as { replyTo?: string }).replyTo === commentId)
          .sort((a: Item, b: Item) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

        // Resolve authors
        const resolved: CommentWithAuthor[] = await Promise.all(
          replyItems.map(async (item: Item) => {
            let authorName = item.createdBy
            let authorAvatar: string | undefined

            if (isAuthenticatable(connector)) {
              try {
                const user = await connector.getUser(item.createdBy)
                if (user) {
                  authorName = user.displayName ?? user.id
                  authorAvatar = user.avatarUrl
                }
              } catch {
                // Fallback
              }
            }

            return { item, authorName, authorAvatar, replyCount: 0 }
          })
        )

        if (!cancelled) {
          setReplies(resolved)
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [connector, supportsRelations, itemId, commentId])

  return { replies, isLoading }
}
