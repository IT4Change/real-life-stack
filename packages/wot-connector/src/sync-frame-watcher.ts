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
  /** `true` = der Relay hat für dieses Dokument noch mehr. */
  truncated: boolean
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
  const body = envelope.body as { docId?: unknown; truncated?: unknown }
  if (typeof body.docId !== "string" || body.docId.length === 0) return null
  if (typeof body.truncated !== "boolean") return null
  return { docId: body.docId, truncated: body.truncated }
}
