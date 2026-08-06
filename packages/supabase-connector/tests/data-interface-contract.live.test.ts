/**
 * LIVE contract suite against a running Supabase instance — the referee for
 * PostgREST filter semantics and for the RLS trust boundary that the unit
 * fake only mimics.
 *
 * Run `npx supabase start` in the repo root (Docker required), then:
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_ANON_KEY=<from supabase start> \
 *   SUPABASE_SERVICE_ROLE_KEY=<from supabase start> \
 *   pnpm --filter @real-life-stack/supabase-connector test
 *
 * Without these env vars the suite skips (CI has no Supabase yet).
 *
 * ACHTUNG bei Wiederholungsläufen: jeder Fall legt anonyme Sessions an.
 * GoTrue limitiert anonyme Anmeldungen (Default 30/Stunde/IP) — mehrere
 * volle Läufe kurz hintereinander laufen sonst in 5s-Auth-Timeouts, die wie
 * Produktfehler aussehen. Der Server setzt dafür
 * GOTRUE_RATE_LIMIT_ANONYMOUS_USERS (deploy/supabase/docker-compose.yml).
 */
import { describe, expect, it } from "vitest"
import { createClient } from "@supabase/supabase-js"
import { describeDataInterfaceContract } from "@real-life-stack/data-interface/testing"
import { deriveRelationRecordId, voteRecordInput, VOTE_PREDICATE } from "@real-life-stack/data-interface"
import type { SupabaseClientLike } from "../src/client-types.js"
import { SupabaseConnector } from "../src/supabase-connector.js"

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey || !serviceKey) {
  describe.skip("Supabase live contract (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set)", () => {
    it("skipped", () => {})
  })
} else {
  /** Service-role client: Authorization pinned to the service key so PostgREST
      bypasses RLS (fixture path) while gotrue still issues a session identity. */
  function makeServiceClient() {
    return createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${serviceKey}` } },
    })
  }

  function makeAnonClient() {
    return createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  // Shared suite in fixture mode — its foreign-author cases seed rows that
  // the authoritative ingress rightly refuses.
  describeDataInterfaceContract("SupabaseConnector (live, fixture/service-role)", {
    async makeConnector() {
      const client = makeServiceClient()
      const connector = new SupabaseConnector(client as unknown as SupabaseClientLike, { allowFixtureAuthors: true })
      await connector.init()
      const user = await connector.authenticate("anonymous", {})
      return { connector, currentUserId: user.id, dispose: () => connector.dispose() }
    },
  })

  describe("SupabaseConnector (live, authoritative) — the RLS boundary itself", () => {
    async function makeAuthoritative() {
      const client = makeAnonClient()
      const connector = new SupabaseConnector(client as unknown as SupabaseClientLike)
      await connector.init()
      const user = await connector.authenticate("anonymous", {})
      return { client, connector, userId: user.id }
    }

    it("SERVER rejects a raw insert with a foreign created_by (bypassing the connector)", async () => {
      const { client, connector, userId } = await makeAuthoritative()
      try {
        const { error } = await client.from("items").insert({
          id: `mallory-${Date.now()}`,
          type: "note",
          created_by: "user-mallory",
          data: {},
        })
        expect(error).not.toBeNull()
        expect(String(error!.message)).toMatch(/row-level security/i)
        void userId
      } finally {
        await connector.dispose()
      }
    })

    it("SERVER rejects a raw created_by change on update (immutability trigger)", async () => {
      const { client, connector, userId } = await makeAuthoritative()
      try {
        const item = await connector.createItem({ type: "note", createdBy: userId, data: { title: "mine" } })
        const { error } = await client.from("items").update({ created_by: "user-mallory" }).eq("id", item.id)
        expect(error).not.toBeNull()
        expect((await connector.getItem(item.id))!.createdBy).toBe(userId)
      } finally {
        await connector.dispose()
      }
    })

    it("a SECOND user can neither update nor delete a foreign relation record via raw DML", async () => {
      const alice = await makeAuthoritative()
      const mallory = await makeAuthoritative()
      try {
        const record = await alice.connector.createRelationRecord(voteRecordInput(alice.userId, "s-live", "green"))
        // RLS: update/delete on type='relation' requires authorship — the
        // foreign session's DML silently affects 0 rows.
        await mallory.client.from("items").update({ data: { predicate: VOTE_PREDICATE, value: "red" } }).eq("id", record.id)
        await mallory.client.from("items").delete().eq("id", record.id)
        const after = await alice.connector.getItem(record.id)
        expect(after).not.toBeNull()
        expect(after!.data.value).toBe("green")
      } finally {
        await alice.connector.dispose()
        await mallory.connector.dispose()
      }
    })

    it("authoritative connector vouches trusted for the facade-written record", async () => {
      const { connector, userId } = await makeAuthoritative()
      try {
        const statement = `s-${Date.now()}`
        const record = await connector.createRelationRecord(voteRecordInput(userId, statement, "green"))
        expect(record.id).toBe(await deriveRelationRecordId(userId, VOTE_PREDICATE, `global:${userId}`, `item:${statement}`))
        expect(await connector.verifyRecordClaim!(record)).toBe("trusted")
      } finally {
        await connector.dispose()
      }
    })

    it("group scope binds reads AND an existing observation follows a group switch", { timeout: 20_000 }, async () => {
      const { connector, userId } = await makeAuthoritative()
      try {
        const probeType = `scope-probe-${Date.now()}`
        const groupA = await connector.createGroup(`Scope A ${Date.now()}`)
        const groupB = await connector.createGroup(`Scope B ${Date.now()}`)
        connector.setCurrentGroup(groupA.id)
        const inA = await connector.createItem({ type: probeType, createdBy: userId, data: { title: "a" } })
        connector.setCurrentGroup(groupB.id)
        const inB = await connector.createItem({ type: probeType, createdBy: userId, data: { title: "b" } })

        expect((await connector.getItems({ type: probeType })).map(({ id }) => id)).toEqual([inB.id])
        expect(await connector.getItem(inA.id)).toBeNull()

        connector.setCurrentGroup(groupA.id)
        const observable = connector.observe({ type: probeType })
        await new Promise((resolve) => setTimeout(resolve, 500))
        expect(observable.current.map(({ id }) => id)).toEqual([inA.id])
        // Existing observation must switch its content with the group.
        connector.setCurrentGroup(groupB.id)
        await new Promise((resolve) => setTimeout(resolve, 1_000))
        expect(observable.current.map(({ id }) => id)).toEqual([inB.id])

        connector.setCurrentGroup(null)
        expect((await connector.getItems({ type: probeType })).map(({ id }) => id).sort())
          .toEqual([inA.id, inB.id].sort())
      } finally {
        await connector.dispose()
      }
    })

    it("profile roundtrip: updateMyProfile persists, second session reads it, foreign write bounces off RLS", async () => {
      const alice = await makeAuthoritative()
      const berta = await makeAuthoritative()
      try {
        const item = await alice.connector.updateMyProfile({ name: "Alice Live", bio: "Testet Profile", avatar: "data:image/png;base64,live" })
        expect(item.data).toMatchObject({ displayName: "Alice Live", bio: "Testet Profile" })
        // Second session sees the public profile.
        const publicProfile = (await berta.connector.getPublicProfile(alice.userId))!
        expect(publicProfile).toMatchObject({ name: "Alice Live", bio: "Testet Profile" })
        // RLS: a foreign session cannot write someone else's profile row.
        await berta.client.from("profiles").update({ display_name: "Gekapert" }).eq("id", alice.userId)
        expect((await berta.connector.getPublicProfile(alice.userId))!.name).toBe("Alice Live")
      } finally {
        await alice.connector.dispose()
        await berta.connector.dispose()
      }
    })

    it("contacts: request→confirm end-to-end; only the addressee confirms; third parties see nothing", { timeout: 30_000 }, async () => {
      const alice = await makeAuthoritative()
      const berta = await makeAuthoritative()
      const carla = await makeAuthoritative()
      try {
        // A fragt B an — bei A outgoing, bei B incoming.
        await alice.connector.addContact(berta.userId, "Berta")
        expect((await alice.connector.getContacts())[0]).toMatchObject({ id: berta.userId, status: "pending", direction: "outgoing" })
        expect((await berta.connector.getContacts())[0]).toMatchObject({ id: alice.userId, status: "pending", direction: "incoming" })

        // Der ANFRAGENDE kann nicht selbst bestätigen (Trigger).
        const selfConfirm = await alice.client.from("contacts")
          .update({ status: "active" }).eq("requester", alice.userId)
        expect(selfConfirm.error).not.toBeNull()

        // Dritte sehen die Kante nicht und können sie nicht anfassen.
        const carlaView = await carla.client.from("contacts").select("*")
        expect(carlaView.data).toEqual([])
        await carla.client.from("contacts").update({ status: "active" }).eq("requester", alice.userId)
        expect((await alice.connector.getContacts())[0]!.status).toBe("pending")

        // Gegenanfrage von B = Bestätigung → beidseitig aktiv.
        const confirmed = await berta.connector.addContact(alice.userId)
        expect(confirmed.status).toBe("active")
        expect((await alice.connector.getContacts())[0]!.status).toBe("active")
      } finally {
        await alice.connector.dispose()
        await berta.connector.dispose()
        await carla.connector.dispose()
      }
    })

    it("contacts INSERT boundary: raw active/foreign-alias inserts bounce off RLS (round-1 review)", async () => {
      const alice = await makeAuthoritative()
      const berta = await makeAuthoritative()
      try {
        // Bypass the connector: a requester must not create an ACTIVE edge …
        const activeInsert = await alice.client.from("contacts").insert({
          requester: alice.userId, addressee: berta.userId, status: "active",
        })
        expect(activeInsert.error).not.toBeNull()
        // … nor pre-fill the other side's alias.
        const aliasInsert = await alice.client.from("contacts").insert({
          requester: alice.userId, addressee: berta.userId, status: "pending", addressee_alias: "von A diktiert",
        })
        expect(aliasInsert.error).not.toBeNull()
        // The legitimate pending request still works.
        const ok = await alice.client.from("contacts").insert({
          requester: alice.userId, addressee: berta.userId, status: "pending",
        })
        expect(ok.error).toBeNull()
      } finally {
        await alice.connector.dispose()
        await berta.connector.dispose()
      }
    })

    it("incoming events LIVE: contact request and group invite arrive as dialog events", { timeout: 30_000 }, async () => {
      const alice = await makeAuthoritative()
      const berta = await makeAuthoritative()
      try {
        const events: Array<{ type: string }> = []
        ;(berta.connector as unknown as { onIncomingEvent(cb: (e: { type: string }) => void): () => void })
          .onIncomingEvent((event) => events.push(event))
        await new Promise((resolve) => setTimeout(resolve, 2_000)) // Channel-Join

        await alice.connector.addContact(berta.userId, "Berta")
        await berta.connector.activateContact(alice.userId)
        const group = await alice.connector.createGroup(`Invite ${Date.now()}`)
        await alice.connector.inviteMember(group.id, berta.userId)

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`events fehlen nach 15s: ${JSON.stringify(events)}`)), 15_000)
          const check = setInterval(() => {
            if (events.some((e) => e.type === "contact-request") && events.some((e) => e.type === "space-invite")) {
              clearTimeout(timer)
              clearInterval(check)
              resolve()
            }
          }, 250)
        })
        const invite = events.find((e) => e.type === "space-invite") as { fromId: string; spaceId: string }
        expect(invite.fromId).toBe(alice.userId)
        expect(invite.spaceId).toBe(group.id)
      } finally {
        await alice.connector.dispose()
        await berta.connector.dispose()
      }
    })

    it("observe() is LIVE: an insert from a second client arrives via realtime", { timeout: 20_000 }, async () => {
      const observerSide = await makeAuthoritative()
      const writerSide = await makeAuthoritative()
      try {
        const type = `live-${Date.now()}`
        const observable = observerSide.connector.observe({ type })
        // Give the initial fetch + channel join a moment to settle.
        await new Promise((resolve) => setTimeout(resolve, 2_000))
        const created = await writerSide.connector.createItem({ type, createdBy: writerSide.userId, data: { title: "realtime" } })
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("realtime update did not arrive within 15s")), 15_000)
          const check = () => {
            if (observable.current.some(({ id }) => id === created.id)) {
              clearTimeout(timer)
              stop()
              resolve()
            }
          }
          const stop = observable.subscribe(check)
          check()
        })
      } finally {
        await observerSide.connector.dispose()
        await writerSide.connector.dispose()
      }
    })
  })
}
