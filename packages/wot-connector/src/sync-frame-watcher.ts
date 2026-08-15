/**
 * Der Relay sagt in jeder Sync-Antwort selbst, ob er noch mehr hat.
 *
 * `SyncResponseBody` (core, `protocol/sync/sync-messages`) trägt neben den
 * Einträgen ein `truncated`-Flag: `true` = es folgt mindestens eine weitere
 * Seite, `false` = das war die letzte. Genau daraus baut core intern
 * `CatchUpResult.complete`. Diese Rahmen laufen über DENSELBEN Messaging-
 * Adapter, den der Connector besitzt und an dem er ohnehin hängt — die
 * Erstsync-Anzeige kann sich also auf eine Tatsache stützen statt auf ein
 * Zeitfenster (rls#265).
 *
 * Bewusst nur LESEND und rein additiv: hier wird nichts beantwortet, nichts
 * quittiert, nichts weitergeleitet. Der saubere Ort dafür bleibt der Adapter
 * selbst (web-of-trust#343); bis der das herausgibt, ist dies die
 * Beobachtung an der Stelle, an der die Information sowieso vorbeikommt.
 */
export const SYNC_RESPONSE_MESSAGE_TYPE = "https://web-of-trust.de/protocols/sync-response/1.0"

export interface SyncResponseObservation {
  docId: string
  /** `true` = der Relay hat für dieses Dokument noch eine weitere Seite. */
  truncated: boolean
  /** Der Stand des Relays je Gerät (`seq` beginnt bei 0). */
  heads: Record<string, number>
}

/**
 * Liest eine Sync-Antwort, oder `null` wenn die Nachricht keine ist.
 *
 * Fehlende oder falsch getypte Felder ergeben `null` statt einer Annahme: ein
 * fehlendes `truncated` als „fertig" zu lesen wäre genau die Sorte Vermutung,
 * die die Anzeige vorher zu früh beendet hat.
 */
export function readSyncResponse(message: unknown): SyncResponseObservation | null {
  if (!message || typeof message !== "object") return null
  const envelope = message as { type?: unknown; body?: unknown }
  if (envelope.type !== SYNC_RESPONSE_MESSAGE_TYPE) return null
  if (!envelope.body || typeof envelope.body !== "object") return null
  const body = envelope.body as { docId?: unknown; truncated?: unknown; heads?: unknown }
  if (typeof body.docId !== "string" || body.docId.length === 0) return null
  if (typeof body.truncated !== "boolean") return null
  const heads: Record<string, number> = {}
  if (body.heads && typeof body.heads === "object") {
    for (const [device, seq] of Object.entries(body.heads as Record<string, unknown>)) {
      if (typeof seq === "number" && Number.isFinite(seq)) heads[device] = seq
    }
  }
  return { docId: body.docId, truncated: body.truncated, heads }
}

/**
 * Liegt der Relay für dieses Dokument vor uns?
 *
 * Verglichen wird gegen den STRIKT ZUSAMMENHÄNGENDEN lokalen Stand
 * (`getStrictContiguousHeads`), nicht gegen den höchsten bekannten: hinter
 * einer Lücke gilt alles Spätere als noch nicht da. Genau das ist der Fall,
 * den `CatchUpResult.complete` NICHT abdeckt — dort steht ausdrücklich, dass
 * „complete" nicht „lückenlos" heisst (offene Lücken werden über Soft-Skip und
 * GapRepair nachgezogen, nicht über die Paginierung).
 *
 * Nur der Rückstand zählt. Eigene Einträge, die der Relay noch nicht hat, sind
 * Ausgang und kein fehlender Empfang.
 */
export function relayIsAhead(
  relayHeads: Record<string, number>,
  localHeads: Record<string, number>,
): boolean {
  for (const [device, relaySeq] of Object.entries(relayHeads)) {
    const localSeq = localHeads[device]
    if (localSeq === undefined || relaySeq > localSeq) return true
  }
  return false
}
