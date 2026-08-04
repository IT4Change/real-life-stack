import { describe, expect, it } from "vitest"
import { deriveActivitySummary, type Item, type RelationRecord } from "../src/index"
import {
  VOTE_PREDICATE,
  voteFromRelationRecord,
  voteRecordInput,
  votesFromRelationRecords,
} from "../src/votes"

const ALICE = "did:key:alice"
const BOB = "did:key:bob"

function record(overrides: Partial<RelationRecord> = {}): RelationRecord {
  return {
    id: "rel-aaaa",
    predicate: VOTE_PREDICATE,
    from: `global:${ALICE}`,
    to: "item:statement-1",
    fields: { value: "green" },
    createdBy: ALICE,
    createdAt: "2026-08-04T10:00:00.000Z",
    ...overrides,
  }
}

describe("voteFromRelationRecord", () => {
  it("projects a canonical votesOn record", () => {
    expect(voteFromRelationRecord(record())).toEqual({
      recordId: "rel-aaaa",
      statementId: "statement-1",
      voterId: ALICE,
      value: "green",
      createdAt: "2026-08-04T10:00:00.000Z",
    })
  })

  it("rejects records whose from endpoint is not the author — no voting in someone else's name", () => {
    // A forged record claiming Alice's endpoint but written by Bob is invalid.
    expect(voteFromRelationRecord(record({ createdBy: BOB }))).toBeNull()
    expect(voteFromRelationRecord(record({ from: `global:${BOB}` }))).toBeNull()
  })

  it("rejects non-vote predicates, non-item targets and malformed values", () => {
    expect(voteFromRelationRecord(record({ predicate: "reactsTo" }))).toBeNull()
    expect(voteFromRelationRecord(record({ to: `global:${BOB}` }))).toBeNull()
    expect(voteFromRelationRecord(record({ to: "item:" }))).toBeNull()
    expect(voteFromRelationRecord(record({ fields: { value: "purple" } }))).toBeNull()
    expect(voteFromRelationRecord(record({ fields: {} }))).toBeNull()
  })
})

describe("votesFromRelationRecords", () => {
  it("counts at most ONE vote per (statement, voter) — deterministically, regardless of order", () => {
    // A manipulated client wrote a second record for the same tuple under a
    // different id. Only one may ever count, and every client must pick the
    // SAME one (stable aggregation across sync orders).
    const first = record({ id: "rel-bbbb", fields: { value: "green" } })
    const second = record({ id: "rel-aaaa", fields: { value: "red" } })
    const forward = votesFromRelationRecords([first, second])
    const reverse = votesFromRelationRecords([second, first])
    expect(forward).toEqual(reverse)
    expect(forward).toHaveLength(1)
    expect(forward[0]?.recordId).toBe("rel-aaaa")
  })

  it("breaks a tie between SAME-ID records (cross-space legacy copies) deterministically by value", () => {
    // Spec 08: relation ids are space-local — the same canonical id may exist
    // as two edges in two spaces (e.g. a pre-fix legacy vote in the private
    // space). With identical ids the id-tiebreak cannot decide; the value
    // comparison must, so aggregation stays order-independent.
    const inTargetSpace = record({ id: "rel-aaaa", fields: { value: "red" } })
    const legacyCopy = record({ id: "rel-aaaa", fields: { value: "green" } })
    const forward = votesFromRelationRecords([inTargetSpace, legacyCopy])
    const reverse = votesFromRelationRecords([legacyCopy, inTargetSpace])
    expect(forward).toEqual(reverse)
    expect(forward).toHaveLength(1)
    expect(forward[0]?.value).toBe("green")
  })

  it("keeps distinct voters and distinct statements apart", () => {
    const votes = votesFromRelationRecords([
      record(),
      record({ id: "rel-bbbb", from: `global:${BOB}`, createdBy: BOB, fields: { value: "red" } }),
      record({ id: "rel-cccc", to: "item:statement-2", fields: { value: "yellow" } }),
    ])
    expect(votes).toHaveLength(3)
  })

  it("drops invalid records entirely", () => {
    const votes = votesFromRelationRecords([
      record({ predicate: "reactsTo" }),
      record({ id: "rel-bbbb", createdBy: BOB }),
    ])
    expect(votes).toEqual([])
  })
})

describe("activity summary for vote records", () => {
  it("labels the stance and resolves the statement via the to-endpoint", () => {
    const statement: Item = {
      id: "statement-1",
      type: "statement",
      createdAt: "2026-08-04T09:00:00.000Z",
      createdBy: BOB,
      data: { title: "Wir brauchen einen zweiten Brunnen" },
    }
    const voteItem: Item = {
      id: "rel-aaaa",
      type: "relation",
      createdAt: "2026-08-04T10:00:00.000Z",
      createdBy: ALICE,
      data: { predicate: VOTE_PREDICATE, value: "green" },
      relations: [
        { predicate: "from", target: `global:${ALICE}` },
        { predicate: "to", target: "item:statement-1" },
      ],
    }
    const summary = deriveActivitySummary(voteItem, (id) => (id === "statement-1" ? statement : undefined))
    expect(summary).toBe('Zustimmung zu „Wir brauchen einen zweiten Brunnen"')
  })
})

describe("voteRecordInput", () => {
  it("builds the canonical author-bound input", () => {
    expect(voteRecordInput(ALICE, "statement-1", "yellow")).toEqual({
      predicate: VOTE_PREDICATE,
      from: `global:${ALICE}`,
      to: "item:statement-1",
      fields: { value: "yellow" },
    })
  })
})
