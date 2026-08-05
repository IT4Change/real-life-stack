import { beforeEach, describe, expect, it } from "vitest"
import {
  deriveRelationRecordId,
  hasClaimVerification,
  voteRecordInput,
  votesFromRelationRecords,
  VOTE_PREDICATE,
} from "@real-life-stack/data-interface"
import { SupabaseConnector } from "../src/supabase-connector.js"
import { FakeSupabaseClient } from "./fake-client.js"

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function makeConnector(options?: { allowFixtureAuthors?: boolean }) {
  const client = new FakeSupabaseClient()
  client.serviceRole = options?.allowFixtureAuthors === true
  const connector = new SupabaseConnector(client, options)
  await connector.init()
  const user = await connector.authenticate("anonymous", {})
  return { client, connector, userId: user.id }
}

describe("SupabaseConnector — authoritative author binding", () => {
  it("createItem binds createdBy to the session, ignoring a foreign caller value", async () => {
    const { connector, userId } = await makeConnector()
    const item = await connector.createItem({ type: "note", createdBy: "user-mallory", data: { title: "x" } })
    expect(item.createdBy).toBe(userId)
    expect((await connector.getItem(item.id))!.createdBy).toBe(userId)
  })

  it("updateItem cannot forge createdBy", async () => {
    const { connector, userId } = await makeConnector()
    const item = await connector.createItem({ type: "note", createdBy: userId, data: { title: "mine" } })
    const updated = await connector.updateItem(item.id, { createdBy: "user-mallory", data: { title: "renamed" } } as never)
    expect(updated.createdBy).toBe(userId)
    expect(updated.data).toEqual({ title: "renamed" })
    expect((await connector.getItem(item.id))!.createdBy).toBe(userId)
  })

  it("authoritative mode answers trusted; the fixture path loses the capability", async () => {
    const { connector, userId } = await makeConnector()
    const record = await connector.createRelationRecord(voteRecordInput(userId, "s1", "green"))
    expect(hasClaimVerification(connector)).toBe(true)
    expect(await connector.verifyRecordClaim!(record)).toBe("trusted")

    const fixture = await makeConnector({ allowFixtureAuthors: true })
    expect(hasClaimVerification(fixture.connector)).toBe(false)
  })

  it("fixture mode keeps foreign authors (service-role parity for suite seeding)", async () => {
    const { connector } = await makeConnector({ allowFixtureAuthors: true })
    const item = await connector.createItem({ type: "note", createdBy: "user-mallory", data: {} })
    expect(item.createdBy).toBe("user-mallory")
  })

  it("createItem without a session fails instead of writing unbound rows", async () => {
    const client = new FakeSupabaseClient()
    const connector = new SupabaseConnector(client)
    await connector.init()
    await expect(connector.createItem({ type: "note", createdBy: "anyone", data: {} }))
      .rejects.toThrow(/authenticated/)
  })
})

describe("SupabaseConnector — vote relation store contract", () => {
  it("stamps createdBy from the session and derives the canonical id", async () => {
    const { connector, userId } = await makeConnector()
    const record = await connector.createRelationRecord(voteRecordInput(userId, "s1", "green"))
    expect(record.id).toBe(await deriveRelationRecordId(userId, VOTE_PREDICATE, `global:${userId}`, "item:s1"))
    expect(record.createdBy).toBe(userId)
    expect(record.fields).toEqual({ value: "green" })
  })

  it("is idempotent for the own tuple and readable through the projection", async () => {
    const { connector, userId } = await makeConnector()
    const first = await connector.createRelationRecord(voteRecordInput(userId, "s1", "green"))
    const again = await connector.createRelationRecord(voteRecordInput(userId, "s1", "green"))
    expect(again.id).toBe(first.id)
    const votes = votesFromRelationRecords(await connector.getRelationRecords({ predicate: VOTE_PREDICATE }))
    expect(votes).toEqual([
      expect.objectContaining({ statementId: "s1", voterId: userId, value: "green" }),
    ])
  })

  it("fails on a pre-seeded canonical id with a foreign identity — no takeover", async () => {
    const { connector, userId } = await makeConnector({ allowFixtureAuthors: true })
    const id = await deriveRelationRecordId(userId, VOTE_PREDICATE, `global:${userId}`, "item:s1")
    await connector.createItem({
      id,
      type: "relation",
      createdBy: "user-bob",
      data: { predicate: VOTE_PREDICATE, value: "red" },
      relations: [
        { predicate: "from", target: "global:user-bob" },
        { predicate: "to", target: "item:s1" },
      ],
    })
    await expect(connector.createRelationRecord(voteRecordInput(userId, "s1", "green"))).rejects.toThrow(/collision/i)
  })

  it("refuses to update or delete another author's record", async () => {
    const { connector } = await makeConnector({ allowFixtureAuthors: true })
    const bobsId = await deriveRelationRecordId("user-bob", VOTE_PREDICATE, "global:user-bob", "item:s1")
    await connector.createItem({
      id: bobsId,
      type: "relation",
      createdBy: "user-bob",
      data: { predicate: VOTE_PREDICATE, value: "red" },
      relations: [
        { predicate: "from", target: "global:user-bob" },
        { predicate: "to", target: "item:s1" },
      ],
    })
    await expect(connector.updateRelationRecord(bobsId, { fields: { value: "green" } })).rejects.toThrow(/authorized/i)
    await expect(connector.deleteRelationRecord(bobsId)).rejects.toThrow(/authorized/i)
    expect(await connector.getItem(bobsId)).not.toBeNull()
  })

  it("creates the vote in the STATEMENT's group when voting from the overview", async () => {
    const { connector, userId } = await makeConnector()
    const group = await connector.createGroup("Sol-Runde")
    connector.setCurrentGroup(group.id)
    const statement = await connector.createItem({ type: "statement", createdBy: userId, data: { title: "Zweiter Brunnen" } })
    connector.setCurrentGroup(null) // overview
    const record = await connector.createRelationRecord(voteRecordInput(userId, statement.id, "green"))
    expect(await connector.getItem(record.id)).not.toBeNull()
    // The record's row must carry the statement's group scope.
    const groupId = (connectorClientRows(connector) ?? []).find((r) => r.id === record.id)?.group_id
    expect(groupId).toBe(group.id)
  })
})

/** Reach into the fake for row-level assertions (group scoping). */
function connectorClientRows(connector: SupabaseConnector): Array<Record<string, unknown>> | null {
  const client = (connector as unknown as { client: FakeSupabaseClient }).client
  return client instanceof FakeSupabaseClient ? client.tables.get("items")! : null
}

describe("SupabaseConnector — realtime reactivity (WoT-grade observe)", () => {
  it("observe reflects an EXTERNAL insert delivered via postgres_changes", async () => {
    const { client, connector, userId } = await makeConnector()
    const observable = connector.observe({ type: "note" })
    await flush()
    expect(observable.current).toEqual([])
    expect(observable.loaded).toBe(true)

    client.externalInsert("items", {
      id: "ext-1", type: "note", created_by: userId,
      context: null, schema: null, schema_version: null,
      data: { title: "von woanders" }, relations: null, tags: null, group_id: null,
    })
    await flush()
    expect(observable.current.map(({ id }) => id)).toEqual(["ext-1"])
  })

  it("observeItem follows external updates and deletes", async () => {
    const { client, connector, userId } = await makeConnector()
    const item = await connector.createItem({ type: "note", createdBy: userId, data: { title: "v1" } })
    const observable = connector.observeItem(item.id)
    await flush()
    expect(observable.current?.data).toEqual({ title: "v1" })

    // External content change (as another client would produce it).
    const row = client.tables.get("items")!.find((r) => r.id === item.id)!
    row.data = { title: "v2" }
    client.emit("items", { eventType: "UPDATE", new: { ...row }, old: { ...row } })
    await flush()
    expect(observable.current?.data).toEqual({ title: "v2" })
  })

  it("observeRelationRecords updates live when a vote arrives externally", async () => {
    const { client, connector, userId } = await makeConnector()
    const observable = connector.observeRelationRecords({ predicate: VOTE_PREDICATE, to: "item:s1" })
    await flush()
    expect(observable.current).toEqual([])

    const bobsId = await deriveRelationRecordId("user-bob", VOTE_PREDICATE, "global:user-bob", "item:s1")
    client.externalInsert("items", {
      id: bobsId, type: "relation", created_by: "user-bob",
      context: null, schema: null, schema_version: null,
      data: { predicate: VOTE_PREDICATE, value: "green" },
      relations: [
        { predicate: "from", target: "global:user-bob" },
        { predicate: "to", target: "item:s1" },
      ],
      tags: null, group_id: null,
    })
    await flush()
    expect(observable.current.map(({ id }) => id)).toEqual([bobsId])
    void userId
  })

  it("many realtime events in one tick coalesce into one refresh round", async () => {
    const { client, connector, userId } = await makeConnector()
    let fetches = 0
    const original = connector.getItems.bind(connector)
    connector.getItems = async (filter) => { fetches += 1; return original(filter) }
    connector.observe({ type: "note" })
    await flush()
    const before = fetches
    for (let i = 0; i < 20; i += 1) {
      client.emit("items", { eventType: "INSERT", new: { id: `burst-${i}` }, old: null })
    }
    await flush()
    expect(fetches - before).toBe(1)
    void userId
  })
})

describe("SupabaseConnector — groups and auth", () => {
  it("createGroup binds the creator, joins them as member, isAdmin follows created_by", async () => {
    const { connector, userId } = await makeConnector()
    const group = await connector.createGroup("Crew")
    expect(group.members).toEqual([userId])
    const members = await connector.getMembers(group.id)
    expect(members).toEqual([expect.objectContaining({ id: userId, isAdmin: true })])
  })

  it("email signup → logout → password login keeps the identity; profile carries displayName", async () => {
    const client = new FakeSupabaseClient()
    const connector = new SupabaseConnector(client)
    await connector.init()
    const created = await connector.authenticate("email-signup", { email: "a@b.de", password: "pw", displayName: "Anton" })
    expect(created.displayName).toBe("Anton")
    await connector.logout()
    expect(await connector.getCurrentUser()).toBeNull()
    const back = await connector.authenticate("email", { email: "a@b.de", password: "pw" })
    expect(back.id).toBe(created.id)
    await expect(connector.authenticate("email", { email: "a@b.de", password: "wrong" })).rejects.toThrow(/Invalid/)
  })

  it("auth state observable transitions through the session lifecycle", async () => {
    const client = new FakeSupabaseClient()
    const connector = new SupabaseConnector(client)
    await connector.init()
    expect(connector.getAuthState().current).toEqual({ status: "unauthenticated" })
    const user = await connector.authenticate("anonymous", {})
    expect(connector.getAuthState().current).toEqual({ status: "authenticated", user })
    expect(connector.observeCurrentUser().current).toEqual(user)
    await connector.logout()
    expect(connector.getAuthState().current).toEqual({ status: "unauthenticated" })
    expect(connector.observeCurrentUser().current).toBeNull()
  })
})

describe("SupabaseConnector — item queries against the fake store", () => {
  let context: Awaited<ReturnType<typeof makeConnector>>

  beforeEach(async () => {
    context = await makeConnector()
  })

  it("roundtrips data, tags, @context and relations through create → getItem", async () => {
    const { connector, userId } = context
    const created = await connector.createItem({
      type: "rt",
      createdBy: userId,
      "@context": ["https://real-life-stack.org/vocab/statement/v1"],
      data: { title: "roundtrip", nested: { deep: true } },
      tags: ["t1"],
      relations: [{ predicate: "relatesTo", target: "item:x" }],
    })
    const read = (await connector.getItem(created.id))!
    expect(read.data).toEqual({ title: "roundtrip", nested: { deep: true } })
    expect(read.tags).toEqual(["t1"])
    expect(read["@context"]).toEqual(["https://real-life-stack.org/vocab/statement/v1"])
    expect(read.relations).toEqual([{ predicate: "relatesTo", target: "item:x" }])
    expect(read.createdBy).toBe(userId)
  })

  it("deleteItem removes; updateItem replaces data", async () => {
    const { connector, userId } = context
    const created = await connector.createItem({ type: "ud", createdBy: userId, data: { title: "old", stale: 1 } })
    const updated = await connector.updateItem(created.id, { data: { title: "new" } })
    expect(updated.data).toEqual({ title: "new" })
    await connector.deleteItem(created.id)
    expect(await connector.getItem(created.id)).toBeNull()
  })
})
