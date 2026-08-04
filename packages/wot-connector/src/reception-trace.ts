import { getTraceLog } from "@real-life/wot-core"

/**
 * rls#219: Empfangs-Dispositionen gehören in den Debug-Trace (Kopier-Export),
 * nicht nur in die Konsole. Vertrag aus dem Vorfall 04.08.: Jede zugestellte
 * Nachricht endet sichtbar — angewendet, abgelehnt mit benanntem Grund, oder
 * zurückgestellt. Ein `return` ohne Spur ist ein Bug.
 *
 * Rejects laufen als `relay`/`receive` mit success:false — der TraceStore-
 * Katalog ist geschlossen (core), und ein Reject IST eine empfangene
 * Nachricht, deren Verarbeitung scheiterte.
 */
export function logReceptionDropTrace(label: string, detail: string, meta?: Record<string, unknown>): void {
  try {
    getTraceLog().log({
      store: "relay",
      operation: "receive",
      label: `${label}: ${detail}`,
      durationMs: 0,
      success: false,
      error: detail,
      ...(meta === undefined ? {} : { meta }),
    })
  } catch { /* Tracing darf den Empfangspfad nie brechen */ }
}

/** Warnung + Trace-Eintrag für einen bisher stillen Drop. */
export function traceReceptionDrop(label: string, detail: string, meta?: Record<string, unknown>): void {
  console.warn(`[wot-connector] ${label}:`, detail)
  logReceptionDropTrace(label, detail, meta)
}
