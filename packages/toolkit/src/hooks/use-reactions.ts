import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react"
import type { Item } from "@real-life-stack/data-interface"
import { isWritable, hasRelations, isAuthenticatable, deriveContext } from "@real-life-stack/data-interface"
import type { ReactionSummary } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

/** Aggregated reaction for a single emoji. */
export interface AggregatedReaction {
  /** The emoji character. */
  emoji: string
  /** Total count of users who reacted with this emoji. */
  count: number
  /** Whether this is the current user's reaction. At most one emoji can be true. */
  isMyReaction: boolean
}

/** Return value of useReactions hook. */
export interface UseReactionsResult {
  /** Aggregated reactions sorted by count (highest first). */
  reactions: AggregatedReaction[]
  /** Set or toggle the current user's reaction. Same emoji = remove, different emoji = switch. */
  react: (emoji: string) => Promise<void>
  /** Whether the hook is loading initial data. */
  isLoading: boolean
  /** Whether the current user can react (authenticated + connector supports writing). */
  canReact: boolean
}

/**
 * Hook for reading and toggling reactions on an item.
 * Reads from item.data.reactions (summary) and item.data.myReaction (current user).
 * Uses optimistic updates with latest-wins for rapid clicks.
 */
export function useReactions(itemId: string): UseReactionsResult {
  const connector = useConnector()
  const observable = useMemo(() => connector.observeItem(itemId), [connector, itemId])
  const [item, setItem] = useState<Item | null>(observable.current)
  const update = useCallback((i: Item | null) => startTransition(() => setItem(i)), [])

  useEffect(() => {
    setItem(observable.current)
    return observable.subscribe(update)
  }, [observable, update])

  const canWrite = isWritable(connector)
  const canRelate = hasRelations(connector)

  // Determine if user can react
  const canReact = canWrite && canRelate

  // Extract reaction data from item
  const reactionSummary = (item?.data?.reactions as ReactionSummary | undefined) ?? {}
  const myReaction = (item?.data?.myReaction as string | undefined) ?? undefined

  // Build aggregated reactions sorted by count
  const reactions: AggregatedReaction[] = useMemo(() => {
    const entries = Object.entries(reactionSummary)
      .filter(([, count]) => count > 0)
      .map(([emoji, count]) => ({
        emoji,
        count,
        isMyReaction: emoji === myReaction,
      }))
      .sort((a, b) => b.count - a.count)
    return entries
  }, [reactionSummary, myReaction])

  // Abort controller for latest-wins pattern
  const latestRef = useRef(0)

  const react = useCallback(async (emoji: string) => {
    if (!isWritable(connector) || !hasRelations(connector)) return

    const writableConnector = connector
    const requestId = ++latestRef.current
    const currentMyReaction = (item?.data?.myReaction as string | undefined) ?? undefined
    const currentSummary = { ...((item?.data?.reactions as ReactionSummary | undefined) ?? {}) }
    const isSameEmoji = currentMyReaction === emoji

    // Compute new state
    const newSummary = { ...currentSummary }
    if (currentMyReaction) {
      newSummary[currentMyReaction] = Math.max(0, (newSummary[currentMyReaction] ?? 1) - 1)
      if (newSummary[currentMyReaction] === 0) delete newSummary[currentMyReaction]
    }
    if (!isSameEmoji) {
      newSummary[emoji] = (newSummary[emoji] ?? 0) + 1
    }
    const newMyReaction = isSameEmoji ? undefined : emoji

    // Optimistic update
    startTransition(() => {
      setItem((prev) =>
        prev
          ? { ...prev, data: { ...prev.data, reactions: newSummary, myReaction: newMyReaction } }
          : prev
      )
    })

    try {
      // Find existing reaction item by current user
      const existingReactions = await writableConnector.getRelatedItems(itemId, "reactsTo", { direction: "to" })
      if (latestRef.current !== requestId) return

      let currentUserId: string | undefined
      if (isAuthenticatable(connector)) {
        const user = await connector.getCurrentUser()
        currentUserId = user?.id
      }

      const myReactionItem = currentUserId
        ? existingReactions.find((r) => r.createdBy === currentUserId)
        : undefined

      if (latestRef.current !== requestId) return

      if (myReactionItem) {
        await writableConnector.deleteItem(myReactionItem.id)
        if (latestRef.current !== requestId) return
      }

      if (!isSameEmoji) {
        const data = { emoji }
        await writableConnector.createItem({
          type: "reaction",
          createdBy: currentUserId ?? "anonymous",
          "@context": deriveContext("reaction", data),
          data,
          relations: [{ predicate: "reactsTo", target: `item:${itemId}` }],
        })
      }
    } catch {
      // Revert optimistic update on failure
      if (latestRef.current === requestId) {
        startTransition(() => {
          setItem((prev) =>
            prev
              ? { ...prev, data: { ...prev.data, reactions: currentSummary, myReaction: currentMyReaction } }
              : prev
          )
        })
      }
    }
  }, [connector, itemId, item])

  return {
    reactions,
    react,
    isLoading: item === null,
    canReact,
  }
}

/** User who reacted, for the ReactionDetails panel. */
export interface ReactionUser {
  id: string
  displayName: string
  avatarUrl?: string
  emoji: string
}

/** Return value of useReactionUsers hook. */
export interface UseReactionUsersResult {
  /** Users who reacted, sorted reverse chronologically. */
  users: ReactionUser[]
  /** Whether the data is still loading. */
  isLoading: boolean
}

/**
 * Hook for loading the list of users who reacted to an item.
 * Lazy-loaded — only fetches when called.
 */
export function useReactionUsers(itemId: string, emojiFilter?: string): UseReactionUsersResult {
  const connector = useConnector()
  const canRelate = hasRelations(connector)
  const canAuth = isAuthenticatable(connector)
  const [users, setUsers] = useState<ReactionUser[]>([])
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
        const reactionItems = await relConnector.getRelatedItems(itemId, "reactsTo", { direction: "to" })
        if (cancelled) return

        const filtered = emojiFilter
          ? reactionItems.filter((r: Item) => (r.data as { emoji?: string }).emoji === emojiFilter)
          : reactionItems

        // Sort reverse chronologically
        const sorted = [...filtered].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )

        // Resolve user info
        const resolvedUsers: ReactionUser[] = await Promise.all(
          sorted.map(async (r) => {
            let displayName = r.createdBy
            let avatarUrl: string | undefined

            if (isAuthenticatable(connector)) {
              try {
                const user = await connector.getUser(r.createdBy)
                if (user) {
                  displayName = user.displayName ?? user.id
                  avatarUrl = user.avatarUrl
                }
              } catch {
                // Fallback to createdBy ID
              }
            }

            return {
              id: r.createdBy,
              displayName,
              avatarUrl,
              emoji: (r.data as { emoji?: string }).emoji ?? "",
            }
          })
        )

        if (!cancelled) {
          setUsers(resolvedUsers)
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [connector, canRelate, canAuth, itemId, emojiFilter])

  return { users, isLoading }
}
