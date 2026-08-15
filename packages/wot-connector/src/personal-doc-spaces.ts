/**
 * Zählt die Space-Mitgliedschaften im persönlichen Dokument — also wie viele
 * Gruppen dieses Gerät insgesamt zu erwarten hat (rls#265).
 *
 * `null` heisst „unbekannt" (Dokument noch nicht da), NICHT „null Gruppen".
 *
 * `PersonalDoc` ist ein Proxy über eine Y.Map: verschachtelte Y.Maps werden
 * erst im `get`-Trap in weitere Proxys verpackt, der Deskriptor-Trap liefert
 * den rohen Wert. Der Zugriff hier läuft deshalb bewusst über Schlüssel und
 * Indexzugriff — der Weg, der garantiert durch `get` geht. Der Test dazu baut
 * die Trap-Asymmetrie mit einer echten Y.Map nach, statt sie zu behaupten.
 */
export function countMemberSpaces(spaces: unknown): number | null {
  if (!spaces || typeof spaces !== "object") return null
  const record = spaces as Record<string, { info?: { type?: string; appTag?: string } } | undefined>
  let count = 0
  for (const id of Object.keys(record)) {
    const info = record[id]?.info
    // Dieselbe Auswahl wie bei den sichtbaren Gruppen: der private Space ist
    // keine Gruppe und taucht in der Liste nie auf.
    if (info?.type === "shared" && info.appTag !== "rls-private") count += 1
  }
  return count
}
