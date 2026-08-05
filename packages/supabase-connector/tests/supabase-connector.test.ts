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

  it("re-joins the realtime channels on auth change — subscriptions carry the session claims", async () => {
    // A channel joined as `anon` yields no events under `to authenticated`
    // RLS (live finding): after login the connector must join FRESH channels.
    const client = new FakeSupabaseClient()
    const connector = new SupabaseConnector(client)
    await connector.init()
    const preAuthChannels = [...client.channels]
    await connector.authenticate("anonymous", {})
    expect(client.channels.length).toBe(preAuthChannels.length)
    for (const channel of client.channels) {
      expect(preAuthChannels).not.toContain(channel)
    }
    // And the re-joined channels still drive observe() refreshes.
    const observable = connector.observe({ type: "note" })
    await flush()
    client.externalInsert("items", {
      id: "post-login-1", type: "note", created_by: "someone",
      context: null, schema: null, schema_version: null, data: {}, relations: null, tags: null, group_id: null,
    })
    await flush()
    expect(observable.current.map(({ id }) => id)).toEqual(["post-login-1"])
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

describe("SupabaseConnector — group scope on read paths (#238 review)", () => {
  async function makeTwoGroupWorld() {
    const world = await makeConnector()
    const { connector, userId } = world
    const groupA = await connector.createGroup("Gruppe A")
    const groupB = await connector.createGroup("Gruppe B")
    connector.setCurrentGroup(groupA.id)
    const inA = await connector.createItem({ type: "scope-probe", createdBy: userId, data: { title: "a" } })
    connector.setCurrentGroup(groupB.id)
    const inB = await connector.createItem({ type: "scope-probe", createdBy: userId, data: { title: "b" } })
    return { ...world, groupA, groupB, inA, inB }
  }

  it("getItems respects the selected group scope (reviewer counter-repro)", async () => {
    const { connector, groupB, inB } = await makeTwoGroupWorld()
    connector.setCurrentGroup(groupB.id)
    const items = await connector.getItems({ type: "scope-probe" })
    expect(items.map(({ id }) => id)).toEqual([inB.id])
  })

  it("the overview (no group) still sees everything", async () => {
    const { connector, inA, inB } = await makeTwoGroupWorld()
    connector.setCurrentGroup(null)
    const items = await connector.getItems({ type: "scope-probe" })
    expect(items.map(({ id }) => id).sort()).toEqual([inA.id, inB.id].sort())
  })

  it("global feature items stay visible inside a group scope (Local parity)", async () => {
    const { connector, userId, groupB } = await makeTwoGroupWorld()
    connector.setCurrentGroup(null)
    const feature = await connector.createItem({ type: "feature", createdBy: userId, data: { name: "map" } })
    connector.setCurrentGroup(groupB.id)
    const items = await connector.getItems({ type: "feature" })
    expect(items.map(({ id }) => id)).toContain(feature.id)
  })

  it("getItem outside the current scope answers null", async () => {
    const { connector, groupB, inA } = await makeTwoGroupWorld()
    connector.setCurrentGroup(groupB.id)
    expect(await connector.getItem(inA.id)).toBeNull()
  })

  it("a GROUP-LOCAL feature item does NOT leak into other groups (round-2 review)", async () => {
    // The global-feature exception is bound to group_id IS NULL — a feature
    // created INSIDE group A is A's feature, invisible in group B.
    const { connector, userId, groupA, groupB } = await makeTwoGroupWorld()
    connector.setCurrentGroup(groupA.id)
    const localFeature = await connector.createItem({ type: "feature", createdBy: userId, data: { name: "graph" } })
    connector.setCurrentGroup(groupB.id)
    expect((await connector.getItems({ type: "feature" })).map(({ id }) => id)).not.toContain(localFeature.id)
    expect(await connector.getItem(localFeature.id)).toBeNull()
    // In its own group it stays visible.
    connector.setCurrentGroup(groupA.id)
    expect((await connector.getItems({ type: "feature" })).map(({ id }) => id)).toContain(localFeature.id)
    expect(await connector.getItem(localFeature.id)).not.toBeNull()
  })

  it("an EXISTING observation switches its content on group change", async () => {
    const { connector, groupA, groupB, inA, inB } = await makeTwoGroupWorld()
    connector.setCurrentGroup(groupA.id)
    const observable = connector.observe({ type: "scope-probe" })
    await flush()
    expect(observable.current.map(({ id }) => id)).toEqual([inA.id])
    connector.setCurrentGroup(groupB.id)
    await flush()
    expect(observable.current.map(({ id }) => id)).toEqual([inB.id])
  })
})

describe("SupabaseConnector — ProfileCapable (WoT-Parität)", () => {
  it("hasProfile greift; updateMyProfile persistiert Name/Bio/Avatar und projiziert ein person-Item", async () => {
    const { connector, userId } = await makeConnector()
    const { hasProfile } = await import("@real-life-stack/data-interface")
    expect(hasProfile(connector)).toBe(true)
    await connector.updateMyProfile({ name: "Anton", bio: "Baut Netze", avatar: "data:image/png;base64,abc" })
    const profile = (await connector.getMyProfile())!
    expect(profile).toMatchObject({
      id: userId,
      type: "person",
      createdBy: userId,
      data: { displayName: "Anton", bio: "Baut Netze", avatarUrl: "data:image/png;base64,abc" },
    })
    expect(profile["@context"]).toContain("https://real-life-stack.org/vocab/person/v1")
  })

  it("updateMyProfile aktualisiert auch den currentUser (Navbar-Name/-Avatar sofort)", async () => {
    const { connector } = await makeConnector()
    await connector.updateMyProfile({ name: "Neuer Name", avatar: "data:image/png;base64,xyz" })
    const user = (await connector.getCurrentUser())!
    expect(user.displayName).toBe("Neuer Name")
    expect(user.avatarUrl).toBe("data:image/png;base64,xyz")
    expect(connector.observeCurrentUser().current?.displayName).toBe("Neuer Name")
  })

  it("observeMyProfile emittet nach Update und folgt externen profiles-Änderungen (Realtime)", async () => {
    const { client, connector, userId } = await makeConnector()
    const observable = connector.observeMyProfile()
    await flush()
    await connector.updateMyProfile({ name: "Erste" })
    await flush()
    expect(observable.current?.data.displayName).toBe("Erste")
    // Anderes Gerät ändert das Profil → Realtime-Event auf profiles.
    const row = client.tables.get("profiles")!.find((r) => r.id === userId)!
    row.display_name = "Vom anderen Gerät"
    client.emit("profiles", { eventType: "UPDATE", new: { ...row }, old: { ...row } })
    await flush()
    expect(observable.current?.data.displayName).toBe("Vom anderen Gerät")
  })

  /** Gate the NEXT profiles read: resolves only when release() is called. */
  function gateNextProfilesRead(client: FakeSupabaseClient): { release: () => void } {
    const originalFrom = client.from.bind(client)
    let armed = true
    let release: () => void = () => {}
    ;(client as { from: typeof client.from }).from = (table: string) => {
      const tableApi = originalFrom(table)
      if (table !== "profiles" || !armed) return tableApi
      armed = false
      const originalSelect = tableApi.select.bind(tableApi)
      return {
        ...tableApi,
        select: (columns?: string) => {
          const builder = originalSelect(columns)
          const originalMaybeSingle = builder.maybeSingle.bind(builder)
          return Object.assign(builder, {
            maybeSingle: () => new Promise((resolve) => { release = () => resolve(originalMaybeSingle()) }),
          })
        },
      }
    }
    return { get release() { return release }, set release(_v) {} } as { release: () => void }
  }

  it("ein nach Logout auflösender Profil-Read reanimiert das alte Profil NICHT (Review-Race)", async () => {
    const { client, connector } = await makeConnector()
    await connector.updateMyProfile({ name: "Alice", bio: "Geheim" })
    await flush()
    // Read für die ALTE Session gaten (Realtime-Event stößt den Refresh an) …
    const gate = gateNextProfilesRead(client)
    client.emit("profiles", { eventType: "UPDATE", new: {}, old: {} })
    await flush()
    // … dann Logout: Observable korrekt leer.
    await connector.logout()
    await flush()
    expect(connector.observeMyProfile().current).toBeNull()
    // Alten Read freigeben — er darf die entzogene Session nicht überleben.
    gate.release()
    await flush()
    expect(connector.observeMyProfile().current).toBeNull()
  })

  it("bei A→B-Sessionwechsel überschreibt ein später A-Read das B-Profil nicht", async () => {
    const { client, connector } = await makeConnector()
    await connector.updateMyProfile({ name: "Alice" })
    await flush()
    const gate = gateNextProfilesRead(client)
    client.emit("profiles", { eventType: "UPDATE", new: {}, old: {} })
    await flush()
    await connector.logout()
    const userB = await connector.authenticate("anonymous", {})
    await connector.updateMyProfile({ name: "Berta" })
    await flush()
    expect(connector.observeMyProfile().current?.data.displayName).toBe("Berta")
    gate.release()
    await flush()
    expect(connector.observeMyProfile().current?.id).toBe(userB.id)
    expect(connector.observeMyProfile().current?.data.displayName).toBe("Berta")
  })

  it("observeMyProfile erfüllt den Async-Observable-Vertrag (loaded)", async () => {
    // Frischer Client MIT bestehender Session; ALLE profiles-Reads hängen am
    // Gate — vor dem ersten Settle muss loaded false sein, danach true.
    const client = new FakeSupabaseClient()
    await client.auth.signInAnonymously()
    const releases: Array<() => void> = []
    const originalFrom = client.from.bind(client)
    ;(client as { from: typeof client.from }).from = (table: string) => {
      const tableApi = originalFrom(table)
      if (table !== "profiles") return tableApi
      const originalSelect = tableApi.select.bind(tableApi)
      return {
        ...tableApi,
        select: (columns?: string) => {
          const builder = originalSelect(columns)
          const originalMaybeSingle = builder.maybeSingle.bind(builder)
          return Object.assign(builder, {
            maybeSingle: () => new Promise((resolve) => { releases.push(() => resolve(originalMaybeSingle())) }),
          })
        },
      }
    }
    const fresh = new SupabaseConnector(client)
    const initPromise = fresh.init()
    const observable = fresh.observeMyProfile()
    expect(observable.loaded).toBe(false)
    // Freigeben (auch nachgelagerte Reads), bis init + Refresh settled sind.
    for (let round = 0; round < 5; round += 1) {
      releases.splice(0).forEach((release) => release())
      await flush()
    }
    await initPromise
    await flush()
    expect(observable.loaded).toBe(true)
    expect(observable.current?.id).toBe(client.auth.session!.user.id)
  })

  it("getPublicProfile liefert Fremdprofil-Daten; leeres Feld bleibt absent", async () => {
    const { client, connector } = await makeConnector()
    client.tables.get("profiles")!.push({ id: "user-berta", display_name: "Berta", avatar_url: null, bio: "Hallo", created_at: "t" })
    const publicProfile = (await connector.getPublicProfile("user-berta"))!
    expect(publicProfile).toMatchObject({ name: "Berta", bio: "Hallo" })
    expect("avatar" in publicProfile && publicProfile.avatar ? "gesetzt" : "absent").toBe("absent")
    expect(await connector.getPublicProfile("user-unbekannt")).toBeNull()
  })

  it("syncProfile ist ein ehrlicher No-op (Server ist die Quelle), Pending konstant false", async () => {
    const { connector } = await makeConnector()
    await connector.syncProfile()
    expect(connector.isProfileSyncPending().current).toBe(false)
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

describe("SupabaseConnector — CodeRabbit findings (#238 review)", () => {
  it("deleteItem on a foreign relation record FAILS instead of silently succeeding (RLS 0 rows)", async () => {
    const { client, connector } = await makeConnector()
    client.tables.get("items")!.push({
      id: "bobs-vote", type: "relation", created_by: "user-bob", created_at: "t",
      context: null, schema: null, schema_version: null,
      data: { predicate: "votesOn", value: "red" }, relations: [], tags: null, group_id: null,
    })
    await expect(connector.deleteItem("bobs-vote")).rejects.toThrow(/authoriz|verweigert|not permitted/i)
    expect(client.tables.get("items")!.some((row) => row.id === "bobs-vote")).toBe(true)
  })

  it("deleteGroup on a foreign group FAILS instead of silently succeeding", async () => {
    const { client, connector } = await makeConnector()
    client.tables.get("groups")!.push({ id: "foreign-g", name: "Fremd", data: {}, created_by: "user-bob", created_at: "t" })
    await expect(connector.deleteGroup("foreign-g")).rejects.toThrow(/authoriz|verweigert|not permitted/i)
    expect(client.tables.get("groups")!.some((row) => row.id === "foreign-g")).toBe(true)
  })

  it("removeMember without permission FAILS instead of silently succeeding", async () => {
    const { client, connector } = await makeConnector()
    client.tables.get("groups")!.push({ id: "foreign-g", name: "Fremd", data: {}, created_by: "user-bob", created_at: "t" })
    client.tables.get("group_members")!.push({ group_id: "foreign-g", user_id: "user-carol", created_at: "t" })
    await expect(connector.removeMember("foreign-g", "user-carol")).rejects.toThrow(/authoriz|verweigert|not permitted/i)
    expect(client.tables.get("group_members")!.some((row) => row.user_id === "user-carol")).toBe(true)
  })

  it("deleteItem on a NONEXISTENT id stays idempotent (no throw)", async () => {
    const { connector } = await makeConnector()
    await expect(connector.deleteItem("never-existed")).resolves.toBeUndefined()
  })

  it("email-signup WITHOUT session (confirmation pending) does not authenticate", async () => {
    const client = new FakeSupabaseClient()
    client.auth.emailConfirmationRequired = true
    const connector = new SupabaseConnector(client)
    await connector.init()
    await expect(connector.authenticate("email-signup", { email: "x@y.de", password: "pw" }))
      .rejects.toThrow(/Bestätigung|confirm/i)
    expect(connector.getAuthState().current).toEqual({ status: "unauthenticated" })
    expect(await connector.getCurrentUser()).toBeNull()
  })

  it("getItems WITHOUT limit pages past the server's max_rows cap (no silent truncation)", async () => {
    const { client, connector, userId } = await makeConnector()
    const rows = client.tables.get("items")!
    for (let i = 0; i < 2345; i += 1) {
      rows.push({
        id: `bulk-${String(i).padStart(5, "0")}`, type: "bulk", created_by: userId,
        created_at: new Date(1700000000000 + i).toISOString(),
        context: null, schema: null, schema_version: null, data: {}, relations: null, tags: null, group_id: null,
      })
    }
    const items = await connector.getItems({ type: "bulk" })
    expect(items).toHaveLength(2345)
    // A small explicit limit stays a single window.
    expect(await connector.getItems({ type: "bulk", limit: 7 })).toHaveLength(7)
    // An explicit limit ABOVE the server cap is honored via pagination
    // (round-2 review: 1500 must not silently become 1000).
    expect(await connector.getItems({ type: "bulk", limit: 1500 })).toHaveLength(1500)
    // Limit + offset window near the tail: exactly the remaining rows.
    const tail = await connector.getItems({ type: "bulk", limit: 1500, offset: 1345 })
    expect(tail).toHaveLength(1000)
    expect(tail[0]!.id).toBe("bulk-01345")
    expect(tail[999]!.id).toBe("bulk-02344")
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
