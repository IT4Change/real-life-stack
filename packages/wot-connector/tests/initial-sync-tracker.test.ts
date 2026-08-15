import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

import { InitialSyncTracker } from "../src/initial-sync-tracker.js"

describe("InitialSyncTracker", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const tracker = () => new InitialSyncTracker({ settleMs: 2000, maxMs: 20_000, noDataMs: 8000 })

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

  it("meldet Erstsync auf einem leeren Gerät sofort", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    expect(t.observe().current.active).toBe(true)
  })

  it("beendet den Nachlauf, wenn nach der letzten Gruppe Ruhe einkehrt", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setGroupCounts({ loaded: 2, expected: 2 })

    // Inhalte trudeln noch ein — jedes Eintreffen verlängert.
    vi.advanceTimersByTime(1999)
    t.noteActivity()
    vi.advanceTimersByTime(1999)
    expect(t.observe().current.active).toBe(true)

    vi.advanceTimersByTime(1)
    expect(t.observe().current.active).toBe(false)
  })

  it("beendet den Erstsync spätestens nach der Obergrenze", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setGroupCounts({ loaded: 1, expected: 99 })
    // Dauerbetrieb: alle 1000ms trifft etwas ein, das Ruhefenster wird nie leer.
    for (let elapsed = 0; elapsed < 20_000; elapsed += 1000) {
      vi.advanceTimersByTime(1000)
      t.noteActivity()
    }
    expect(t.observe().current.active).toBe(false)
  })

  it("veröffentlicht die Zahl der bereits geladenen Gruppen", () => {
    const t = tracker()
    const seen: number[] = []
    t.observe().subscribe(() => seen.push(t.observe().current.loadedGroups))

    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setGroupCounts({ loaded: 2, expected: 5 })
    t.setGroupCounts({ loaded: 5, expected: 5 })

    expect(t.observe().current.loadedGroups).toBe(5)
    expect(seen).toContain(2)
    expect(seen).toContain(5)
  })

  it("zählt eine neue Gruppe als Nachschub — die Anzeige bleibt", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    vi.advanceTimersByTime(1500)
    t.setGroupCounts({ loaded: 1, expected: null })
    vi.advanceTimersByTime(1500)
    expect(t.observe().current.active).toBe(true)
  })

  it("hört NICHT auf, solange die PersonalDoc mehr Gruppen kennt als da sind", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    // Die Mitgliedschaftsliste sagt 12, angekommen sind 3 — eine Ruhepause
    // (z.B. während des Schlüsselaustauschs) ist dann KEIN Fertig-Signal.
    t.setGroupCounts({ loaded: 3, expected: 12 })

    // Weit über dem Ruhefenster von 2000ms, aber unter der Obergrenze.
    vi.advanceTimersByTime(19_999)
    expect(t.observe().current.active).toBe(true)
    expect(t.observe().current.expectedGroups).toBe(12)
  })

  it("hält durch, solange überhaupt noch nichts eingetroffen ist", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    // Das persönliche Dokument ist beim Login bereits initialisiert, aber noch
    // leer: es meldet 0 erwartete Gruppen. „0 von 0" ist hier KEIN
    // Vollzugsmeldung, sondern schlicht „noch nichts da".
    t.setGroupCounts({ loaded: 0, expected: 0 })

    vi.advanceTimersByTime(2000)
    expect(t.observe().current.active).toBe(true)

    // Sobald die Mitgliedschaftsliste eintrifft, greift wieder der Vergleich.
    t.setGroupCounts({ loaded: 0, expected: 12 })
    vi.advanceTimersByTime(5000)
    expect(t.observe().current.active).toBe(true)
  })

  it("beendet das Wartefenster auch, wenn nur eine Gruppe auftaucht", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    // Gruppe da, Mitgliedschaftsliste (noch) ohne Aussage: das Wartefenster
    // darf hier nicht mehr zuschlagen, sonst endet die Anzeige mitten im Lauf.
    t.setGroupCounts({ loaded: 1, expected: null })

    vi.advanceTimersByTime(8000)
    expect(t.observe().current.active).toBe(true)
  })

  it("gibt auf, wenn nach dem Wartefenster nichts gekommen ist (leeres Konto)", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setGroupCounts({ loaded: 0, expected: 0 })

    // Kein Dauerspinner für jemanden, der wirklich in keiner Gruppe ist.
    vi.advanceTimersByTime(10_000)
    expect(t.observe().current.active).toBe(false)
  })

  it("hält durch, solange der Relay offene Seiten gemeldet hat", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setGroupCounts({ loaded: 4, expected: 4 })
    // Der Relay sagt selbst: für dieses Dokument kommt noch mehr.
    t.noteDocSync({ docId: "personal", outstanding: true })

    vi.advanceTimersByTime(19_999)
    expect(t.observe().current.active).toBe(true)

    t.noteDocSync({ docId: "personal", outstanding: false })
    vi.advanceTimersByTime(2000)
    expect(t.observe().current.active).toBe(false)
  })

  it("wartet auf jedes Dokument einzeln", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setGroupCounts({ loaded: 2, expected: 2 })
    t.noteDocSync({ docId: "space-a", outstanding: true })
    t.noteDocSync({ docId: "space-b", outstanding: true })

    t.noteDocSync({ docId: "space-a", outstanding: false })
    vi.advanceTimersByTime(2000)
    expect(t.observe().current.active).toBe(true)

    t.noteDocSync({ docId: "space-b", outstanding: false })
    vi.advanceTimersByTime(2000)
    expect(t.observe().current.active).toBe(false)
  })

  it("kehrt zurück, wenn der Relay Minuten später wieder eine offene Seite meldet", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setGroupCounts({ loaded: 4, expected: 4 })
    vi.advanceTimersByTime(2000)
    expect(t.observe().current.active).toBe(false)

    vi.advanceTimersByTime(5 * 60_000)
    t.noteDocSync({ docId: "space-spaet", outstanding: true })
    expect(t.observe().current.active).toBe(true)
  })

  it("kehrt zurück, wenn Minuten später die nächste Gruppe angekündigt wird", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setGroupCounts({ loaded: 4, expected: 4 })
    vi.advanceTimersByTime(2000)
    expect(t.observe().current.active).toBe(false)

    // Die Mitgliedschaftsliste wächst weiter — bei Anton Minuten später. Die
    // Anzeige muss dann wiederkommen, statt einmalig verbraucht zu sein.
    vi.advanceTimersByTime(5 * 60_000)
    t.setGroupCounts({ loaded: 4, expected: 5 })
    expect(t.observe().current.active).toBe(true)

    t.setGroupCounts({ loaded: 5, expected: 5 })
    vi.advanceTimersByTime(2000)
    expect(t.observe().current.active).toBe(false)
  })

  it("kehrt NICHT zurück, wenn die Liste vollständig bleibt", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setGroupCounts({ loaded: 3, expected: 3 })
    vi.advanceTimersByTime(2000)
    expect(t.observe().current.active).toBe(false)

    // Reines Nachladen von Inhalten ist kein Grund, wieder „lädt" zu behaupten.
    t.noteActivity()
    expect(t.observe().current.active).toBe(false)
  })

  it("beendet erst, wenn alle erwarteten Gruppen da sind UND Ruhe eingekehrt ist", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setGroupCounts({ loaded: 12, expected: 12 })

    vi.advanceTimersByTime(1999)
    expect(t.observe().current.active).toBe(true)
    vi.advanceTimersByTime(1)
    expect(t.observe().current.active).toBe(false)
  })

  it("gibt auch bei unvollständiger Liste nach der Obergrenze auf", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.setGroupCounts({ loaded: 1, expected: 12 })

    vi.advanceTimersByTime(20_000)
    expect(t.observe().current.active).toBe(false)
  })

  it("schaltet beim Abmelden ab und lässt keinen Timer zurück", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.end()
    expect(t.observe().current.active).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("lässt sich nach dem Abmelden nicht von einem Nachzügler wiederbeleben", () => {
    const t = tracker()
    t.begin({ expectRemoteData: true, localGroups: 0 })
    t.end()
    // Ein Zähler, der noch aus dem Teardown herausfällt, darf keine Anzeige
    // über einer abgemeldeten App aufspannen.
    t.setGroupCounts({ loaded: 0, expected: 5 })
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
    t.setGroupCounts({ loaded: 2, expected: 2 })
    t.setRelayConnected(false)
    expect(t.observe().current.active).toBe(false)

    t.setRelayConnected(true)
    expect(t.observe().current.active).toBe(true)
    vi.advanceTimersByTime(2000)
    expect(t.observe().current.active).toBe(false)
  })
})
