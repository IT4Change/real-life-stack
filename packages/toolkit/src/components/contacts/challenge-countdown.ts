/**
 * Reine Countdown-Logik für die QR-Challenge (Entscheidung 3, 04.08.):
 * Der Code trägt seinen Erzeugungszeitpunkt (`ts`, Trust 002); die Gültigkeit
 * endet nach der 5-Minuten-TTL. Die Anzeige- und Regenerate-Effekte im
 * VerificationDialog bauen auf diesen Funktionen auf — hier testbar ohne DOM.
 */

export const CHALLENGE_TTL_MS = 5 * 60 * 1000

/** Ablaufzeitpunkt (ms epoch) aus dem Trust-002-Code; null bei unlesbarem Code. */
export function challengeExpiresAtMs(code: string, ttlMs: number = CHALLENGE_TTL_MS): number | null {
  try {
    const parsed: unknown = JSON.parse(code)
    if (typeof parsed !== "object" || parsed === null) return null
    const ts = (parsed as { ts?: unknown }).ts
    if (typeof ts !== "string") return null
    const tsMs = Date.parse(ts)
    if (!Number.isFinite(tsMs)) return null
    return tsMs + ttlMs
  } catch {
    return null
  }
}

/** Restlaufzeit in ms, auf 0 geklemmt; null bei unlesbarem Code. */
export function challengeRemainingMs(code: string, nowMs: number, ttlMs: number = CHALLENGE_TTL_MS): number | null {
  const expiresAt = challengeExpiresAtMs(code, ttlMs)
  return expiresAt === null ? null : Math.max(0, expiresAt - nowMs)
}

/** "4:59"-Anzeigeform, Sekunden aufgerundet. */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}
