import { describe, it, expect, vi } from "vitest"

import { WotConnector } from "../src/wot-connector.js"

/**
 * Lebenszyklus-Grenze des Restore-Flights (rls#265).
 *
 * Über den etablierten Methoden-Seam an ein schmales Fake gebunden: geprüft
 * wird die echte Implementierung, nicht ein Nachbau.
 *
 * Die früheren `noteSyncFrame`-Tests sind mit dem Wire-Mitleser entfallen — der
 * Catch-up-Zustand kommt jetzt aus dem Adapter (web-of-trust#343), und dessen
 * Lebenszyklus-Grenzen sind dort getestet.
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
