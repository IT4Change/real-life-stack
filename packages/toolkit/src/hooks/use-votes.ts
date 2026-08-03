import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react"
import type { Item, VoteValue } from "@real-life-stack/data-interface"
import { isWritable, hasRelations, isAuthenticatable, deriveContext, voteItemId } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

/** Aggregated vote distribution for a statement. */
export interface VoteSummary {
  green: number
  yellow: number
  red: number
  total: number
  /** The current user's stance, if any. */
  myVote?: VoteValue
}

/** Return value of useVotes hook. */
export interface UseVotesResult {
  summary: VoteSummary
  /** Set or toggle the current user's vote. Same value = withdraw, different value = switch. */
  vote: (value: VoteValue) => Promise<void>
  isLoading: boolean
  /** Whether the current user can vote (authenticated + connector supports writing). */
  canVote: boolean
}

const VOTE_VALUES: readonly VoteValue[] = ["green", "yellow", "red"]

function isVoteValue(value: unknown): value is VoteValue {
  return typeof value === "string" && (VOTE_VALUES as readonly string[]).includes(value)
}

/**
 * Hook for reading and casting votes on a statement (Resonance module).
 *
 * The truth is the set of vote ITEMS (votesOn → this statement) — never a
 * summary field on the statement (updateItem reconciles data wholesale, so a
 * summary would let concurrent voters erase each other; see
 * docs/spec/modules/resonance.md). One vote per (statement, voter) is enforced
 * STRUCTURALLY via the deterministic item id `vote:<statementId>:<did>`:
 * createItem with an existing id is idempotent, a stance change is an
 * updateItem on the voter's OWN item (one item = the CRDT merge boundary).
 */
export function useVotes(statementId: string): UseVotesResult {
  const connector = useConnector()
  const canRelate = hasRelations(connector)
  const relatedObservable = useMemo(
    () => (canRelate ? connector.observeRelatedItems(statementId, "votesOn", { direction: "to" }) : null),
    [canRelate, connector, statementId],
  )
  const [voteItems, setVoteItems] = useState<Item[]>(relatedObservable?.current ?? [])
  useEffect(() => {
    if (!relatedObservable) return
    setVoteItems(relatedObservable.current)
    return relatedObservable.subscribe((items) => startTransition(() => setVoteItems(items)))
  }, [relatedObservable])

  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!isAuthenticatable(connector)) return
    const observable = connector.observeCurrentUser()
    setCurrentUserId(observable.current?.id)
    return observable.subscribe((user) => setCurrentUserId(user?.id))
  }, [connector])

  const canWrite = isWritable(connector)
  // Votes are identity-bound and transparent — never written as "anonymous".
  const canVote = canWrite && canRelate && (!isAuthenticatable(connector) || currentUserId !== undefined)

  // Optimistic overlay for the own vote: applied on click, dropped as soon as
  // the related-items observable reflects the write.
  const [pending, setPending] = useState<{ value: VoteValue | null } | null>(null)

  const myVoteItem = useMemo(
    () => (currentUserId ? voteItems.find((v) => v.createdBy === currentUserId) : undefined),
    [voteItems, currentUserId],
  )
  const persistedMyVote = isVoteValue(myVoteItem?.data.value) ? myVoteItem.data.value : undefined
  const myVote = pending ? pending.value ?? undefined : persistedMyVote

  useEffect(() => {
    if (!pending) return
    if ((pending.value ?? undefined) === persistedMyVote) setPending(null)
  }, [pending, persistedMyVote])

  const summary: VoteSummary = useMemo(() => {
    const result: VoteSummary = { green: 0, yellow: 0, red: 0, total: 0 }
    for (const item of voteItems) {
      if (pending && currentUserId && item.createdBy === currentUserId) continue
      const value = item.data.value
      if (!isVoteValue(value)) continue
      result[value] += 1
      result.total += 1
    }
    if (pending?.value) {
      result[pending.value] += 1
      result.total += 1
    }
    if (myVote) result.myVote = myVote
    return result
  }, [voteItems, pending, currentUserId, myVote])

  // Latest-wins + write chain, mirroring use-reactions.
  const latestRef = useRef(0)
  const chainRef = useRef<Promise<void>>(Promise.resolve())

  const performVote = useCallback(async (value: VoteValue) => {
    if (!isWritable(connector) || !hasRelations(connector)) return

    const writableConnector = connector
    const requestId = ++latestRef.current
    const isSameValue = myVote === value
    setPending({ value: isSameValue ? null : value })

    try {
      let userId = currentUserId
      if (userId === undefined && isAuthenticatable(connector)) {
        userId = (await connector.getCurrentUser())?.id
        if (userId === undefined) {
          if (latestRef.current === requestId) setPending(null)
          return
        }
      }
      if (userId === undefined) {
        if (latestRef.current === requestId) setPending(null)
        return
      }
      const existingVotes = await writableConnector.getRelatedItems(statementId, "votesOn", { direction: "to" })
      if (latestRef.current !== requestId) return
      const existingMine = existingVotes.find((v) => v.createdBy === userId)

      if (existingMine) {
        if (isSameValue) {
          // Withdraw the own vote.
          await writableConnector.deleteItem(existingMine.id)
        } else {
          // Stance change: update the OWN vote item — conflict-free, no
          // delete/create churn, and the deterministic id stays stable.
          await writableConnector.updateItem(existingMine.id, { data: { value } })
        }
        return
      }
      if (isSameValue) return // nothing to withdraw

      const data = { value }
      await writableConnector.createItem({
        id: voteItemId(statementId, userId),
        type: "vote",
        createdBy: userId,
        "@context": deriveContext("vote", data),
        data,
        relations: [{ predicate: "votesOn", target: `item:${statementId}` }],
      })
    } catch {
      if (latestRef.current === requestId) setPending(null)
    }
  }, [connector, statementId, myVote, currentUserId])

  const vote = useCallback((value: VoteValue) => {
    const next = chainRef.current.then(() => performVote(value))
    chainRef.current = next.catch(() => undefined)
    return next
  }, [performVote])

  return { summary, vote, isLoading: relatedObservable === null, canVote }
}

/** Voter entry for the detail view — votes are transparent by design. */
export interface VoteUser {
  id: string
  displayName: string
  avatarUrl?: string
  value: VoteValue
}

export interface UseVoteUsersResult {
  users: VoteUser[]
  isLoading: boolean
}

/** Loads the list of voters (with stance) for a statement. */
export function useVoteUsers(statementId: string, enabled = true): UseVoteUsersResult {
  const connector = useConnector()
  const [users, setUsers] = useState<VoteUser[]>([])
  const [isLoading, setIsLoading] = useState(enabled)

  useEffect(() => {
    if (!enabled || !hasRelations(connector)) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    ;(async () => {
      try {
        const voteItems = await connector.getRelatedItems(statementId, "votesOn", { direction: "to" })
        const resolved = await Promise.all(
          voteItems
            .filter((v) => isVoteValue(v.data.value))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(async (v) => {
              const user = isAuthenticatable(connector) ? await connector.getUser(v.createdBy) : null
              return {
                id: v.createdBy,
                displayName: user?.displayName ?? v.createdBy,
                avatarUrl: user?.avatarUrl,
                value: v.data.value as VoteValue,
              }
            }),
        )
        if (!cancelled) setUsers(resolved)
      } catch {
        if (!cancelled) setUsers([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [connector, statementId, enabled])

  return { users, isLoading }
}
