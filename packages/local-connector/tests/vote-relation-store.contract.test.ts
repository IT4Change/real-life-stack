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
  /** Fixture-mode twin for cases that SEED foreign-author records — the
      authoritative default binds createdBy, so "manipulated client" states
      can only exist through the marked fixture path. */
  let fixtureConnector: LocalConnector

  async function makeConnector(options?: { allowFixtureAuthors?: boolean }): Promise<LocalConnector> {
    const instance = new LocalConnector({
      items: [],
      groups: [{ id: "g1", name: "Test Group" }],
      users: [
        { id: ALICE, displayName: "Alice" },
        { id: BOB, displayName: "Bob" },
      ],
      groupMembers: { g1: [ALICE, BOB] },
    }, options)
    await instance.init()
    await instance.authenticate("local", {})
    return instance
  }

  beforeEach(async () => {
    connector = await makeConnector()
    fixtureConnector = await makeConnector({ allowFixtureAuthors: true })
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
    const connector = fixtureConnector
    const me = (await connector.getCurrentUser())!.id
    const id = await deriveRelationRecordId(me, VOTE_PREDICATE, `global:${me}`, "item:s1")
    // A manipulated client squatted the canonical key with different content
    // via the raw item API (only reachable through the fixture path).
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

  it("authoritative mode: binds createdBy to the session on the regular ingress and answers trusted", async () => {
    const me = await currentUserId()
    // Regular ingress: a caller-supplied foreign createdBy is BOUND to the
    // session (spec 08: trusted requires every ingress path to bind).
    const item = await connector.createItem({ type: "note", createdBy: "user-mallory", data: { title: "x" } })
    expect(item.createdBy).toBe(me)
    const record = await connector.createRelationRecord(voteRecordInput(me, "s-trust", "green"))
    expect(await connector.verifyRecordClaim(record)).toBe("trusted")
  })

  it("updateItem cannot forge createdBy on the regular ingress (#235 review)", async () => {
    const me = await currentUserId()
    const item = await connector.createItem({ type: "note", createdBy: me, data: { title: "mine" } })
    const updated = await connector.updateItem(item.id, { createdBy: "user-mallory", data: { title: "renamed" } } as never)
    expect(updated.createdBy).toBe(me)
    expect((await connector.getItem(item.id))!.createdBy).toBe(me)
  })

  it("fixture mode (allowFixtureAuthors) keeps foreign authors but has NO claim verdict", async () => {
    const fixture = new LocalConnector({
      items: [],
      groups: [{ id: "g1", name: "Fixture" }],
      users: [{ id: ALICE, displayName: "Alice" }],
      groupMembers: { g1: [ALICE] },
    }, { allowFixtureAuthors: true })
    await fixture.init()
    await fixture.authenticate("local", {})
    const item = await fixture.createItem({ type: "note", createdBy: "user-mallory", data: {} })
    expect(item.createdBy).toBe("user-mallory")
    const { hasClaimVerification } = await import("@real-life-stack/data-interface")
    expect(hasClaimVerification(fixture)).toBe(false)
  })

  it("refuses to update or delete another author's record", async () => {
    const connector = fixtureConnector
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
