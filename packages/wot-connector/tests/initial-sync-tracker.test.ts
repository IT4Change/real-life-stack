import { describe, it, expect } from "vitest"

import { InitialSyncTracker } from "../src/initial-sync-tracker.js"

/**
 * Der Tracker ist seit web-of-trust#343 eine Übersetzung, keine
 * Zustandsmaschine: der Adapter sagt, ob noch etwas aussteht, die
 * Mitgliedschaftsliste liefert die Zahlen für die Anzeige. Entsprechend braucht
 * es hier keine falschen Uhren mehr — und keine echten.
 */
describe("InitialSyncTracker", () => {
  const tracker = () => new InitialSyncTracker()

  it("meldet keinen Erstsync für eine frisch erzeugte Identität", () => {
    const t = tracker()
    t.begin({ expectRemoteData: false, localGroups: 0 })
    t.setOutstanding(true)
    expect(t.observe().current.active).toBe(false)
  })

  it("meldet keinen Erstsync, wenn das Gerät die Gruppen schon lokal hat", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 3 })
    t.setOutstanding(true)
    expect(t.observe().current.active).toBe(false)
  })

  it("bleibt sichtbar, wenn beim Login schon EINE von mehreren Gruppen da ist", () => {
    const t = tracker()
    // Bootstrap-Reihenfolge: der Sync läuft, bevor der lokale Lesevorgang
    // durch ist. Trifft die erste Gruppe vorher ein, meldet `begin()` sie als
    // „lokal vorhanden" — der laufende Erstsync darf davon nicht unsichtbar
    // werden, solange die Mitgliedschaftsliste mehr kennt.
    t.setOutstanding(true)
    t.setGroupCounts({ loaded: 1, expected: 7 })
    t.begin({ expectRemoteData: true, localGroups: 1 })

    expect(t.observe().current).toMatchObject({ active: true, loadedGroups: 1, expectedGroups: 7 })
  })

  it("liest ein leeres persönliches Dokument beim Login NICHT als „fertig“", () => {
    const t = tracker()
    // Beim Login ist die PersonalDoc initialisiert, aber leer: sie meldet 0
    // erwartete Gruppen. „0 von 0" ist hier kein Vollzug, sondern „noch
    // nichts da" — sonst bleibt der ganze Erstsync unsichtbar.
    t.setGroupCounts({ loaded: 0, expected: 0 })
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setOutstanding(true)

    expect(t.observe().current.active).toBe(true)
  })

  it("schweigt beim Reload eines vollständigen Geräts", () => {
    const t = tracker()
    // Alle Gruppen liegen lokal, die Liste kennt keine weiteren: ein laufender
    // Catch-up ist hier normaler Betrieb, keine Erstbefüllung.
    t.setGroupCounts({ loaded: 7, expected: 7 })
    t.begin({ expectRemoteData: true, localGroups: 7 })
    t.setOutstanding(true)

    expect(t.observe().current.active).toBe(false)
  })

  it("meldet Erstsync, solange der Adapter etwas Offenes kennt", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    expect(t.observe().current.active).toBe(false)

    t.setOutstanding(true)
    expect(t.observe().current.active).toBe(true)
  })

  it("endet erst, wenn nichts mehr aussteht", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setOutstanding(true)
    t.setGroupCounts({ loaded: 7, expected: 7 })
    expect(t.observe().current.active).toBe(true)

    t.setOutstanding(false)
    expect(t.observe().current.active).toBe(false)
  })

  it("kehrt zurück, wenn Minuten später wieder etwas aussteht — solange nichts da ist", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setOutstanding(true)
    t.setOutstanding(false)
    expect(t.observe().current.active).toBe(false)

    // Ohne eine einzige Gruppe ist die Ruhe kein Beleg für Vollständigkeit.
    t.setOutstanding(true)
    expect(t.observe().current.active).toBe(true)
  })

  it("behandelt spätere Catch-ups als normalen Betrieb, sobald Gruppen da sind", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setOutstanding(true)
    t.setGroupCounts({ loaded: 7, expected: 7 })
    t.setOutstanding(false)

    // Eine Einladung am nächsten Tag ist kein Erstsync mehr.
    t.setOutstanding(true)
    expect(t.observe().current.active).toBe(false)
  })

  it("veröffentlicht die Gruppenzahlen für die Anzeige", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setOutstanding(true)
    t.setGroupCounts({ loaded: 3, expected: 12 })

    expect(t.observe().current).toMatchObject({ active: true, loadedGroups: 3, expectedGroups: 12 })
  })

  it("verwirft beim Identitätswechsel den Stand der vorigen Identität", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setOutstanding(true)
    t.setGroupCounts({ loaded: 3, expected: 9 })
    t.end()

    t.prepare()
    expect(t.observe().current).toEqual({ active: false, loadedGroups: 0, expectedGroups: null })
  })

  it("friert den Zustand nach dem Abmelden ein", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setOutstanding(true)
    t.setGroupCounts({ loaded: 2, expected: 6 })
    t.end()
    const afterEnd = { ...t.observe().current }

    // Nachzügler aus der abgeräumten Runtime dürfen nichts mehr ändern.
    t.setOutstanding(true)
    t.setGroupCounts({ loaded: 0, expected: 5 })

    expect(t.observe().current).toEqual(afterEnd)
  })
})
