import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react"
import type { Item } from "@real-life-stack/data-interface"
import { isWritable, hasRelations, isAuthenticatable, deriveContext } from "@real-life-stack/data-interface"
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
  const canRelate = hasRelations(connector)
  // The truth is the set of reaction ITEMS (reactsTo → this item). No
  // connector maintains a data.reactions summary on the parent — reading it
  // there left the pills at the mercy of the next item re-emit, which wiped
  // the optimistic state right after the write.
  const relatedObservable = useMemo(
    () => (canRelate ? connector.observeRelatedItems(itemId, "reactsTo", { direction: "to" }) : null),
    [canRelate, connector, itemId],
  )
  const [reactionItems, setReactionItems] = useState<Item[]>(relatedObservable?.current ?? [])
  useEffect(() => {
    if (!relatedObservable) return
    setReactionItems(relatedObservable.current)
    return relatedObservable.subscribe((items) => startTransition(() => setReactionItems(items)))
  }, [relatedObservable])

  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!isAuthenticatable(connector)) return
    const observable = connector.observeCurrentUser()
    setCurrentUserId(observable.current?.id)
    return observable.subscribe((user) => setCurrentUserId(user?.id))
  }, [connector])

  const canWrite = isWritable(connector)
  // Authenticatable connectors additionally need a logged-in user — reactions
  // must never be written as "anonymous".
  const canReact = canWrite && canRelate && (!isAuthenticatable(connector) || currentUserId !== undefined)

  // Optimistic overlay for the current user's own reaction: applied on click,
  // dropped as soon as the related-items observable reflects the write.
  const [pending, setPending] = useState<{ emoji: string | null } | null>(null)

  const myReactionItem = useMemo(
    () => (currentUserId ? reactionItems.find((r) => r.createdBy === currentUserId) : undefined),
    [reactionItems, currentUserId],
  )
  const persistedMyReaction = typeof myReactionItem?.data.emoji === "string" ? myReactionItem.data.emoji : undefined
  const myReaction = pending ? pending.emoji ?? undefined : persistedMyReaction

  useEffect(() => {
    if (!pending) return
    if ((pending.emoji ?? undefined) === persistedMyReaction) setPending(null)
  }, [pending, persistedMyReaction])

  const reactions: AggregatedReaction[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const reaction of reactionItems) {
      if (pending && currentUserId && reaction.createdBy === currentUserId) continue
      const emoji = reaction.data.emoji
      if (typeof emoji !== "string" || !emoji) continue
      counts.set(emoji, (counts.get(emoji) ?? 0) + 1)
    }
    if (pending?.emoji) counts.set(pending.emoji, (counts.get(pending.emoji) ?? 0) + 1)
    return [...counts.entries()]
      .map(([emoji, count]) => ({ emoji, count, isMyReaction: emoji === myReaction }))
      .sort((a, b) => b.count - a.count)
  }, [reactionItems, pending, currentUserId, myReaction])

  // Abort controller for latest-wins pattern
  const latestRef = useRef(0)
  // Serializes writes: a rapid second click waits for the first delete/create
  // pair instead of interleaving with it.
  const chainRef = useRef<Promise<void>>(Promise.resolve())

  const performReact = useCallback(async (emoji: string) => {
    if (!isWritable(connector) || !hasRelations(connector)) return

    const writableConnector = connector
    const requestId = ++latestRef.current
    const isSameEmoji = myReaction === emoji
    setPending({ emoji: isSameEmoji ? null : emoji })

    try {
      const existingReactions = await writableConnector.getRelatedItems(itemId, "reactsTo", { direction: "to" })
      if (latestRef.current !== requestId) return

      let userId = currentUserId
      if (userId === undefined && isAuthenticatable(connector)) {
        userId = (await connector.getCurrentUser())?.id
        if (userId === undefined) {
          if (latestRef.current === requestId) setPending(null)
          return
        }
      }
      const existingMine = userId ? existingReactions.find((r) => r.createdBy === userId) : undefined
      if (latestRef.current !== requestId) return

      if (existingMine) {
        await writableConnector.deleteItem(existingMine.id)
        if (latestRef.current !== requestId) return
      }

      if (!isSameEmoji) {
        const data = { emoji }
        await writableConnector.createItem({
          type: "reaction",
          createdBy: userId ?? "anonymous",
          "@context": deriveContext("reaction", data),
          data,
          relations: [{ predicate: "reactsTo", target: `item:${itemId}` }],
        })
      }
    } catch {
      if (latestRef.current === requestId) setPending(null)
    }
  }, [connector, itemId, myReaction, currentUserId])

  const react = useCallback((emoji: string) => {
    const next = chainRef.current.then(() => performReact(emoji))
    chainRef.current = next.catch(() => undefined)
    return next
  }, [performReact])

  return {
    reactions,
    react,
    isLoading: relatedObservable === null,
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
