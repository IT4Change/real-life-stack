import { describe, expect, it } from "vitest"
import type { Item } from "@real-life-stack/data-interface"
import { aggregateVoteStats, sortStatements, type StatementVoteStats } from "./resonance-sort"

function statement(id: string, createdAt: string): Item {
  return { id, type: "statement", createdAt, createdBy: "did:key:author", data: { title: id } }
}

function vote(statementId: string, voter: string, value: string, createdAt: string): Item {
  return {
    id: `vote:${statementId}:${voter}`,
    type: "vote",
    createdAt,
    createdBy: voter,
    data: { value },
    relations: [{ predicate: "votesOn", target: `item:${statementId}` }],
  }
}

describe("aggregateVoteStats", () => {
  it("groups votes by their votesOn target and tracks the latest vote time", () => {
    const stats = aggregateVoteStats([
      vote("a", "u1", "green", "2026-08-01T10:00:00.000Z"),
      vote("a", "u2", "red", "2026-08-01T12:00:00.000Z"),
      vote("b", "u1", "yellow", "2026-08-01T11:00:00.000Z"),
    ])
    expect(stats.get("a")).toEqual({ green: 1, yellow: 0, red: 1, total: 2, lastVoteAt: "2026-08-01T12:00:00.000Z" })
    expect(stats.get("b")).toEqual({ green: 0, yellow: 1, red: 0, total: 1, lastVoteAt: "2026-08-01T11:00:00.000Z" })
  })

  it("ignores malformed vote values and votes without a votesOn relation", () => {
    const stats = aggregateVoteStats([
      vote("a", "u1", "purple", "2026-08-01T10:00:00.000Z"),
      { ...vote("a", "u2", "green", "2026-08-01T11:00:00.000Z"), relations: [] },
    ])
    expect(stats.size).toBe(0)
  })
})

describe("sortStatements", () => {
  const s1 = statement("s1", "2026-08-01T09:00:00.000Z") // oldest, most votes, best approval
  const s2 = statement("s2", "2026-08-02T09:00:00.000Z") // middle, latest vote activity
  const s3 = statement("s3", "2026-08-03T09:00:00.000Z") // newest, no votes
  const stats = new Map<string, StatementVoteStats>([
    ["s1", { green: 3, yellow: 0, red: 0, total: 3, lastVoteAt: "2026-08-02T10:00:00.000Z" }],
    ["s2", { green: 1, yellow: 0, red: 1, total: 2, lastVoteAt: "2026-08-03T10:00:00.000Z" }],
  ])

  it("newest: sorts by statement creation date desc", () => {
    expect(sortStatements([s1, s2, s3], stats, "newest").map((s) => s.id)).toEqual(["s3", "s2", "s1"])
  })

  it("votes: sorts by vote count desc, unvoted last", () => {
    expect(sortStatements([s3, s2, s1], stats, "votes").map((s) => s.id)).toEqual(["s1", "s2", "s3"])
  })

  it("approval: sorts by green share desc", () => {
    // s1: 3/3 green, s2: 1/2 green, s3: no votes → 0
    expect(sortStatements([s3, s2, s1], stats, "approval").map((s) => s.id)).toEqual(["s1", "s2", "s3"])
  })

  it("activity: sorts by latest vote desc, unvoted last", () => {
    expect(sortStatements([s1, s3, s2], stats, "activity").map((s) => s.id)).toEqual(["s2", "s1", "s3"])
  })

  it("votes: breaks a count tie by approval share", () => {
    const a = statement("a", "2026-08-01T00:00:00.000Z")
    const b = statement("b", "2026-08-01T00:00:00.000Z")
    const tied = new Map<string, StatementVoteStats>([
      ["a", { green: 1, yellow: 0, red: 1, total: 2, lastVoteAt: "2026-08-01T10:00:00.000Z" }],
      ["b", { green: 2, yellow: 0, red: 0, total: 2, lastVoteAt: "2026-08-01T09:00:00.000Z" }],
    ])
    expect(sortStatements([a, b], tied, "votes").map((s) => s.id)).toEqual(["b", "a"])
  })

  it("does not mutate the input array", () => {
    const input = [s1, s2, s3]
    sortStatements(input, stats, "newest")
    expect(input.map((s) => s.id)).toEqual(["s1", "s2", "s3"])
  })
})
