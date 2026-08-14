import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

import { InitialSyncTracker } from "../src/initial-sync-tracker.js"

describe("InitialSyncTracker", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const tracker = () => new InitialSyncTracker({ settleMs: 2000, maxMs: 20_000 })

  it("meldet keinen Erstsync für eine frisch erzeugte Identität", () => {
    const t = tracker()
    t.begin({ expectRemoteData: false, localGroups: 0 })
    expect(t.observe().current.active).toBe(false)
  })

  it("meldet keinen Erstsync, wenn das Gerät die Gruppen schon lokal hat", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 3 })
    expect(t.observe().current.active).toBe(false)
  })

  it("meldet Erstsync, solange auf einem leeren Gerät noch etwas eintrifft", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    expect(t.observe().current.active).toBe(true)

    vi.advanceTimersByTime(1999)
    expect(t.observe().current.active).toBe(true)

    // Nachschub setzt das Ruhefenster zurück
    t.noteActivity()
    vi.advanceTimersByTime(1999)
    expect(t.observe().current.active).toBe(true)

    vi.advanceTimersByTime(1)
    expect(t.observe().current.active).toBe(false)
  })

  it("beendet den Erstsync spätestens nach der Obergrenze", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    // Dauerbetrieb: alle 1000ms trifft etwas ein, das Ruhefenster wird nie leer.
    for (let elapsed = 0; elapsed < 20_000; elapsed += 1000) {
      vi.advanceTimersByTime(1000)
      t.noteActivity()
    }
    expect(t.observe().current.active).toBe(false)
  })

  it("veröffentlicht die Zahl der bereits bekannten Gruppen", () => {
    const t = tracker()
    const seen: number[] = []
    t.observe().subscribe(() => seen.push(t.observe().current.knownGroups))

    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setKnownGroups(2)
    t.setKnownGroups(5)

    expect(t.observe().current.knownGroups).toBe(5)
    expect(seen).toContain(2)
    expect(seen).toContain(5)
  })

  it("zählt eine neue Gruppe als Nachschub — die Anzeige bleibt", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    vi.advanceTimersByTime(1500)
    t.setKnownGroups(1)
    vi.advanceTimersByTime(1500)
    expect(t.observe().current.active).toBe(true)
  })

  it("schaltet beim Abmelden ab und lässt keinen Timer zurück", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.end()
    expect(t.observe().current.active).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("hört auf zu behaupten, es käme noch etwas, wenn die Verbindung weg ist", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setRelayConnected(false)
    expect(t.observe().current.active).toBe(false)
  })

  it("nimmt den Erstsync wieder auf, sobald die Verbindung zurück ist", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setRelayConnected(false)
    t.setRelayConnected(true)
    expect(t.observe().current.active).toBe(true)
    vi.advanceTimersByTime(2000)
    expect(t.observe().current.active).toBe(false)
  })
})
