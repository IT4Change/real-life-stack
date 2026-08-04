import { describe, expect, it, vi } from "vitest"
import {
  createObservable,
  deriveRelationRecordId,
  voteRecordInput,
  votesFromRelationRecords,
  VOTE_PREDICATE,
} from "@real-life-stack/data-interface"
import { WotConnector } from "../src/wot-connector.js"
import type { RlsSpaceDoc } from "../src/types.js"

/**
 * Contract: the relation store is the auth-bound write path for votes
 * (docs/spec/08-relation-records.md, resonance.md). `createdBy` comes from the
 * authenticated identity only, the canonical id binds (voter, statement), a
 * pre-seeded id with a foreign identity FAILS instead of succeeding
 * idempotently, and update/delete require authorship.
 */

const ALICE = "did:key:alice"
const BOB = "did:key:bob"

function doc(): RlsSpaceDoc {
  return { _type: "rls", items: {}, metadata: { name: "test", modules: [] } }
}

function handle(value = doc()) {
  return {
    value,
    getDoc: () => value,
    transact: vi.fn((fn: (next: RlsSpaceDoc) => void) => { fn(value) }),
    transactDurable: vi.fn(async (fn: (next: RlsSpaceDoc) => void) => { fn(value) }),
    onRemoteUpdate: () => () => {},
    close: vi.fn(),
  }
}

/** Production methods, faked only at the adapter boundary (activity-log harness pattern). */
function connector(current = handle()) {
  const value = Object.create(WotConnector.prototype) as any
  value.handleReady = Promise.resolve()
  value.currentHandle = current
  value.currentGroupId = "space"
  value.currentUserObs = createObservable({ id: ALICE, displayName: "Alice" })
  value.activityObservables = new Map()
  value.activityDirty = false
  value.activityReconciliations = new Map()
  value.handleOpenGeneration = 0
  value.crossGroupIndex = null
  value.notifyAllObservers = vi.fn(() => { value.itemCache = null })
  return { connector: value as WotConnector, handle: current }
}

describe("WotConnector — vote relation store contract", () => {
  it("stamps createdBy from the authenticated identity and derives the canonical id", async () => {
    const { connector: c, handle: h } = connector()
    const record = await c.createRelationRecord(voteRecordInput(ALICE, "s1", "green"))

    const expectedId = await deriveRelationRecordId(ALICE, VOTE_PREDICATE, `global:${ALICE}`, "item:s1")
    expect(record.id).toBe(expectedId)
    expect(record.createdBy).toBe(ALICE)
    expect(record.fields).toEqual({ value: "green" })
    expect(h.value.items[expectedId]).toMatchObject({ type: "relation", createdBy: ALICE })
  })

  it("is idempotent for the OWN tuple and readable through the record projection", async () => {
    const { connector: c } = connector()
    const first = await c.createRelationRecord(voteRecordInput(ALICE, "s1", "green"))
    const again = await c.createRelationRecord(voteRecordInput(ALICE, "s1", "green"))
    expect(again.id).toBe(first.id)

    const votes = votesFromRelationRecords(await c.getRelationRecords({ predicate: VOTE_PREDICATE }))
    expect(votes).toEqual([
      expect.objectContaining({ statementId: "s1", voterId: ALICE, value: "green" }),
    ])
  })

  it("fails on a pre-seeded canonical id with a foreign identity — no idempotent takeover", async () => {
    const { connector: c, handle: h } = connector()
    const id = await deriveRelationRecordId(ALICE, VOTE_PREDICATE, `global:${ALICE}`, "item:s1")
    // A manipulated client squatted Alice's canonical key with different content.
    h.value.items[id] = {
      id,
      type: "relation",
      createdBy: BOB,
      createdAt: "2026-08-04T09:00:00.000Z",
      data: { predicate: VOTE_PREDICATE, value: "red" },
      relations: [
        { predicate: "from", target: `global:${BOB}` },
        { predicate: "to", target: "item:s1" },
      ],
    }
    await expect(c.createRelationRecord(voteRecordInput(ALICE, "s1", "green"))).rejects.toThrow(/collision/i)
  })

  it("refuses to update or delete another author's record", async () => {
    const { connector: c, handle: h } = connector()
    const bobsId = await deriveRelationRecordId(BOB, VOTE_PREDICATE, `global:${BOB}`, "item:s1")
    h.value.items[bobsId] = {
      id: bobsId,
      type: "relation",
      createdBy: BOB,
      createdAt: "2026-08-04T09:00:00.000Z",
      data: { predicate: VOTE_PREDICATE, value: "red" },
      relations: [
        { predicate: "from", target: `global:${BOB}` },
        { predicate: "to", target: "item:s1" },
      ],
    }
    await expect(c.updateRelationRecord(bobsId, { fields: { value: "green" } })).rejects.toThrow(/authorized/i)
    await expect(c.deleteRelationRecord(bobsId)).rejects.toThrow(/authorized/i)
    expect(h.value.items[bobsId]).toBeDefined()
  })
})
