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

// Timeouts: siehe vitest.config.ts (Projekt "live").
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

  /** Wartet auf eine BEDINGUNG statt auf eine feste Pause — feste Sleeps
      gegen einen echten Server waren die eigentliche Flake-Quelle. */
  async function waitFor(
    predicate: () => boolean,
    { timeout = 15_000, interval = 100, label = "Bedingung" } = {},
  ): Promise<void> {
    const deadline = Date.now() + timeout
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`waitFor: ${label} nicht erreicht in ${timeout}ms`)
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
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

    // Migration 0009 dehnt die Autorenregel von `relation` auf `comment` und
    // `reaction` aus. Hier ist sie eine ECHTE Grenze — an PostgREST kommt
    // niemand vorbei —, also wird sie auch wie eine getestet: mit einem
    // zweiten, echten Benutzer und rohem DML, nicht ueber den Connector.
    for (const type of ["comment", "reaction"] as const) {
      it(`a SECOND user can neither update nor delete a foreign ${type} via raw DML`, async () => {
        const alice = await makeAuthoritative()
        const mallory = await makeAuthoritative()
        try {
          const id = `${type}-live-${Date.now()}`
          const original = { text: "ihre Aussage" }
          const insert = await alice.client.from("items").insert({
            id, type, created_by: alice.userId, data: original,
          })
          expect(insert.error).toBeNull()

          // RLS laesst die Zeile fuer die fremde Sitzung schlicht unsichtbar
          // werden — das DML trifft 0 Zeilen, statt einen Fehler zu werfen.
          await mallory.client.from("items").update({ data: { text: "gekapert" } }).eq("id", id)
          await mallory.client.from("items").delete().eq("id", id)

          const after = await alice.connector.getItem(id)
          expect(after, `${type} darf nicht geloescht worden sein`).not.toBeNull()
          expect(after!.data).toEqual(original)
        } finally {
          await alice.connector.dispose()
          await mallory.connector.dispose()
        }
      })
    }

    // Gegenprobe zu den beiden Tests oben: ohne sie wuerde eine Policy, die
    // ALLEN das Schreiben verbietet, genauso gruen bleiben. Der Autor muss
    // sein eigenes Autoren-Item weiterhin aendern UND loeschen koennen.
    for (const type of ["comment", "reaction"] as const) {
      it(`the AUTHOR can still update and delete their own ${type} via raw DML`, async () => {
        const alice = await makeAuthoritative()
        try {
          const id = `${type}-own-${Date.now()}`
          const insert = await alice.client.from("items").insert({
            id, type, created_by: alice.userId, data: { text: "meine Aussage" },
          })
          expect(insert.error).toBeNull()

          const updated = await alice.client.from("items").update({ data: { text: "korrigiert" } }).eq("id", id)
          expect(updated.error).toBeNull()
          expect((await alice.connector.getItem(id))!.data).toEqual({ text: "korrigiert" })

          const removed = await alice.client.from("items").delete().eq("id", id)
          expect(removed.error).toBeNull()
          expect(await alice.connector.getItem(id)).toBeNull()
        } finally {
          await alice.connector.dispose()
        }
      })
    }

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

    it("group scope binds reads AND an existing observation follows a group switch", async () => {
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
        await waitFor(() => observable.current.some(({ id }) => id === inA.id), { label: "Gruppe A sichtbar" })
        expect(observable.current.map(({ id }) => id)).toEqual([inA.id])
        // Existing observation must switch its content with the group.
        connector.setCurrentGroup(groupB.id)
        await waitFor(() => observable.current.some(({ id }) => id === inB.id), { label: "Gruppe B sichtbar" })
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

    it("membership visibility: non-members see nothing, cannot join or write; invitation opens the door", async () => {
      const alice = await makeAuthoritative()
      const mallory = await makeAuthoritative()
      try {
        const probeType = `member-probe-${Date.now()}`
        const group = await alice.connector.createGroup(`Membership ${Date.now()}`)
        alice.connector.setCurrentGroup(group.id)
        const secret = await alice.connector.createItem({ type: probeType, createdBy: alice.userId, data: { title: "nur für Mitglieder" } })

        // Non-member: no item, no group, no membership row.
        expect((await mallory.connector.getItems({ type: probeType })).map(({ id }) => id)).toEqual([])
        expect(await mallory.connector.getItem(secret.id)).toBeNull()
        expect((await mallory.connector.getGroups()).map(({ id }) => id)).not.toContain(group.id)

        // Self-join bounces off RLS (the pre-0003 gap).
        const joinAttempt = await mallory.client.from("group_members").insert({ group_id: group.id, user_id: mallory.userId })
        expect(joinAttempt.error).not.toBeNull()

        // Writing into the group bounces off RLS even with a bound author.
        const writeAttempt = await mallory.client.from("items").insert({
          id: `mallory-write-${Date.now()}`, type: probeType, created_by: mallory.userId, data: {}, group_id: group.id,
        })
        expect(writeAttempt.error).not.toBeNull()

        // Invitation by a member opens the door.
        await alice.connector.inviteMember(group.id, mallory.userId)
        expect((await mallory.connector.getGroups()).map(({ id }) => id)).toContain(group.id)
        mallory.connector.setCurrentGroup(group.id)
        expect((await mallory.connector.getItems({ type: probeType })).map(({ id }) => id)).toEqual([secret.id])
      } finally {
        await alice.connector.dispose()
        await mallory.connector.dispose()
      }
    })

    it("group_id ist unveränderlich: kein Veröffentlichen und kein Space-Wechsel per Raw-DML (#246)", async () => {
      const alice = await makeAuthoritative()
      const berta = await makeAuthoritative()
      try {
        const probeType = `scope-lock-${Date.now()}`
        const group = await alice.connector.createGroup(`Lock ${Date.now()}`)
        const other = await alice.connector.createGroup(`Lock B ${Date.now()}`)
        alice.connector.setCurrentGroup(group.id)
        const secret = await alice.connector.createItem({ type: probeType, createdBy: alice.userId, data: { title: "geheim" } })

        // 1. Global veröffentlichen (group_id → NULL) muss scheitern …
        const publish = await alice.client.from("items").update({ group_id: null }).eq("id", secret.id)
        expect(publish.error).not.toBeNull()
        // 2. … und der Wechsel in einen ANDEREN eigenen Space ebenso.
        const move = await alice.client.from("items").update({ group_id: other.id }).eq("id", secret.id)
        expect(move.error).not.toBeNull()

        // Ein Nicht-Mitglied sieht das Item weiterhin nicht.
        expect(await berta.connector.getItem(secret.id)).toBeNull()
        // Und der Scope steht unverändert.
        alice.connector.setCurrentGroup(group.id)
        expect((await alice.connector.getItems({ type: probeType })).map(({ id }) => id)).toEqual([secret.id])
      } finally {
        await alice.connector.dispose()
        await berta.connector.dispose()
      }
    })

    it("auch der GEGENPFAD global→Gruppe ist gesperrt: kein Einschleusen in einen Space (#246)", async () => {
      const alice = await makeAuthoritative()
      const berta = await makeAuthoritative()
      try {
        const probeType = `scope-in-${Date.now()}`
        // Alices globales Item (kein Space) …
        alice.connector.setCurrentGroup(null)
        const global = await alice.connector.createItem({ type: probeType, createdBy: alice.userId, data: { title: "global" } })
        // … Bertas Gruppe, in der Alice NICHT Mitglied ist.
        const bertasGroup = await berta.connector.createGroup(`Fremd ${Date.now()}`)

        // Weder in einen fremden Space …
        const intoForeign = await alice.client.from("items").update({ group_id: bertasGroup.id }).eq("id", global.id)
        expect(intoForeign.error).not.toBeNull()
        // … noch in einen eigenen: group_id ist unveränderlich, Punkt.
        const own = await alice.connector.createGroup(`Eigen ${Date.now()}`)
        const intoOwn = await alice.client.from("items").update({ group_id: own.id }).eq("id", global.id)
        expect(intoOwn.error).not.toBeNull()

        // Das Item ist unverändert global geblieben.
        alice.connector.setCurrentGroup(null)
        expect((await alice.connector.getItems({ type: probeType })).map(({ id }) => id)).toEqual([global.id])
      } finally {
        await alice.connector.dispose()
        await berta.connector.dispose()
      }
    })

    it("das Löschen einer Gruppe VERÖFFENTLICHT ihre Inhalte nicht (CASCADE statt SET NULL, #246)", async () => {
      const alice = await makeAuthoritative()
      const berta = await makeAuthoritative()
      try {
        const probeType = `cascade-${Date.now()}`
        const group = await alice.connector.createGroup(`Cascade ${Date.now()}`)
        alice.connector.setCurrentGroup(group.id)
        const secret = await alice.connector.createItem({ type: probeType, createdBy: alice.userId, data: { title: "geheim" } })

        alice.connector.setCurrentGroup(null)
        await alice.connector.deleteGroup(group.id)

        // Mit SET NULL wäre das Item jetzt global sichtbar — auch für Fremde.
        expect((await berta.connector.getItems({ type: probeType })).map(({ id }) => id)).toEqual([])
        expect(await berta.connector.getItem(secret.id)).toBeNull()
        // Auch für den Ex-Creator im Overview ist es weg, nicht "global".
        expect((await alice.connector.getItems({ type: probeType })).map(({ id }) => id)).toEqual([])
      } finally {
        await alice.connector.dispose()
        await berta.connector.dispose()
      }
    })

    it("realtime still delivers GROUP items to members (WALRUS evaluates the definer-based policy)", async () => {
      const alice = await makeAuthoritative()
      const berta = await makeAuthoritative()
      try {
        const probeType = `member-rt-${Date.now()}`
        const group = await alice.connector.createGroup(`RT ${Date.now()}`)
        await alice.connector.inviteMember(group.id, berta.userId)
        berta.connector.setCurrentGroup(group.id)
        const observable = berta.connector.observe({ type: probeType })
        await waitFor(() => observable.loaded === true, { label: "observe geladen" })
        await new Promise((resolve) => setTimeout(resolve, 1_500)) // Kanal-Join
        alice.connector.setCurrentGroup(group.id)
        const created = await alice.connector.createItem({ type: probeType, createdBy: alice.userId, data: { title: "im Space" } })
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("realtime group event did not arrive within 15s")), 15_000)
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
        await alice.connector.dispose()
        await berta.connector.dispose()
      }
    })

    it("contacts: request→confirm end-to-end; only the addressee confirms; third parties see nothing", async () => {
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

    it("incoming events LIVE: contact request and group invite arrive as dialog events", async () => {
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

    it("observe() is LIVE: an insert from a second client arrives via realtime", async () => {
      const observerSide = await makeAuthoritative()
      const writerSide = await makeAuthoritative()
      try {
        const type = `live-${Date.now()}`
        const observable = observerSide.connector.observe({ type })
        // Erst wenn der initiale Fetch settled ist, steht der Kanal-Join an.
        await waitFor(() => observable.loaded === true, { label: "observe geladen" })
        await new Promise((resolve) => setTimeout(resolve, 1_500)) // Kanal-Join
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
