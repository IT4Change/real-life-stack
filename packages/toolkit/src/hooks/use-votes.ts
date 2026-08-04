import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react"
import type { RelationRecord, VoteRecord, VoteValue } from "@real-life-stack/data-interface"
import {
  VOTE_PREDICATE,
  hasRelationRecords,
  hasRelationRecordWriter,
  isAuthenticatable,
  voteRecordInput,
  votesFromRelationRecords,
} from "@real-life-stack/data-interface"
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
  /** Whether the current user can vote (authenticated + connector has the record writer). */
  canVote: boolean
}

/**
 * Hook for reading and casting votes on a statement (Resonance module).
 *
 * Votes are RELATION RECORDS written through the auth-bound relation store
 * (docs/spec/08-relation-records.md): `createdBy` comes from the authenticated
 * identity, the canonical hash id binds (voter, statement) — one record per
 * tuple, structurally. The read side accepts only validated records
 * (`votesFromRelationRecords`): endpoint bound to the author, at most one
 * counted vote per (statement, voter). See docs/spec/modules/resonance.md.
 */
export function useVotes(statementId: string): UseVotesResult {
  const connector = useConnector()
  const canRead = hasRelationRecords(connector)
  const recordsObservable = useMemo(
    () => (canRead
      ? connector.observeRelationRecords({ predicate: VOTE_PREDICATE, to: `item:${statementId}` })
      : null),
    [canRead, connector, statementId],
  )
  const [records, setRecords] = useState<RelationRecord[]>(recordsObservable?.current ?? [])
  useEffect(() => {
    if (!recordsObservable) return
    setRecords(recordsObservable.current)
    return recordsObservable.subscribe((next) => startTransition(() => setRecords(next)))
  }, [recordsObservable])

  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!isAuthenticatable(connector)) return
    const observable = connector.observeCurrentUser()
    setCurrentUserId(observable.current?.id)
    return observable.subscribe((user) => setCurrentUserId(user?.id))
  }, [connector])

  // Votes are identity-bound and transparent — never written as "anonymous".
  // Without Authenticatable there is no identity, hence no voting.
  const canWrite = hasRelationRecordWriter(connector)
  const canVote = canWrite && canRead && isAuthenticatable(connector) && currentUserId !== undefined

  const votes = useMemo(() => votesFromRelationRecords(records), [records])

  // Optimistic overlay for the own vote: applied on click, dropped as soon as
  // the records observable reflects the write.
  const [pending, setPending] = useState<{ value: VoteValue | null } | null>(null)

  const persistedMyVote = useMemo(
    () => (currentUserId ? votes.find((vote) => vote.voterId === currentUserId)?.value : undefined),
    [votes, currentUserId],
  )
  const myVote = pending ? pending.value ?? undefined : persistedMyVote

  useEffect(() => {
    if (!pending) return
    if ((pending.value ?? undefined) === persistedMyVote) setPending(null)
  }, [pending, persistedMyVote])

  const summary: VoteSummary = useMemo(() => {
    const result: VoteSummary = { green: 0, yellow: 0, red: 0, total: 0 }
    for (const vote of votes) {
      if (pending && currentUserId && vote.voterId === currentUserId) continue
      result[vote.value] += 1
      result.total += 1
    }
    if (pending?.value) {
      result[pending.value] += 1
      result.total += 1
    }
    if (myVote) result.myVote = myVote
    return result
  }, [votes, pending, currentUserId, myVote])

  // Latest-wins + write chain, mirroring use-reactions.
  const latestRef = useRef(0)
  const chainRef = useRef<Promise<void>>(Promise.resolve())

  const performVote = useCallback(async (value: VoteValue) => {
    if (!hasRelationRecordWriter(connector) || !hasRelationRecords(connector)) return
    if (!isAuthenticatable(connector)) return

    const requestId = ++latestRef.current
    // Optimistic feedback from the rendered state; the WRITE decision below
    // uses freshly read records, so serialized double-clicks resolve against
    // the true current stance, not a stale render.
    setPending({ value: myVote === value ? null : value })

    try {
      const userId = currentUserId ?? (await connector.getCurrentUser())?.id
      if (userId === undefined) {
        if (latestRef.current === requestId) setPending(null)
        return
      }
      const freshRecords = await connector.getRelationRecords({
        predicate: VOTE_PREDICATE,
        to: `item:${statementId}`,
      })
      if (latestRef.current !== requestId) return
      const existingMine = votesFromRelationRecords(freshRecords)
        .find((vote) => vote.voterId === userId)

      if (existingMine) {
        if (existingMine.value === value) {
          // Same stance again — withdraw the own vote.
          if (latestRef.current === requestId) setPending({ value: null })
          await connector.deleteRelationRecord(existingMine.recordId)
        } else {
          // Stance change: update the OWN record — the canonical id stays stable.
          await connector.updateRelationRecord(existingMine.recordId, { fields: { value } })
        }
        return
      }
      const created = await connector.createRelationRecord(voteRecordInput(userId, statementId, value))
      // Idempotent create returns a PRE-EXISTING canonical record UNCHANGED —
      // including one with an invalid or missing fields.value that the
      // validated read path rightly ignores (#211). Detect the mismatch and
      // repair the OWN record, otherwise the optimistic vote never converges.
      if (created.fields?.value !== value) {
        await connector.updateRelationRecord(created.id, { fields: { value } })
      }
    } catch {
      if (latestRef.current === requestId) setPending(null)
    }
  }, [connector, statementId, myVote, currentUserId])

  const vote = useCallback((value: VoteValue) => {
    const next = chainRef.current.then(() => performVote(value))
    chainRef.current = next.catch(() => undefined)
    return next
  }, [performVote])

  return { summary, vote, isLoading: recordsObservable === null, canVote }
}

/** Voter entry for the transparent voter list — votes are transparent by design. */
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

/**
 * Reactive list of voters (with stance) for a statement: subscribes to the
 * vote records and re-resolves display names when the set changes.
 */
export function useVoteUsers(statementId: string, enabled = true): UseVoteUsersResult {
  const connector = useConnector()
  const canRead = hasRelationRecords(connector)
  const recordsObservable = useMemo(
    () => (enabled && canRead
      ? connector.observeRelationRecords({ predicate: VOTE_PREDICATE, to: `item:${statementId}` })
      : null),
    [enabled, canRead, connector, statementId],
  )
  const [records, setRecords] = useState<RelationRecord[]>(recordsObservable?.current ?? [])
  useEffect(() => {
    if (!recordsObservable) return
    setRecords(recordsObservable.current)
    return recordsObservable.subscribe((next) => startTransition(() => setRecords(next)))
  }, [recordsObservable])

  const votes = useMemo(
    () => votesFromRelationRecords(records)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [records],
  )

  const [users, setUsers] = useState<VoteUser[]>([])
  const [isLoading, setIsLoading] = useState(enabled)

  useEffect(() => {
    if (!recordsObservable) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    ;(async () => {
      try {
        const resolved = await Promise.all(
          votes.map(async (vote: VoteRecord) => {
            const user = isAuthenticatable(connector) ? await connector.getUser(vote.voterId) : null
            return {
              id: vote.voterId,
              displayName: user?.displayName ?? vote.voterId,
              avatarUrl: user?.avatarUrl,
              value: vote.value,
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
  }, [connector, recordsObservable, votes])

  return { users, isLoading }
}
