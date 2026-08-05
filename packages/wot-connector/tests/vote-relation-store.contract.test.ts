import { beforeAll, describe, expect, it, vi } from "vitest"
import {
  createObservable,
  deriveRelationRecordId,
  verifyRelationClaim,
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

// Real Ed25519 identities: the signed mode verifies claims for real, so the
// harness needs resolvable did:key DIDs and a working signer.
interface TestIdentity { did: string; signEd25519(bytes: Uint8Array): Promise<Uint8Array> }
let alice: TestIdentity
let bob: TestIdentity
let ALICE: string
let BOB: string

async function makeIdentity(): Promise<TestIdentity> {
  const keyPair = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey))
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
  const bytes = new Uint8Array([0xed, 0x01, ...raw])
  let n = 0n
  for (const byte of bytes) n = (n << 8n) | BigInt(byte)
  let encoded = ""
  while (n > 0n) { encoded = B58[Number(n % 58n)] + encoded; n /= 58n }
  return {
    did: `did:key:z${encoded}`,
    signEd25519: async (input: Uint8Array) =>
      new Uint8Array(await crypto.subtle.sign("Ed25519", keyPair.privateKey, input as BufferSource)),
  }
}

beforeAll(async () => {
  alice = await makeIdentity()
  bob = await makeIdentity()
  ALICE = alice.did
  BOB = bob.did
})

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
  value.identity = { getDid: () => ALICE, signEd25519: alice.signEd25519 }
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

  it("creates the vote in the STATEMENT's space when voting from the overview — not the private space", async () => {
    // Overview aggregates items across spaces; createItem there writes to the
    // PRIVATE space. A vote must instead land next to its statement, or other
    // members never see it and the own stance vanishes inside the group view.
    const privateSpace = handle()
    const statementSpace = handle()
    statementSpace.value.items["s1"] = {
      id: "s1",
      type: "statement",
      createdBy: BOB,
      createdAt: "2026-08-04T09:00:00.000Z",
      data: { title: "Zweiter Brunnen" },
    }
    const { connector: c } = connector(privateSpace)
    const anyC = c as any
    anyC.currentGroupId = null // overview
    anyC.crossGroupIndex = {
      getItemGroupId: (id: string) => (id === "s1" ? "space-b" : null),
      reindexGroup: vi.fn(),
    }
    anyC.replication = {
      openSpace: vi.fn(async (id: string) => {
        if (id !== "space-b") throw new Error(`unexpected space ${id}`)
        return statementSpace
      }),
    }

    const record = await c.createRelationRecord(voteRecordInput(ALICE, "s1", "green"))

    expect(statementSpace.value.items[record.id]).toMatchObject({ type: "relation", createdBy: ALICE })
    expect(privateSpace.value.items[record.id]).toBeUndefined()
  })

  it("space-local uniqueness (spec 08): a same-id record in ANOTHER space does not block the create in the target space", async () => {
    // Relation ids are space-local — the same tuple in two spaces is two
    // edges, and cross-space indexes key by (spaceId, id). A legacy copy in
    // the private space (pre-fix overview votes) must neither block the
    // correctly-scoped create nor be touched by it; ambiguity is handled
    // fail-closed by CrossGroupIndex.getUniqueById (tested in
    // cross-group-index.test.ts).
    const privateSpace = handle()
    const statementSpace = handle()
    statementSpace.value.items["s1"] = {
      id: "s1",
      type: "statement",
      createdBy: BOB,
      createdAt: "2026-08-04T09:00:00.000Z",
      data: { title: "Zweiter Brunnen" },
    }
    const canonicalId = await deriveRelationRecordId(ALICE, VOTE_PREDICATE, `global:${ALICE}`, "item:s1")
    privateSpace.value.items[canonicalId] = {
      id: canonicalId,
      type: "relation",
      createdBy: ALICE,
      createdAt: "2026-08-01T09:00:00.000Z",
      data: { predicate: VOTE_PREDICATE, value: "green" },
      relations: [
        { predicate: "from", target: `global:${ALICE}` },
        { predicate: "to", target: "item:s1" },
      ],
    }
    const { connector: c } = connector(privateSpace)
    const anyC = c as any
    anyC.currentGroupId = null
    anyC.crossGroupIndex = {
      getItemGroupId: (id: string) => (id === "s1" ? "space-b" : null),
      reindexGroup: vi.fn(),
    }
    anyC.replication = { openSpace: vi.fn(async () => statementSpace) }

    const record = await c.createRelationRecord(voteRecordInput(ALICE, "s1", "red"))

    expect(record.id).toBe(canonicalId)
    expect(statementSpace.value.items[canonicalId]).toMatchObject({ type: "relation", createdBy: ALICE })
    // The legacy edge in the other space is left untouched.
    expect((privateSpace.value.items[canonicalId] as { data: { value: string } }).data.value).toBe("green")
  })

  it("signed mode: a created vote carries a claim that verifies as valid", async () => {
    const { connector: c } = connector()
    const record = await c.createRelationRecord(voteRecordInput(ALICE, "s1", "green"))
    expect(typeof record.claim).toBe("string")
    expect(await verifyRelationClaim(record)).toBe("valid")
    expect(await c.verifyRecordClaim(record)).toBe("valid")
  })

  it("signed mode WITHOUT an identity refuses authorial writes — never writes unsigned", async () => {
    const { connector: c, handle: h } = connector()
    const anyC = c as any
    anyC.currentUserObs = createObservable(null)
    await expect(c.createRelationRecord(voteRecordInput(ALICE, "s1", "green"))).rejects.toThrow(/sign|identity|authenticated/i)
    expect(Object.keys(h.value.items)).toHaveLength(0)
  })

  it("verifyRecordClaim: a raw-seeded unsigned record is invalid (fail closed)", async () => {
    const { connector: c, handle: h } = connector()
    const id = await deriveRelationRecordId(BOB, VOTE_PREDICATE, `global:${BOB}`, "item:s1")
    h.value.items[id] = {
      id, type: "relation", createdBy: BOB,
      createdAt: "2026-08-05T09:00:00.000Z",
      data: { predicate: VOTE_PREDICATE, value: "red" },
      relations: [
        { predicate: "from", target: `global:${BOB}` },
        { predicate: "to", target: "item:s1" },
      ],
    }
    const records = await c.getRelationRecords({ predicate: VOTE_PREDICATE })
    const seeded = records.find((candidate) => candidate.id === id)!
    expect(await c.verifyRecordClaim(seeded)).toBe("invalid")
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
