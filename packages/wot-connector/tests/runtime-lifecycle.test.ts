import { describe, it, expect, vi } from "vitest"

import { WotConnector } from "../src/wot-connector.js"

/**
 * Lebenszyklus-Grenzen der beiden asynchronen Pfade aus rls#265
 * (Loop-Review codex-gpt-5.6, beide Blocker).
 *
 * Beide Methoden werden über den etablierten Methoden-Seam an ein schmales
 * Fake gebunden: geprüft wird die echte Implementierung, nicht ein Nachbau.
 */

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe("runRestoreSpacesFlight — Identitätswechsel während des Laufs", () => {
  it("reconciled NICHT in die neue Runtime hinein", async () => {
    const hanging = deferred<void>()
    const oldReplication = { restoreSpacesFromMetadata: vi.fn(() => hanging.promise) }
    const queuePrivateSpaceReconcile = vi.fn(async () => {})
    const fake: any = {
      runtimeGeneration: 1,
      replication: oldReplication,
      queuePrivateSpaceReconcile,
    }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    const flight = (WotConnector.prototype as any).runRestoreSpacesFlight.call(fake)
    expect(oldReplication.restoreSpacesFromMetadata).toHaveBeenCalledTimes(1)

    // Identitätswechsel: neue Generation, neuer Replication-Stack.
    fake.runtimeGeneration = 2
    fake.replication = { restoreSpacesFromMetadata: vi.fn(async () => {}) }

    hanging.resolve()
    await flight

    expect(queuePrivateSpaceReconcile).not.toHaveBeenCalled()
  })

  it("reconciled normal, solange die Runtime dieselbe bleibt", async () => {
    const queuePrivateSpaceReconcile = vi.fn(async () => {})
    const replication = { restoreSpacesFromMetadata: vi.fn(async () => {}) }
    const fake: any = { runtimeGeneration: 7, replication, queuePrivateSpaceReconcile }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    await (WotConnector.prototype as any).runRestoreSpacesFlight.call(fake)

    expect(queuePrivateSpaceReconcile).toHaveBeenCalledWith({ createIfMissing: false })
  })
})

describe("noteSyncFrame — Reihenfolge der Head-Vergleiche", () => {
  it("lässt eine ältere Auswertung den neueren Stand nicht überschreiben", async () => {
    const slowLookup = deferred<Record<string, number>>()
    const noteDocSync = vi.fn()
    const fake: any = {
      runtimeGeneration: 1,
      syncFrameTokens: new Map<string, number>(),
      syncFrameSeq: 0,
      docLogStore: { getStrictContiguousHeads: vi.fn(() => slowLookup.promise) },
      initialSync: { noteDocSync },
    }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    // Älterer Rahmen: „letzte Seite", muss aber erst den lokalen Stand lesen.
    const older = (WotConnector.prototype as any).noteSyncFrame.call(fake, {
      docId: "doc-1", truncated: false, heads: { device: 5 },
    })
    // Neuerer Rahmen: offene Seite, entscheidet sofort.
    await (WotConnector.prototype as any).noteSyncFrame.call(fake, {
      docId: "doc-1", truncated: true, heads: {},
    })
    expect(noteDocSync).toHaveBeenCalledWith({ docId: "doc-1", outstanding: true })

    // Jetzt kommt die alte Fortsetzung zurück — sie darf nichts mehr sagen.
    slowLookup.resolve({ device: 5 })
    await older

    expect(noteDocSync).toHaveBeenCalledTimes(1)
  })

  it("überschreibt nach einem Re-Login nicht den Zustand der neuen Runtime (ABA)", async () => {
    const slowLookup = deferred<Record<string, number>>()
    const noteDocSync = vi.fn()
    const oldStore = { getStrictContiguousHeads: vi.fn(() => slowLookup.promise) }
    const fake: any = {
      runtimeGeneration: 1,
      syncFrameTokens: new Map<string, number>(),
      syncFrameSeq: 0,
      docLogStore: oldStore,
      initialSync: { noteDocSync },
    }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    // Alter finaler Rahmen hängt im Lookup.
    const older = (WotConnector.prototype as any).noteSyncFrame.call(fake, {
      docId: "doc-1", truncated: false, heads: { device: 5 },
    })

    // Teardown + neue Runtime derselben Identität: Map geleert, neuer Store.
    fake.syncFrameTokens.clear()
    fake.runtimeGeneration = 2
    fake.docLogStore = { getStrictContiguousHeads: vi.fn(async () => ({ device: 0 })) }

    // Erster Rahmen der neuen Runtime für dasselbe deterministische Dokument.
    await (WotConnector.prototype as any).noteSyncFrame.call(fake, {
      docId: "doc-1", truncated: true, heads: {},
    })
    expect(noteDocSync).toHaveBeenLastCalledWith({ docId: "doc-1", outstanding: true })

    // Die alte Fortsetzung darf den neuen Zustand nicht mehr umschreiben.
    slowLookup.resolve({ device: 5 })
    await older

    expect(noteDocSync).toHaveBeenCalledTimes(1)
    expect(noteDocSync).toHaveBeenLastCalledWith({ docId: "doc-1", outstanding: true })
  })

  it("veröffentlicht die jüngste Auswertung", async () => {
    const noteDocSync = vi.fn()
    const fake: any = {
      runtimeGeneration: 1,
      syncFrameTokens: new Map<string, number>(),
      syncFrameSeq: 0,
      docLogStore: { getStrictContiguousHeads: vi.fn(async () => ({ device: 2 })) },
      initialSync: { noteDocSync },
    }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    // Relay ist bei 9, lokal lückenlos bis 2 — es fehlt nachweislich etwas.
    await (WotConnector.prototype as any).noteSyncFrame.call(fake, {
      docId: "doc-1", truncated: false, heads: { device: 9 },
    })

    expect(noteDocSync).toHaveBeenCalledWith({ docId: "doc-1", outstanding: true })
  })
})
