# Activity-Log

**Status:** Normativer Entwurf v0.1 (P0 der Netzwerk-App, stack-weit gültig)

Diese Spec definiert den Activity-Log: eine nachvollziehbare CRUD-Historie
pro Space. Der Log ist kein Feed und keine Wahrheitsquelle, sondern eine
Best-Effort-Projektion für Menschen.

Code-Referenzen:

- `packages/wot-connector/src/types.ts` (`RlsSpaceDoc`)
- `packages/wot-connector/src/wot-connector.ts` (`handle.transact`, Item-CRUD)

## Collection-Form

Der Log ist ein eigenes Top-Level-Feld im Space-Doc, KEINE Items:
Log-Einträge sind Meta-Daten über Inhalte, append-only und unterliegen
Retention. Die Collection ist eine per `id` gekeyte **Map, kein Array**:
CRDT-Merges deduplizieren gleiche IDs strukturell, und Retention löscht
stabile Schlüssel statt Array-Positionen. Die Erweiterung ist additiv;
alte Clients ignorieren das Feld.

```ts
interface RlsSpaceDoc {
  _type: "rls"
  items: Record<string, SerializedItem>
  activity?: Record<string, ActivityEntry>   // NEU, additiv; Key = ActivityEntry.id
}

interface ActivityEntry {
  /** `${actor}#${deviceId}#${seq}` — eindeutig ohne Koordination, auch über mehrere Geräte derselben DID */
  id: string
  /** stabile, durable Geräte-ID des schreibenden Geräts */
  deviceId: string
  /** geräte-lokale, monoton wachsende Sequenz pro Space */
  seq: number
  /** ISO-Timestamp der Aktion (reine Anzeige-/Sortierhilfe) */
  ts: string
  /** DID des Handelnden — setzt der Connector, nie die App (Regel 1) */
  actor: string
  action: "create" | "update" | "delete"
  targetId: string
  /** item.type zum Zeitpunkt der Aktion */
  targetType: string
  /** optionale menschenlesbare Kurzform, z. B. geänderte Felder */
  summary?: string
}
```

## Regeln

1. **Atomarität und Urheberschaft:** Der Eintrag wird in derselben
   Transaktion wie die Mutation geschrieben (`handle.transact`). Daraus
   folgt: der Connector schreibt den Log, nicht die App. Connectoren, die
   Activity-Log unterstützen, MÜSSEN in ihren `ItemWriter`-Methoden
   loggen; App-Code DARF keine Einträge schreiben. `actor` leitet der
   Connector aus seiner authentifizierten Identität ab (wie `createdBy`),
   NIE aus einem App-Parameter — der Log ist kein Audit (Regel 5), aber
   falsche Urheberanzeigen dürfen nicht trivial erzeugbar sein.
2. **ID und Ordnung:** `id = actor + "#" + deviceId + "#" + seq`; `seq`
   ist geräte-lokal monoton, die ID damit auch über mehrere Geräte
   derselben DID ohne Koordination eindeutig. Die Anzeige-Ordnung ist
   `(ts, actor, deviceId, seq)` lexikographisch — deterministisch auf
   allen Geräten, unabhängig von der Iterationsreihenfolge der Map.
3. **Append-only:** Einträge werden nie editiert. Entfernt wird nur durch
   Retention (Regel 4).
4. **Retention:** Cap pro Space, Default 500 Einträge. Beim Schreiben DARF
   jeder Client Einträge über dem Cap entfernen, älteste zuerst gemäß
   Anzeige-Ordnung; gelöscht wird per Schlüssel (`id`), nie per Position —
   paralleles Pruning konvergiert, weil alle Clients dieselben Schlüssel
   wählen. Das Prunen selbst erzeugt keinen Eintrag.
5. **Projektion, nicht Wahrheit:** Der Log MUSS als unvollständig behandelt
   werden (Retention, alte Clients ohne Log-Unterstützung schreiben nicht).
   Er DARF NICHT für Sync, Konfliktlösung oder Berechtigungen verwendet
   werden.
6. **Geschlossener action-Katalog:** `create | update | delete`. Leseflächen
   MÜSSEN unbekannte Werte robust ignorieren; wer den Katalog erweitert,
   MUSS im selben PR die Leseflächen nachziehen.
7. **delete-Einträge** tragen `targetType`/`summary` vom letzten bekannten
   Stand. Nach Retention DARF ein `delete` ohne zugehöriges `create`
   existieren; Leseflächen müssen das darstellen können.
8. **Privacy:** Der Log lebt im Space-Doc und ist E2EE wie alle Inhalte,
   sichtbar nur für Space-Mitglieder. `actor` ist dieselbe Identitätsklasse
   wie `createdBy`; es entsteht keine neue Informationskategorie.
9. RelationRecords sind Items ([08-relation-records.md](08-relation-records.md));
   Kanten-CRUD erscheint dadurch automatisch im Log
   (`targetType: "relation"`).

## Lese-Vertrag

```ts
interface ActivityLogCapable {
  getActivity(options?: { limit?: number }): Promise<ActivityEntry[]>
  observeActivity(options?: { limit?: number }): Observable<ActivityEntry[]>
}
```

Regeln:

1. Rückgabe absteigend in Anzeige-Ordnung (neueste zuerst); `limit` begrenzt.
2. Type Guard: `hasActivityLog(c)`, analog zu den bestehenden Guards.
3. Connectoren ohne Log-Unterstützung lassen die Capability weg; UI-Flächen
   MÜSSEN ohne sie funktionieren (Log-Ansicht ausblenden).

## Nicht-Ziele

Diese Spec definiert nicht:

- einen sozialen Feed oder Benachrichtigungen,
- Audit-Sicherheit (der Log ist mutierbar durch Space-Mitglieder und
  beweist nichts — portable signierte Wahrheit bleibt WoT Attestation),
- Undo/Redo-Semantik.
