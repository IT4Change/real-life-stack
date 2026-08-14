export interface CoalescedRunner {
  (): void
  /** Ausstehenden Lauf verwerfen (Teardown) — hinterlässt keinen Timer. */
  cancel(): void
}

/**
 * Bündelt viele Auslöser zu wenigen Läufen: ein nachlaufendes Zeitfenster
 * (`delayMs`) fasst alles zusammen, was währenddessen hereinkommt, und
 * gleichzeitig läuft nie mehr als ein Durchlauf — Auslöser während eines Laufs
 * ergeben genau EINEN Nachlauf, egal wie viele es waren.
 *
 * Hintergrund (rls#265): `restoreSpacesFromMetadata()` läuft SERIELL über alle
 * Spaces (Schlüssel nachladen, Compact-Store lesen, Capability-Seeds), und die
 * PersonalDoc feuert beim Erstsync im Millisekundentakt. Gemessen an einem
 * frischen Gerät mit 6 Spaces: 11 vollständige Durchläufe, drei davon
 * unmittelbar hintereinander ohne neue Information, ~20–70 ms pro Space und
 * Durchlauf. Der Aufwand wächst mit Spaces × Änderungen, also genau dort, wo
 * das Warten auffällt.
 */
export function createCoalescedRunner(run: () => Promise<void> | void, delayMs: number): CoalescedRunner {
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let pending = false

  const start = (): void => {
    running = true
    void (async () => {
      try {
        await run()
      } catch {
        // Fehler gehören dem Aufrufer; hier zählt nur, dass der Runner
        // auslösbar bleibt statt im laufenden Zustand steckenzubleiben.
      } finally {
        running = false
        if (pending) {
          pending = false
          schedule()
        }
      }
    })()
  }

  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (running) { pending = true; return }
      start()
    }, delayMs)
  }

  const trigger = (() => {
    if (running) { pending = true; return }
    schedule()
  }) as CoalescedRunner

  trigger.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    pending = false
  }

  return trigger
}
