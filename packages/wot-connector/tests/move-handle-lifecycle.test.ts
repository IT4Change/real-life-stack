import { describe, expect, it, vi } from "vitest"
import { WotConnector } from "../src/wot-connector"
import type { RlsSpaceDoc } from "../src/types"

/**
 * `moveItemToGroup` oeffnet ZWEI SpaceHandles. Jedes registriert einen
 * Yjs-Listener; wird es nicht geschlossen, sammeln wiederholte Moves
 * Ressourcen an (rls#270). Gilt auch fuer die Fehlerpfade — der
 * Autoren-Guard wirft mitten in der Methode.
 */
function harness(items: Record<string, unknown> = {}, indexItems = items) {
  const closed: string[] = []
  const opened: string[] = []
  const makeHandle = (spaceId: string, doc: RlsSpaceDoc) => ({
    getDoc: () => doc,
    transact: (fn: (d: RlsSpaceDoc) => void) => fn(doc),
    onRemoteUpdate: () => () => {},
    close: () => { closed.push(spaceId) },
  })
  const docs: Record<string, RlsSpaceDoc> = {
    quelle: { _type: "rls", items: { ...items } } as RlsSpaceDoc,
    ziel: { _type: "rls", items: {} } as RlsSpaceDoc,
  }
  const value = Object.create(WotConnector.prototype) as any
  value.handleReady = Promise.resolve()
  value.replication = {
    openSpace: async (id: string) => { opened.push(id); return makeHandle(id, docs[id]) },
  }
  value.currentUserObs = { current: { id: "did:key:me" } }
  value.currentGroupId = "quelle"
  // Eigenes Doc fuer den Index-Lookup: so laesst sich der Fall bauen, in dem
  // getItemGroupId das Item noch kennt, das Quell-Dokument es aber nicht mehr
  // enthaelt (Wettlauf) — dann IST ein Handle offen, wenn der Fehler faellt.
  value.currentHandle = makeHandle("index", { _type: "rls", items: { ...indexItems } } as RlsSpaceDoc)
  value.crossGroupIndex = null
  value.activityObservables = new Map()
  value.notifyAllObservers = vi.fn()
  value.appendActivity = vi.fn()
  return { connector: value as WotConnector, opened, closed, docs }
}

const item = (createdBy: string, type = "post") => ({
  id: "i1", type, createdAt: "2026-08-01T00:00:00.000Z", createdBy, data: {},
})

describe("moveItemToGroup — Handle-Lebenszyklus", () => {
  it("schliesst BEIDE Handles nach einem erfolgreichen Move", async () => {
    const { connector, opened, closed } = harness({ i1: item("did:key:me") })
    await connector.moveItemToGroup("i1", "ziel")
    expect(opened).toEqual(["quelle", "ziel"])
    expect(closed.sort()).toEqual(["quelle", "ziel"])
  })

  it("schliesst das Quell-Handle auch, wenn der Autoren-Guard wirft", async () => {
    const { connector, closed } = harness({ i1: item("did:key:jemand-anderes", "comment") })
    await expect(connector.moveItemToGroup("i1", "ziel")).rejects.toThrow(/authorized/i)
    // Ohne finally bliebe hier ein Listener zurueck — und genau dieser Pfad
    // ist durch den neuen Guard ueberhaupt erst erreichbar.
    expect(closed).toContain("quelle")
  })

  it("schliesst das Quell-Handle, wenn das Item dort zwischenzeitlich fehlt", async () => {
    // Index kennt es, Quell-Dokument nicht mehr — Handle ist offen, wenn der
    // Fehler faellt.
    const { connector, opened, closed } = harness({}, { i1: item("did:key:me") })
    await expect(connector.moveItemToGroup("i1", "ziel")).rejects.toThrow(/not found in source/i)
    expect(opened).toEqual(["quelle"])
    expect(closed).toEqual(["quelle"])
  })

  it("laesst in KEINEM Fall ein Handle offen (Invariante)", async () => {
    for (const [items, index] of [
      [{ i1: item("did:key:me") }, undefined],
      [{ i1: item("did:key:jemand-anderes", "comment") }, undefined],
      [{}, { i1: item("did:key:me") }],
    ] as const) {
      const { connector, opened, closed } = harness(items as never, (index ?? items) as never)
      await connector.moveItemToGroup("i1", "ziel").catch(() => undefined)
      expect(closed.slice().sort()).toEqual(opened.slice().sort())
    }
  })
})
