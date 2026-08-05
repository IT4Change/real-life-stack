import { describe, expect, it } from "vitest"

import {
  CHALLENGE_TTL_MS,
  challengeExpiresAtMs,
  challengeRemainingMs,
  formatCountdown,
} from "../src/components/contacts/challenge-countdown"

const code = JSON.stringify({
  did: "did:key:ztest",
  name: "Anton",
  enc: "e",
  nonce: "550e8400-e29b-41d4-a716-446655440000",
  ts: "2026-08-05T10:00:00.000Z",
})
const tsMs = Date.parse("2026-08-05T10:00:00.000Z")

describe("challenge-countdown (Entscheidung 3)", () => {
  it("liest den Ablaufzeitpunkt aus dem Trust-002-Code (ts + 5 Minuten)", () => {
    expect(challengeExpiresAtMs(code)).toBe(tsMs + CHALLENGE_TTL_MS)
  })

  it("liefert null für unlesbare Codes statt zu werfen", () => {
    expect(challengeExpiresAtMs("{kein json")).toBeNull()
    expect(challengeExpiresAtMs(JSON.stringify({ nonce: "x" }))).toBeNull()
    expect(challengeExpiresAtMs(JSON.stringify({ ts: "kein-datum" }))).toBeNull()
    expect(challengeExpiresAtMs(JSON.stringify({ ts: 42 }))).toBeNull()
  })

  it("Restlaufzeit ist nie negativ und exakt an der TTL-Grenze 0", () => {
    expect(challengeRemainingMs(code, tsMs)).toBe(CHALLENGE_TTL_MS)
    expect(challengeRemainingMs(code, tsMs + CHALLENGE_TTL_MS - 1000)).toBe(1000)
    expect(challengeRemainingMs(code, tsMs + CHALLENGE_TTL_MS)).toBe(0)
    expect(challengeRemainingMs(code, tsMs + CHALLENGE_TTL_MS + 60_000)).toBe(0)
    expect(challengeRemainingMs("{kein json", tsMs)).toBeNull()
  })

  it("formatiert m:ss und rundet Sekunden auf", () => {
    expect(formatCountdown(CHALLENGE_TTL_MS)).toBe("5:00")
    expect(formatCountdown(61_000)).toBe("1:01")
    expect(formatCountdown(60_000)).toBe("1:00")
    expect(formatCountdown(59_999)).toBe("1:00")
    expect(formatCountdown(500)).toBe("0:01")
    expect(formatCountdown(0)).toBe("0:00")
  })
})
