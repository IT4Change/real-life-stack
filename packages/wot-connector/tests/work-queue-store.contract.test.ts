// Vertragstests #145 (TDD — VOR der Implementierung geschrieben, Start: ROT).
// V1/V2-Durability: Work-Items überleben Neustarts; V3-Lebenszyklus: Claim
// (exactly-once pro Session), Backoff, Attempt-Cap. Der Store wird dynamisch
// importiert, damit die Datei sauber kollektiert und jeder Test mit klarer
// Botschaft rot ist, solange src/work-queue-store.ts nicht existiert.
import { IDBFactory } from "fake-indexeddb"
import { beforeEach, describe, expect, it } from "vitest"

type WorkItem = {
  id: string
  kind: "deliver-attestation" | "receipt-ack"
  payload: Record<string, unknown>
  attempts: number
  nextDueAt: number
}

async function loadStore() {
  const mod = await import("../src/work-queue-store.js")
  return mod.WorkQueueStore as new (dbName: string, options?: { maxAttempts?: number }) => {
    open(): Promise<void>
    close(): Promise<void>
    enqueue(item: { id: string; kind: WorkItem["kind"]; payload: Record<string, unknown> }): Promise<void>
    claimDue(now: number): Promise<WorkItem[]>
    complete(id: string): Promise<void>
    fail(id: string, now: number): Promise<boolean>
    count(): Promise<number>
  }
}

const DB = "wot-work-queue:did:key:test"

describe("Vertrag #145 — WorkQueueStore Durability & Lebenszyklus", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      writable: true,
      value: new IDBFactory(),
    })
  })

  it("V1/V2: enqueue überlebt einen Neustart (neue Store-Instanz, gleiche DB)", async () => {
    const WorkQueueStore = await loadStore()
    const s1 = new WorkQueueStore(DB)
    await s1.open()
    await s1.enqueue({ id: "w1", kind: "deliver-attestation", payload: { attestationId: "att-1" } })
    await s1.close()

    const s2 = new WorkQueueStore(DB)
    await s2.open()
    const due = await s2.claimDue(Date.now())
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ id: "w1", kind: "deliver-attestation" })
    expect(due[0].payload).toMatchObject({ attestationId: "att-1" })
    await s2.close()
  })

  it("V3: close ist terminal und verhindert eine stille IndexedDB-Resurrection", async () => {
    const WorkQueueStore = await loadStore()
    const store = new WorkQueueStore("work-queue-close-is-terminal")
    await store.open()
    await store.close()

    await expect(store.enqueue({ id: "late", kind: "receipt-ack", payload: {} }))
      .rejects.toThrow("WorkQueueStore is closed")
  })

  it("V3: claimDue liefert ein Item pro Session genau einmal (Claim), complete entfernt durabel", async () => {
    const WorkQueueStore = await loadStore()
    const store = new WorkQueueStore(DB)
    await store.open()
    await store.enqueue({ id: "w1", kind: "receipt-ack", payload: { jti: "att-1" } })

    const first = await store.claimDue(Date.now())
    expect(first).toHaveLength(1)
    // Zweiter Claim derselben Session: NICHT erneut (in-flight geclaimt)
    expect(await store.claimDue(Date.now())).toHaveLength(0)

    await store.complete("w1")
    expect(await store.count()).toBe(0)
    await store.close()

    // Durabel entfernt: auch nach Neustart weg
    const restarted = new WorkQueueStore(DB)
    await restarted.open()
    expect(await restarted.count()).toBe(0)
    expect(await restarted.claimDue(Date.now())).toHaveLength(0)
    await restarted.close()
  })

  it("V3: fail → attempts wächst, Item ist NICHT sofort wieder fällig (Backoff), aber später wieder claimbar", async () => {
    const WorkQueueStore = await loadStore()
    const store = new WorkQueueStore(DB)
    await store.open()
    const t0 = 1_000_000
    await store.enqueue({ id: "w1", kind: "deliver-attestation", payload: {} })

    const [claimed] = await store.claimDue(t0)
    expect(claimed.attempts).toBe(0)
    await store.fail("w1", t0)

    // Unmittelbar danach nicht fällig (Backoff > 0)
    expect(await store.claimDue(t0)).toHaveLength(0)
    // Deutlich später (10 min > Backoff-Cap 5 min) wieder fällig, attempts inkrementiert
    const later = await store.claimDue(t0 + 10 * 60_000)
    expect(later).toHaveLength(1)
    expect(later[0].attempts).toBe(1)
    await store.close()
  })

  it("V3: nach Attempt-Cap wird das Item verworfen (kein Für-immer-Retry)", async () => {
    const WorkQueueStore = await loadStore()
    const store = new WorkQueueStore(DB, { maxAttempts: 3 })
    await store.open()
    let now = 1_000_000
    await store.enqueue({ id: "w1", kind: "receipt-ack", payload: {} })

    for (let i = 0; i < 3; i++) {
      const due = await store.claimDue(now)
      expect(due).toHaveLength(1)
      await store.fail("w1", now)
      now += 10 * 60_000 // weit über Backoff-Cap springen
    }
    // Cap erreicht → verworfen, nie wieder fällig, durabel weg
    expect(await store.claimDue(now)).toHaveLength(0)
    expect(await store.count()).toBe(0)
    await store.close()
  })
})

describe("Vertrag #145 — Store-Nachschärfung Runde 3 (Cap-Signal, Listener-Isolation)", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      writable: true,
      value: new IDBFactory(),
    })
  })

  it("S3: fail liefert das Cap-Signal exakt als false,false,true (maxAttempts 3)", async () => {
    const WorkQueueStore = await loadStore()
    const store = new WorkQueueStore(DB, { maxAttempts: 3 })
    await store.open()
    let now = 1_000_000
    await store.enqueue({ id: "w1", kind: "deliver-attestation", payload: {} })
    const signals: boolean[] = []
    for (let i = 0; i < 3; i++) {
      await store.claimDue(now)
      signals.push(await store.fail("w1", now))
      now += 10 * 60_000
    }
    expect(signals).toEqual([false, false, true])
    await store.close()
  })

  it("B2: ein werfender Pending-Listener verschluckt das dropped-Signal NICHT (Isolation nach Mutation)", async () => {
    const WorkQueueStore = await loadStore()
    const store = new WorkQueueStore(DB, { maxAttempts: 1 }) as InstanceType<Awaited<ReturnType<typeof loadStore>>> & {
      watchPendingCount(): { subscribe(cb: (n: number) => void): () => void }
    }
    await store.open()
    store.watchPendingCount().subscribe(() => { throw new Error("listener boom") })
    await store.enqueue({ id: "w1", kind: "receipt-ack", payload: {} })
    await store.claimDue(Date.now())
    // Cap-Versuch: Delete ist committed — der Listener-Fehler darf weder
    // rejecten noch das dropped=true-Signal verschlucken.
    await expect(store.fail("w1", Date.now())).resolves.toBe(true)
    expect(await store.count()).toBe(0)
    await store.close()
  })
})

describe("Vertrag #145 — Store-Nachschärfung: claimImmediate (In-Session-Ownership)", () => {
  it("claimImmediate gewinnt genau einmal; claimDue überspringt geclaimte Items; complete gibt frei", async () => {
    const WorkQueueStore = await loadStore()
    const store = new WorkQueueStore(DB) as InstanceType<Awaited<ReturnType<typeof loadStore>>> & {
      claimImmediate(id: string): boolean
    }
    await store.open()
    await store.enqueue({ id: "w1", kind: "receipt-ack", payload: {} })

    expect(store.claimImmediate("w1")).toBe(true)
    expect(store.claimImmediate("w1")).toBe(false) // bereits in Session-Besitz
    expect(await store.claimDue(Date.now())).toHaveLength(0) // Drain überspringt

    await store.complete("w1")
    // Nach complete ist das Item weg UND der Claim freigegeben
    expect(store.claimImmediate("w1")).toBe(true) // kein Record mehr, aber Claim-Mechanik frei
    await store.close()
  })
})
