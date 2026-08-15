import { describe, it, expect } from "vitest"

import { readSyncResponse, SYNC_RESPONSE_MESSAGE_TYPE } from "../src/sync-frame-watcher.js"

function frame(body: unknown) {
  return { type: SYNC_RESPONSE_MESSAGE_TYPE, id: "m1", from: "did:key:alice", body }
}

describe("readSyncResponse", () => {
  it("liest docId und truncated aus einer Sync-Antwort", () => {
    const observed = readSyncResponse(frame({ docId: "doc-1", entries: [], heads: {}, truncated: true }))
    expect(observed).toEqual({ docId: "doc-1", truncated: true })
  })

  it("erkennt die abschliessende Seite", () => {
    const observed = readSyncResponse(frame({ docId: "doc-1", entries: ["e"], heads: { d1: 3 }, truncated: false }))
    expect(observed).toEqual({ docId: "doc-1", truncated: false })
  })

  it("ignoriert alles andere auf der Leitung", () => {
    expect(readSyncResponse(null)).toBeNull()
    expect(readSyncResponse({ type: "content", body: {} })).toBeNull()
    expect(readSyncResponse({ type: SYNC_RESPONSE_MESSAGE_TYPE })).toBeNull()
  })

  it("verwirft Rahmen ohne belastbare Felder, statt sie zu raten", () => {
    // Ein fehlendes `truncated` als „fertig" zu lesen wäre genau die Sorte
    // Annahme, die die Anzeige vorher zu früh beendet hat.
    expect(readSyncResponse(frame({ docId: "doc-1", entries: [], heads: {} }))).toBeNull()
    expect(readSyncResponse(frame({ entries: [], heads: {}, truncated: false }))).toBeNull()
    expect(readSyncResponse(frame({ docId: 42, truncated: false }))).toBeNull()
  })
})
