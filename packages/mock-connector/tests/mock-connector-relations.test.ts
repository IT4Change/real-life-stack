import { describe, expect, it, vi } from "vitest"
import {
  hasRelationRecords,
  hasRelationRecordWriter,
  type Item,
} from "@real-life-stack/data-interface"
import { MockConnector, type MockConnectorSeed } from "../src/index"

const items: Item[] = [
  {
    id: "person-a",
    type: "person",
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "seed",
    data: { displayName: "A" },
  },
  {
    id: "person-b",
    type: "person",
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "seed",
    data: { displayName: "B" },
  },
]

const seed: MockConnectorSeed = {
  items,
  groups: [
    { id: "group-a", name: "A" },
    { id: "group-b", name: "B" },
  ],
  users: [{ id: "did:example:user", displayName: "User" }],
  groupMembers: {
    "group-a": ["did:example:user"],
    "group-b": ["did:example:user"],
  },
  groupItems: {
    "group-a": items.map(({ id }) => id),
    "group-b": items.map(({ id }) => id),
  },
}

async function flushNotifications(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function connector(): MockConnector {
  const connector = new MockConnector(seed, {
    symmetricRelationPredicates: ["knows"],
  })
  connector.setCurrentGroup("group-a")
  return connector
}

describe("MockConnector RelationRecord capabilities", () => {
  it("advertises both read and write capabilities", () => {
    const mock = connector()

    expect(hasRelationRecords(mock)).toBe(true)
    expect(hasRelationRecordWriter(mock)).toBe(true)
  })

  it("proxies idempotent CRUD with authenticated authorship and symmetric ordering", async () => {
    const mock = connector()
    const created = await mock.createRelationRecord({
      predicate: "knows",
      from: "item:person-b",
      to: "item:person-a",
      fields: { strength: 1, note: "initial" },
      confirmationRef: "confirmation-1",
    })
    const duplicate = await mock.createRelationRecord({
      predicate: "knows",
      from: "item:person-a",
      to: "item:person-b",
      fields: { strength: 99 },
    })

    expect(created).toMatchObject({
      id: expect.stringMatching(/^rel-[0-9a-f]{64}$/),
      predicate: "knows",
      from: "item:person-a",
      to: "item:person-b",
      createdBy: "did:example:user",
      fields: { strength: 1, note: "initial" },
      confirmationRef: "confirmation-1",
    })
    expect(duplicate).toEqual(created)

    const updated = await mock.updateRelationRecord(created.id, {
      fields: { strength: 2 },
      confirmationRef: null,
    })
    expect(updated.fields).toEqual({ strength: 2 })
    expect(updated.confirmationRef).toBeUndefined()

    await mock.deleteRelationRecord(created.id)
    expect(await mock.getRelationRecords()).toEqual([])
  })

  it("keeps the same deterministic relation ID independent in each space", async () => {
    const mock = connector()
    const relation = {
      predicate: "knows",
      from: "item:person-a",
      to: "item:person-b",
    }

    const inGroupA = await mock.createRelationRecord({
      ...relation,
      fields: { scope: "a" },
    })

    mock.setCurrentGroup("group-b")
    const inGroupB = await mock.createRelationRecord({
      ...relation,
      fields: { scope: "b" },
    })

    expect(inGroupB.id).toBe(inGroupA.id)
    expect((await mock.getRelationRecords())[0].fields).toEqual({ scope: "b" })
    expect(mock.getItemGroupId(inGroupB.id)).toBe("group-b")

    await mock.updateRelationRecord(inGroupB.id, { fields: { scope: "b-updated" } })
    mock.setCurrentGroup("group-a")
    expect((await mock.getRelationRecords())[0].fields).toEqual({ scope: "a" })

    mock.setCurrentGroup(null)
    expect(await mock.getItem(inGroupA.id)).toBeNull()
    expect(await mock.getItems({ type: "relation" })).toEqual([])

    mock.setCurrentGroup("group-a")
    await mock.deleteRelationRecord(inGroupA.id)
    expect(await mock.getRelationRecords()).toEqual([])

    mock.setCurrentGroup("group-b")
    expect((await mock.getRelationRecords())[0].fields).toEqual({ scope: "b-updated" })
    await mock.deleteRelationRecord(inGroupB.id)
    expect(await mock.getRelationRecords()).toEqual([])
  })

  it("keeps record and neighbor observables reactive", async () => {
    const mock = connector()
    const records = mock.observeRelationRecords({ predicate: "knows" })
    const neighbors = mock.observeRelationNeighbors("item:person-a", "knows")
    const recordListener = vi.fn()
    const neighborListener = vi.fn()
    records.subscribe(recordListener)
    neighbors.subscribe(neighborListener)

    const created = await mock.createRelationRecord({
      predicate: "knows",
      from: "item:person-a",
      to: "item:person-b",
    })
    await flushNotifications()

    expect(records.loaded).toBe(true)
    expect(records.current.map(({ id }) => id)).toEqual([created.id])
    expect(neighbors.loaded).toBe(true)
    expect(neighbors.current.map(({ id }) => id)).toEqual(["person-b"])
    expect(recordListener).toHaveBeenCalled()
    expect(neighborListener).toHaveBeenCalled()

    await mock.deleteRelationRecord(created.id)
    await flushNotifications()
    expect(records.current).toEqual([])
    expect(neighbors.current).toEqual([])
  })

  it("rejects runtime relation writes without an authenticated user", async () => {
    const mock = connector()
    await mock.logout()

    await expect(mock.createRelationRecord({
      predicate: "knows",
      from: "item:person-a",
      to: "item:person-b",
    })).rejects.toThrow()
    expect(await mock.getRelationRecords()).toEqual([])
  })
})

describe("MockConnector — authoritative claim mode (spec 08)", () => {
  it("binds createdBy to the session on the regular ingress and answers trusted", async () => {
    const { hasClaimVerification } = await import("@real-life-stack/data-interface")
    const connector = new MockConnector({
      items: [],
      groups: [{ id: "g1", name: "G", data: {} }],
      users: [{ id: "user-1", displayName: "One" }],
      groupMembers: { g1: ["user-1"] },
      groupItems: {},
    } as never)
    await connector.init()
    const item = await connector.createItem({ type: "note", createdBy: "user-mallory", data: {} })
    expect(item.createdBy).toBe("user-1")
    expect(hasClaimVerification(connector)).toBe(true)
    const record = await connector.createRelationRecord({ predicate: "votesOn", from: "global:user-1", to: "item:s1" })
    expect(await connector.verifyRecordClaim!(record)).toBe("trusted")
  })

  it("fixture mode keeps foreign authors and drops the capability", async () => {
    const { hasClaimVerification } = await import("@real-life-stack/data-interface")
    const connector = new MockConnector({
      items: [],
      groups: [{ id: "g1", name: "G", data: {} }],
      users: [{ id: "user-1", displayName: "One" }],
      groupMembers: { g1: ["user-1"] },
      groupItems: {},
    } as never, { allowFixtureAuthors: true })
    await connector.init()
    const item = await connector.createItem({ type: "note", createdBy: "user-mallory", data: {} })
    expect(item.createdBy).toBe("user-mallory")
    expect(hasClaimVerification(connector)).toBe(false)
  })
})
