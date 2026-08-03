import type { Item, VoteValue } from "@real-life-stack/data-interface"

/** Sort modes of the Resonance view (docs/spec/modules/resonance.md → Sortierungen). */
export type ResonanceSortMode = "newest" | "votes" | "approval" | "activity"

export interface StatementVoteStats {
  green: number
  yellow: number
  red: number
  total: number
  /** ISO timestamp of the most recent vote, null when unvoted. */
  lastVoteAt: string | null
}

const VOTE_VALUES = new Set<string>(["green", "yellow", "red"])

/**
 * Group vote items by the statement their `votesOn` relation targets.
 * Malformed values and votes without a votesOn relation are ignored —
 * the same tolerance the per-statement aggregation in useVotes applies.
 */
export function aggregateVoteStats(votes: Item[]): Map<string, StatementVoteStats> {
  const stats = new Map<string, StatementVoteStats>()
  for (const item of votes) {
    const value = item.data.value
    if (typeof value !== "string" || !VOTE_VALUES.has(value)) continue
    const target = (item.relations ?? []).find((r) => r.predicate === "votesOn")?.target
    if (!target?.startsWith("item:")) continue
    const statementId = target.slice("item:".length)
    const entry = stats.get(statementId) ?? { green: 0, yellow: 0, red: 0, total: 0, lastVoteAt: null }
    entry[value as VoteValue] += 1
    entry.total += 1
    if (entry.lastVoteAt === null || item.createdAt > entry.lastVoteAt) entry.lastVoteAt = item.createdAt
    stats.set(statementId, entry)
  }
  return stats
}

const EMPTY_STATS: StatementVoteStats = { green: 0, yellow: 0, red: 0, total: 0, lastVoteAt: null }

/** Approval = share of green among all votes; unvoted counts as 0. */
function approvalShare(s: StatementVoteStats): number {
  return s.total === 0 ? 0 : s.green / s.total
}

/**
 * Sort statements per the spec's tiebreaker chains. Comparators return the
 * FIRST non-zero difference in the chain; every chain ends on `createdAt`
 * desc so the order is total and stable across clients.
 */
export function sortStatements(
  statements: Item[],
  stats: Map<string, StatementVoteStats>,
  mode: ResonanceSortMode,
): Item[] {
  const of = (item: Item) => stats.get(item.id) ?? EMPTY_STATS
  const lastVote = (s: StatementVoteStats) => s.lastVoteAt ?? ""
  const chains: Record<ResonanceSortMode, ((a: Item, b: Item) => number)[]> = {
    newest: [
      (a, b) => b.createdAt.localeCompare(a.createdAt),
      (a, b) => lastVote(of(b)).localeCompare(lastVote(of(a))),
      (a, b) => of(b).total - of(a).total,
    ],
    votes: [
      (a, b) => of(b).total - of(a).total,
      (a, b) => approvalShare(of(b)) - approvalShare(of(a)),
      (a, b) => lastVote(of(b)).localeCompare(lastVote(of(a))),
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    ],
    approval: [
      (a, b) => approvalShare(of(b)) - approvalShare(of(a)),
      (a, b) => of(b).total - of(a).total,
      (a, b) => lastVote(of(b)).localeCompare(lastVote(of(a))),
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    ],
    activity: [
      (a, b) => lastVote(of(b)).localeCompare(lastVote(of(a))),
      (a, b) => of(b).total - of(a).total,
      (a, b) => approvalShare(of(b)) - approvalShare(of(a)),
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    ],
  }
  const chain = chains[mode]
  return [...statements].sort((a, b) => {
    for (const compare of chain) {
      const diff = compare(a, b)
      if (diff !== 0) return diff
    }
    return 0
  })
}
