import { describe, it, expect } from "vitest"

import { relayIsAhead } from "../src/sync-frame-watcher.js"

describe("relayIsAhead", () => {
  it("erkennt fehlende Einträge eines bekannten Geräts", () => {
    expect(relayIsAhead({ "device-a": 42 }, { "device-a": 17 })).toBe(true)
  })

  it("erkennt ein Gerät, von dem wir noch gar nichts haben", () => {
    // seq beginnt bei 0 — ein unbekanntes Gerät mit seq 0 heisst „ein Eintrag
    // fehlt", nicht „nichts fehlt".
    expect(relayIsAhead({ "device-b": 0 }, {})).toBe(true)
  })

  it("meldet Gleichstand als eingeholt", () => {
    expect(relayIsAhead({ "device-a": 17 }, { "device-a": 17 })).toBe(false)
  })

  it("stört sich nicht an lokalen Einträgen, die der Relay noch nicht hat", () => {
    // Eigene Schreibvorgänge, die noch nicht quittiert sind, sind kein
    // Rückstand — sonst hinge die Anzeige an unserem eigenen Ausgang.
    expect(relayIsAhead({ "device-a": 3 }, { "device-a": 9, "device-own": 4 })).toBe(false)
  })

  it("nimmt einen Rückstand bei IRGENDEINEM Gerät ernst", () => {
    expect(relayIsAhead({ a: 5, b: 9 }, { a: 5, b: 8 })).toBe(true)
  })

  it("behandelt eine leere Antwort als eingeholt", () => {
    expect(relayIsAhead({}, { a: 5 })).toBe(false)
  })
})
