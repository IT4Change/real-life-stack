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
  groups: [{ id: "group-a", name: "A" }],
  users: [{ id: "did:example:user", displayName: "User" }],
  groupMembers: { "group-a": ["did:example:user"] },
  groupItems: { "group-a": items.map(({ id }) => id) },
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
