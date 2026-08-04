import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  deriveRelationRecordId,
  voteRecordInput,
  votesFromRelationRecords,
  VOTE_PREDICATE,
} from "@real-life-stack/data-interface"

// Mock idb-keyval (no IndexedDB in Node)
vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn(async (_key: string, updater: (value: unknown) => unknown) => { updater(undefined) }),
  del: vi.fn().mockResolvedValue(undefined),
  createStore: vi.fn().mockReturnValue({}),
}))

// Mock BroadcastChannel (not available in Node)
vi.stubGlobal("BroadcastChannel", class {
  onmessage = null
  postMessage() {}
  close() {}
})

import { LocalConnector } from "../src/local-connector.js"

const ALICE = "user-alice"
const BOB = "user-bob"

/**
 * Contract: the relation store is the auth-bound write path for votes —
 * same assertions as the WotConnector contract test.
 */
describe("LocalConnector — vote relation store contract", () => {
  let connector: LocalConnector

  beforeEach(async () => {
    connector = new LocalConnector({
      items: [],
      groups: [{ id: "g1", name: "Test Group" }],
      users: [
        { id: ALICE, displayName: "Alice" },
        { id: BOB, displayName: "Bob" },
      ],
      groupMembers: { g1: [ALICE, BOB] },
    })
    await connector.init()
    await connector.authenticate("local", {})
  })

  async function currentUserId(): Promise<string> {
    const user = await connector.getCurrentUser()
    if (!user) throw new Error("no authenticated user in harness")
    return user.id
  }

  it("stamps createdBy from the authenticated identity and derives the canonical id", async () => {
    const me = await currentUserId()
    const record = await connector.createRelationRecord(voteRecordInput(me, "s1", "green"))
    const expectedId = await deriveRelationRecordId(me, VOTE_PREDICATE, `global:${me}`, "item:s1")
    expect(record.id).toBe(expectedId)
    expect(record.createdBy).toBe(me)
    expect(record.fields).toEqual({ value: "green" })
  })

  it("is idempotent for the OWN tuple and readable through the record projection", async () => {
    const me = await currentUserId()
    const first = await connector.createRelationRecord(voteRecordInput(me, "s1", "green"))
    const again = await connector.createRelationRecord(voteRecordInput(me, "s1", "green"))
    expect(again.id).toBe(first.id)

    const votes = votesFromRelationRecords(await connector.getRelationRecords({ predicate: VOTE_PREDICATE }))
    expect(votes).toEqual([
      expect.objectContaining({ statementId: "s1", voterId: me, value: "green" }),
    ])
  })

  it("fails on a pre-seeded canonical id with a foreign identity — no idempotent takeover", async () => {
    const me = await currentUserId()
    const id = await deriveRelationRecordId(me, VOTE_PREDICATE, `global:${me}`, "item:s1")
    // A manipulated client squatted the canonical key with different content
    // via the raw item API.
    await connector.createItem({
      id,
      type: "relation",
      createdBy: BOB,
      data: { predicate: VOTE_PREDICATE, value: "red" },
      relations: [
        { predicate: "from", target: `global:${BOB}` },
        { predicate: "to", target: "item:s1" },
      ],
    })
    await expect(connector.createRelationRecord(voteRecordInput(me, "s1", "green"))).rejects.toThrow(/collision/i)
  })

  it("creates the vote in the STATEMENT's group when voting from the overview", async () => {
    // Overview aggregates items across groups: a vote cast there must land
    // NEXT TO the statement (its owner group), not scope-less — otherwise
    // other members never see it.
    const me = await currentUserId()
    connector.setCurrentGroup("g1")
    const statement = await connector.createItem({
      type: "statement",
      createdBy: me,
      data: { title: "Zweiter Brunnen" },
    })
    connector.setCurrentGroup(null) // overview
    const record = await connector.createRelationRecord(voteRecordInput(me, statement.id, "green"))
    expect(connector.getItemGroupId(record.id)).toBe("g1")
  })

  it("refuses to update or delete another author's record", async () => {
    const me = await currentUserId()
    const bobsId = await deriveRelationRecordId(BOB, VOTE_PREDICATE, `global:${BOB}`, "item:s1")
    await connector.createItem({
      id: bobsId,
      type: "relation",
      createdBy: BOB,
      data: { predicate: VOTE_PREDICATE, value: "red" },
      relations: [
        { predicate: "from", target: `global:${BOB}` },
        { predicate: "to", target: "item:s1" },
      ],
    })
    await expect(connector.updateRelationRecord(bobsId, { fields: { value: "green" } })).rejects.toThrow(/authorized/i)
    await expect(connector.deleteRelationRecord(bobsId)).rejects.toThrow(/authorized/i)
    expect(await connector.getItem(bobsId)).not.toBeNull()
  })
})
