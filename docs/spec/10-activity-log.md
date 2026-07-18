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
  /** crypto.randomUUID() — eindeutig ohne Koordination, ohne durable Zähler */
  id: string
  /** UTC, exakt Date.toISOString()-Format (YYYY-MM-DDTHH:mm:ss.sssZ) —
      damit ist lexikographisch = chronologisch */
  ts: string
  /** ID der authentifizierten Connector-Identität; beim WoT-Connector eine DID — setzt der Connector, nie die App (Regel 1) */
  actor: string
  action: "create" | "update" | "delete"
  /** gesetzt, wenn der Eintrag aus der Anwendung eines Mirror-Snapshots stammt (Regel 10) */
  origin?: "mirror"
  /** lokale Item-id; bei origin "mirror" voll qualifiziert
      `space:{homeSpaceId}/item:{itemId}` (Target-Konvention 04) —
      kollisionsfrei zu lokalen ids */
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
   falsche Urheberanzeigen dürfen nicht trivial erzeugbar sein. Die
   einzige normierte Ausnahme für den `actor`-WERT (nicht den Schreiber)
   ist die Mirror-Anwendung, Regel 10.
2. **ID und Ordnung:** `id = crypto.randomUUID()` — eindeutig ohne
   Koordination und ohne persistente, tab-übergreifend atomare
   Sequenzzähler oder Escaping-Normierung (deshalb bewusst kein
   `actor#deviceId#seq`-Schema; das nähme zudem eine gerätekorrelierbare
   ID über Spaces hinweg in Kauf). Die Anzeige-Ordnung ist
   `(ts, actor, id)` lexikographisch — deterministisch auf allen Geräten,
   unabhängig von der Iterationsreihenfolge der Map. `ts` MUSS das
   kanonische UTC-Format von `Date.toISOString()` tragen
   (`YYYY-MM-DDTHH:mm:ss.sssZ`); andere gültige ISO-Darstellungen
   (Zonen-Offsets, abweichende Präzision) sind unzulässig, weil sie die
   lexikographische Ordnung brechen würden.
3. **Append-only:** Einträge werden nie editiert. Entfernt wird nur durch
   Retention (Regel 4).
4. **Retention:** Cap pro Space, Default 500 Einträge — als **eventual
   soft cap**: nach Offline-Merges kann der Bestand vorübergehend darüber
   liegen. Überschreitet der Bestand beim Schreiben das Cap, MUSS die
   Activity-Log-Implementierung des **Connectors** prunen („nie prunen"
   ist NICHT spec-konform, sonst wäre das Cap bedeutungslos); App-/UI-Code
   prunt nie (s. Regel 1). Gelöscht wird deterministisch: älteste zuerst
   gemäß Anzeige-Ordnung, per Schlüssel (`id`), nie per Position —
   paralleles Pruning konvergiert, weil alle Connectoren dieselben
   Schlüssel wählen. Das Prunen selbst erzeugt keinen Eintrag. Hinweis: CRDT-Löschungen begrenzen die **sichtbare**
   Map; die Dokument-Historie der Transportschicht schrumpft erst mit
   deren Compaction (CompactStore).
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
   sichtbar nur für Space-Mitglieder. Er erzeugt dabei sehr wohl **neue
   Verhaltensmetadaten** — wer hat wann editiert oder gelöscht —, die über
   `item.createdBy` hinausgehen. Begrenzt wird das durch die
   E2EE-Sichtbarkeitsgrenze (nur Mitglieder) und die Retention
   (Historientiefe); UI-Flächen SOLLEN den Log als das ausweisen, was er
   ist: eine für alle Mitglieder sichtbare Verlaufsansicht.
9. RelationRecords sind Items ([08-relation-records.md](08-relation-records.md));
   Kanten-CRUD erscheint dadurch automatisch im Log
   (`targetType: "relation"`).
10. **Space-Wechsel und Mirror:** `moveItemToGroup` berührt zwei
    Space-Docs nacheinander und ist als EINE Mutation nicht atomar
    loggbar. Er erzeugt deshalb ZWEI Einträge — `delete` im Quell-Log,
    `create` im Ziel-Log, jeder atomar in seinem Doc; kurzzeitige
    Inkonsistenz zwischen den Logs ist zulässig (Regel 5). Die Anwendung
    eines Mirror-Snapshots (09) schreibt der **Connector** als eigenen
    Eintrag mit `origin: "mirror"`; `actor` ist die Signer-DID des
    Snapshots — die verursachende Identität, und die einzige normierte
    Ausnahme vom actor-Wert aus Regel 1 (der Schreiber bleibt der
    Connector). Event-Abbildung über **Zustandsübergänge der
    Mirror-Instanz**, nicht über Snapshot-Arten: kein Mirror → Mirror =
    `create`; Mirror → Mirror mit neuerer Version = `update`; Mirror →
    entfernt = `delete`. `targetType` bei create/update aus
    `payload.item.type`; bei delete vom letzten bekannten Mirror-Zustand
    (Tombstones tragen kein `item`, s. Regel 7). Ein Tombstone ohne
    bestehenden Mirror (ungebundene Marke, 09 Invariante 5) ist KEIN
    Zustandsübergang und erzeugt keinen Eintrag. `targetId` von
    Mirror-Einträgen ist die voll qualifizierte Form
    `space:{homeSpaceId}/item:{itemId}` (Target-Konvention 04) — nie die
    nackte `itemId`, die mit einem lokalen Item kollidieren könnte.

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

### Additiver Scoped-Lesevertrag

Für space-übergreifende Leseflächen kann ein Activity-Log-Connector zusätzlich
`getScopedActivity()` und `observeScopedActivity()` anbieten. Die Rückgabe ist
die absteigend geordnete Union aller sichtbaren Spaces, unabhängig vom aktuell
gewählten Workspace. Jeder Eintrag enthält die `groupId` zusammen mit dem
unveränderten `ActivityEntry`, das aktuelle `targetExists`, ein live
aufgelöstes Subject (bei Deletes ein Tombstone aus `targetType`/`summary`), den
space-lokal aufgelösten Actor und bei privaten Spaces `isPersonal: true`.
Live-Subjects liefern `createdBy`, Titel und die feldbasierten Module-Hinweise
`hasPosition`, `hasStart` und `hasStatus`; nicht auflösbare Subjects sind
`null`. Die stabile Identität eines scoped Eintrags ist `groupId + entry.id`.
Der bestehende, scope-abhängige Lesevertrag bleibt unverändert für das
Verlaufs-Panel.

## Nicht-Ziele

Diese Spec definiert nicht:

- einen sozialen Feed oder Benachrichtigungen,
- Audit-Sicherheit (der Log ist mutierbar durch Space-Mitglieder und
  beweist nichts — portable signierte Wahrheit bleibt WoT Attestation),
- Undo/Redo-Semantik.
