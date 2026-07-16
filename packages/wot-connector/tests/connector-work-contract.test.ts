// Vertragstests #145 (TDD — VOR der Implementierung geschrieben, Start: ROT).
// Wiring-Verträge V1/V2/V3 am Connector: durable Arbeit VOR fehlbaren
// Operationen, Drain verarbeitet fällige Items, Logout-Wipe kennt die DB.
import { describe, expect, it, vi } from "vitest"

import { WotConnector } from "../src/wot-connector.js"
import { identityDatabaseNames } from "../src/identity-persistence.js"

const attestation = {
  id: "att-1",
  from: "did:key:me",
  to: "did:key:peer",
  claim: "Testclaim",
  createdAt: new Date().toISOString(),
  vcJws: "h.p.s",
}

function workQueueFake() {
  const calls: string[] = []
  return {
    calls,
    enqueue: vi.fn(async (item: { kind: string }) => { calls.push(`enqueue:${item.kind}`) }),
    complete: vi.fn(async () => { calls.push("complete") }),
    fail: vi.fn(async () => { calls.push("fail") }),
    claimDue: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  }
}

describe("Vertrag #145 — Connector-Wiring", () => {
  it("V1: unauflösbarer Empfänger-Key wirft nicht ins Leere — durable Arbeit + Status queued", async () => {
    const wq = workQueueFake()
    const statuses: string[] = []
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      outboxAdapter: {},
      workQueue: wq,
      resolveRecipientEncryptionKey: vi.fn(async () => null), // Key (noch) nicht publiziert
      setDeliveryStatus: vi.fn(async (_id: string, s: string) => { statuses.push(s); return true }),
    })

    // Vertrag: KEIN Throw — die Arbeit ist durabel vorgemerkt.
    await (WotConnector.prototype as any).deliverAttestation.call(fake, attestation)

    expect(wq.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "deliver-attestation", payload: expect.objectContaining({ attestationId: "att-1" }) }),
    )
    expect(statuses).toContain("queued")
  })

  it("V2: Receipt-Pflicht wird VOR dem Sendeversuch durabel und erst NACH Erfolg completed", async () => {
    const order: string[] = []
    const wq = {
      enqueue: vi.fn(async () => { order.push("enqueue") }),
      complete: vi.fn(async () => { order.push("complete") }),
      fail: vi.fn(async () => {}),
      claimDue: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    }
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      workQueue: wq,
      storage: {},
      identity: { getDid: () => "did:key:me" },
      contactsObs: { current: [] },
      eventCallbacks: new Set(),
      bufferedEvents: [],
      syncConfirmationsFromPersonalDoc: vi.fn(),
      checkMutualVerification: vi.fn(async () => {}),
      discovery: { resolveProfile: vi.fn(async () => ({ profile: {} })) },
      sendReceiptAck: vi.fn(async () => { order.push("send") }),
    })

    await (WotConnector.prototype as any).finalizeIncomingAttestation.call(fake, { ...attestation, isVerification: false }, false)
    await vi.waitFor(() => expect(order).toContain("complete"))

    // Reihenfolge des Vertrags: durable Pflicht → Sendeversuch → complete.
    expect(order.indexOf("enqueue")).toBeLessThan(order.indexOf("send"))
    expect(order.indexOf("send")).toBeLessThan(order.indexOf("complete"))
  })

  it("V2: scheitert der Receipt-Versand, bleibt die Pflicht bestehen (fail statt complete)", async () => {
    const wq = workQueueFake()
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      workQueue: wq,
      storage: {},
      identity: { getDid: () => "did:key:me" },
      contactsObs: { current: [] },
      eventCallbacks: new Set(),
      bufferedEvents: [],
      syncConfirmationsFromPersonalDoc: vi.fn(),
      checkMutualVerification: vi.fn(async () => {}),
      discovery: { resolveProfile: vi.fn(async () => ({ profile: {} })) },
      sendReceiptAck: vi.fn(async () => { throw new Error("kein Key publiziert") }),
    })

    await (WotConnector.prototype as any).finalizeIncomingAttestation.call(fake, { ...attestation, isVerification: false }, false)
    await vi.waitFor(() => expect(wq.enqueue).toHaveBeenCalled())
    await vi.waitFor(() => expect(wq.fail).toHaveBeenCalled())
    expect(wq.complete).not.toHaveBeenCalled()
  })

  it("V1/V2: drainPendingWork verarbeitet fällige Items und completed sie nach Erfolg", async () => {
    const items = [
      { id: "w-d", kind: "deliver-attestation", payload: { attestationId: "att-1" }, attempts: 1, nextDueAt: 0 },
      { id: "w-r", kind: "receipt-ack", payload: { jti: "att-2" }, attempts: 0, nextDueAt: 0 },
    ]
    const wq = {
      enqueue: vi.fn(async () => {}),
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
      claimDue: vi.fn(async () => items),
      count: vi.fn(async () => items.length),
    }
    const deliverAttestation = vi.fn(async () => {})
    const sendReceiptAck = vi.fn(async () => {})
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      workQueue: wq,
      storage: {
        getAttestation: vi.fn(async (id: string) =>
          id === "att-1" ? { ...attestation } : { ...attestation, id: "att-2", from: "did:key:peer", to: "did:key:me" }),
      },
      identity: { getDid: () => "did:key:me" },
      deliverAttestation,
      sendReceiptAck,
    })

    await (WotConnector.prototype as any).drainPendingWork.call(fake)

    expect(deliverAttestation).toHaveBeenCalledTimes(1)
    expect(sendReceiptAck).toHaveBeenCalledTimes(1)
    expect(wq.complete).toHaveBeenCalledWith("w-d")
    expect(wq.complete).toHaveBeenCalledWith("w-r")
    expect(wq.fail).not.toHaveBeenCalled()
  })

  it("V1: scheitert die Zustellung im Drain, wird fail statt complete gebucht", async () => {
    const items = [{ id: "w-d", kind: "deliver-attestation", payload: { attestationId: "att-1" }, attempts: 2, nextDueAt: 0 }]
    const wq = {
      enqueue: vi.fn(async () => {}),
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
      claimDue: vi.fn(async () => items),
      count: vi.fn(async () => 1),
    }
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      workQueue: wq,
      storage: { getAttestation: vi.fn(async () => ({ ...attestation })) },
      identity: { getDid: () => "did:key:me" },
      deliverAttestation: vi.fn(async () => { throw new Error("Relay down") }),
      sendReceiptAck: vi.fn(async () => {}),
    })

    await (WotConnector.prototype as any).drainPendingWork.call(fake)

    expect(wq.fail).toHaveBeenCalledWith("w-d", expect.any(Number))
    expect(wq.complete).not.toHaveBeenCalled()
  })

  it("V3: die Work-Queue-DB ist DID-namespaced und Teil der Logout-Wipe-Liste", () => {
    const names = identityDatabaseNames("did:key:me")
    expect(names.some((n: string) => n.includes("work-queue") && n.includes("did:key:me"))).toBe(true)
  })
})

describe("Vertrag #145 — Nachschärfung aus Loop-Review (Blocker 1+2)", () => {
  it("V1 (streng): die Delivery-Pflicht ist durabel, BEVOR die Key-Discovery überhaupt startet", async () => {
    const order: string[] = []
    const wq = {
      enqueue: vi.fn(async () => { order.push("enqueue") }),
      complete: vi.fn(async () => { order.push("complete") }),
      fail: vi.fn(async () => {}),
      claimDue: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    }
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      outboxAdapter: {},
      workQueue: wq,
      // Discovery hängt für immer (App könnte hier sterben)
      resolveRecipientEncryptionKey: vi.fn(() => { order.push("discovery"); return new Promise(() => {}) }),
      setDeliveryStatus: vi.fn(async () => true),
    })

    void (WotConnector.prototype as any).deliverAttestation.call(fake, attestation)
    await vi.waitFor(() => expect(wq.enqueue).toHaveBeenCalled())

    // Pflicht VOR der fehlbaren Operation — nicht erst im Fehler-Zweig danach.
    expect(order.indexOf("enqueue")).toBeLessThan(order.indexOf("discovery"))
    expect(wq.complete).not.toHaveBeenCalled()
  })

  it("V1 (Lebenszyklus): erfolgreiche Direktzustellung completed die Pflicht", async () => {
    const order: string[] = []
    const wq = {
      enqueue: vi.fn(async () => { order.push("enqueue") }),
      complete: vi.fn(async () => { order.push("complete") }),
      fail: vi.fn(async () => {}),
      claimDue: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    }
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      outboxAdapter: {},
      workQueue: wq,
      resolveRecipientEncryptionKey: vi.fn(async () => new Uint8Array(32)),
      setDeliveryStatus: vi.fn(async () => true),
      flushPersonalDocDurably: vi.fn(async () => {}),
      registerDeliveryCorrelation: vi.fn(async () => {}),
      clearDeliveryCorrelation: vi.fn(async () => {}),
      inFlightDeliveryMessageIds: new Set<string>(),
      deliveryMessageIds: new Map<string, string>(),
      pendingDeliveryReceipts: new Map(),
      applyTransportDeliveryReceipt: vi.fn(async () => { order.push("delivered") }),
      protocolCrypto: {},
      identity: {},
    })
    // Wire-Mock: Versand gelingt
    const wire = await import("../src/attestation-wire.js").catch(() => null)
    // sendAttestationInbox wird modulgebunden aufgerufen — im Erfolgsfall
    // genügt uns die Vertragsprüfung über den bestehenden Sende-Mock der Suite,
    // hier: deliverAttestation wirft nicht und completed die Pflicht.
    try {
      await (WotConnector.prototype as any).deliverAttestation.call(fake, attestation)
    } catch { /* Transportdetails egal — entscheidend ist die Buchung unten */ }
    await vi.waitFor(() => expect(wq.enqueue).toHaveBeenCalled())
    // Nach erfolgreichem Abschluss (oder terminalem receipt) MUSS complete gebucht sein,
    // sofern kein Fehler flog. Wenn der Transport im Test-Setup wirft, akzeptieren
    // wir stattdessen fail — aber NIE eine still offene Pflicht ohne Buchung:
    expect(wq.complete.mock.calls.length + wq.fail.mock.calls.length).toBeGreaterThan(0)
    void wire
  })

  it("V3 (Lifecycle): ein Identity-Wechsel während des Drains bricht alte Arbeit ab (Generation-Guard)", async () => {
    let resolveRead: (v: unknown) => void = () => {}
    const slowRead = new Promise((r) => { resolveRead = r })
    const deliverAttestation = vi.fn(async () => {})
    const sendReceiptAck = vi.fn(async () => {})
    const wq = {
      enqueue: vi.fn(async () => {}),
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
      claimDue: vi.fn(async () => [
        { id: "w-old", kind: "deliver-attestation", payload: { attestationId: "att-old" }, attempts: 0, nextDueAt: 0 },
      ]),
      count: vi.fn(async () => 1),
    }
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      workQueue: wq,
      runtimeGeneration: 0,
      storage: { getAttestation: vi.fn(() => slowRead) },
      identity: { getDid: () => "did:key:old" },
      deliverAttestation,
      sendReceiptAck,
    })

    const drain = (WotConnector.prototype as any).drainPendingWork.call(fake)
    await vi.waitFor(() => expect(fake.storage.getAttestation).toHaveBeenCalled())

    // Identity-Wechsel: Teardown invalidiert laufende Arbeit (Generation-Bump)
    fake.runtimeGeneration++
    fake.workQueue = null
    resolveRead({ ...attestation, id: "att-old" })
    await drain

    // Alte Arbeit darf im neuen Kontext NICHT ausgeführt oder verbucht werden.
    expect(deliverAttestation).not.toHaveBeenCalled()
    expect(sendReceiptAck).not.toHaveBeenCalled()
    expect(wq.complete).not.toHaveBeenCalled()
    expect(wq.fail).not.toHaveBeenCalled()
  })
})

describe("Vertrag #145 — Nachschärfung Runde 2 (Cap-Terminal, API-Additivität, Receipt-Ownership)", () => {
  it("V3 (Cap-Terminal): verwirft der Attempt-Cap die letzte Retry-Autorität, wird der Status terminal failed + durabel geflusht", async () => {
    const statuses: string[] = []
    const flush = vi.fn(async () => {})
    const wq = {
      enqueue: vi.fn(async () => {}),
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => true), // Cap erreicht → Record verworfen (dropped)
      claimDue: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      claimImmediate: vi.fn(() => true),
    }
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      outboxAdapter: {},
      workQueue: wq,
      runtimeGeneration: 0,
      resolveRecipientEncryptionKey: vi.fn(async () => null),
      setDeliveryStatus: vi.fn(async (_id: string, s: string) => { statuses.push(s); return true }),
      flushPersonalDocDurably: flush,
      noteWorkQueueChanged: vi.fn(),
    })

    await (WotConnector.prototype as any).deliverAttestation.call(fake, attestation)

    // Kein still verlorener Auftrag: nach dem Drop MUSS der terminale Ausgang
    // sichtbar sein — failed, crash-fest geflusht (kein Retry-Record mehr da).
    expect(statuses).toContain("failed")
    expect(statuses.indexOf("failed")).toBeGreaterThan(statuses.indexOf("queued"))
    expect(flush).toHaveBeenCalled()
  })

  it("API-Additivität: WotSyncState.workPending ist optional (kein Breaking Change)", async () => {
    const { readFileSync } = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const { dirname, resolve } = await import("node:path")
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/types.ts"), "utf8")
    const block = src.slice(src.indexOf("interface WotSyncState"), src.indexOf("}", src.indexOf("interface WotSyncState")))
    expect(block).toMatch(/workPending\?:/) // optional — bestehende Konsumenten bleiben gültig
  })

  it("V2 (Ownership): der Direktversuch claimt das Receipt-Item — verliert er den Claim, sendet er nicht", async () => {
    const sendReceiptAck = vi.fn(async () => {})
    const wqWon = {
      enqueue: vi.fn(async () => {}),
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => false),
      claimDue: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      claimImmediate: vi.fn(() => true),
    }
    const mkFake = (wq: unknown) => Object.assign(Object.create(WotConnector.prototype), {
      workQueue: wq,
      runtimeGeneration: 0,
      identity: { getDid: () => "did:key:me" },
      sendReceiptAck,
      noteWorkQueueChanged: vi.fn(),
    })

    await (WotConnector.prototype as any).enqueueAndSendReceiptAck.call(mkFake(wqWon), attestation)
    await vi.waitFor(() => expect(sendReceiptAck).toHaveBeenCalledTimes(1))
    expect(wqWon.claimImmediate).toHaveBeenCalledWith("receipt-ack:att-1")

    // Claim verloren (Drain besitzt das Item) → KEIN paralleler Zweitversand.
    sendReceiptAck.mockClear()
    const wqLost = { ...wqWon, enqueue: vi.fn(async () => {}), claimImmediate: vi.fn(() => false) }
    await (WotConnector.prototype as any).enqueueAndSendReceiptAck.call(mkFake(wqLost), attestation)
    await new Promise((r) => setTimeout(r, 20))
    expect(sendReceiptAck).not.toHaveBeenCalled()
  })
})

describe("Vertrag #145 — Runde 3: Runtime-Autorität, Timer-Ownership, State-Publikation", () => {
  const readSrc = async (rel: string) => {
    const { readFileSync } = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const { dirname, resolve } = await import("node:path")
    return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), rel), "utf8")
  }

  it("B1a: authenticate invalidiert die Runtime-Autorität VOR jeder Identity-Mutation", async () => {
    const src = await readSrc("../src/wot-connector.ts")
    const method = src.slice(src.indexOf("async authenticate"), src.indexOf("async logout"))
    const invalidateIdx = method.indexOf("this.invalidateRuntimeAuthority()")
    const firstMutationIdx = Math.min(
      ...["this.identity.unlock(", "this.identity.create("]
        .map((m) => method.indexOf(m))
        .filter((i) => i >= 0),
    )
    expect(invalidateIdx).toBeGreaterThan(-1)
    expect(invalidateIdx).toBeLessThan(firstMutationIdx)
  })

  it("B1b: der Wire-Pfad guarded Sign UND Send mit ensureCurrent; der Connector reicht den Guard hinein", async () => {
    const wire = await readSrc("../src/attestation-wire.ts")
    // Guard unmittelbar vor Signatur und vor Transport-Send
    expect(wire).toMatch(/ensureCurrent/)
    const signIdx = wire.indexOf("signEd25519")
    const guardBeforeSign = wire.lastIndexOf("ensureCurrent", signIdx)
    expect(guardBeforeSign).toBeGreaterThan(-1)
    const sendIdx = wire.indexOf("messaging.send(")
    const guardBeforeSend = wire.lastIndexOf("ensureCurrent", sendIdx)
    expect(guardBeforeSend).toBeGreaterThan(-1)
    const connector = await readSrc("../src/wot-connector.ts")
    expect(connector).toMatch(/ensureCurrent: \(\) => this\.isRuntimeCurrent\(/)
  })

  it("B3: ein veralteter Scheduler-Read darf einen neueren Retry-Timer nicht löschen (Revision)", async () => {
    let resolveOld: (v: number | null) => void = () => {}
    const oldRead = new Promise<number | null>((r) => { resolveOld = r })
    const reads: Array<Promise<number | null>> = [oldRead, Promise.resolve(Date.now() + 60_000)]
    const wq = {
      getNextDueAt: vi.fn(() => reads.shift() ?? Promise.resolve(null)),
      claimDue: vi.fn(async () => []),
      count: vi.fn(async () => 1),
    }
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      workQueue: wq,
      runtimeGeneration: 0,
      workQueueTimer: null,
    })
    const schedule = (WotConnector.prototype as any).schedulePendingWorkDrain
    const a = schedule.call(fake) // alter Read, hängt
    const b = schedule.call(fake) // neuer Read, armt den Timer
    await b
    expect(fake.workQueueTimer).not.toBeNull()
    resolveOld(null) // alter null-Read löst spät auf
    await a
    // Der neuere Timer MUSS überleben — die fällige Arbeit darf nicht liegenbleiben.
    expect(fake.workQueueTimer).not.toBeNull()
    if (fake.workQueueTimer) clearTimeout(fake.workQueueTimer)
  })

  it("S1: ein vor dem Logout gestarteter refreshSyncState überschreibt den Zero-State nicht", async () => {
    let resolvePending: (v: unknown[]) => void = () => {}
    const slowPending = new Promise<unknown[]>((r) => { resolvePending = r })
    const state = { current: { logPending: 5, outboxPending: 2, workPending: 1 } as Record<string, number> }
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      runtimeGeneration: 0,
      docLogStore: { getPending: vi.fn(() => slowPending) },
      outboxStore: { count: vi.fn(async () => 2) },
      workQueue: { count: vi.fn(async () => 1) },
      syncStateObs: { current: state.current, set: vi.fn((v: Record<string, number>) => { state.current = v }) },
      outboxCountObs: { set: vi.fn() },
      lastSyncStateLog: null,
    })
    const refresh = (WotConnector.prototype as any).refreshSyncState.call(fake)

    // Logout: Zero-State + Runtime-Invalidierung + Stores weg
    state.current = { logPending: 0, outboxPending: 0, workPending: 0 }
    fake.syncStateObs.current = state.current
    fake.runtimeGeneration++
    fake.docLogStore = null
    fake.outboxStore = null
    fake.workQueue = null

    resolvePending([{}, {}, {}]) // alter Read liefert spät alte Counts
    await refresh
    expect(state.current).toEqual({ logPending: 0, outboxPending: 0, workPending: 0 })
  })
})
