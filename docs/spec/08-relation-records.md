# Relation Records

**Status:** Normativer Entwurf v0.1 (P0 der Netzwerk-App, stack-weit gültig)

Diese Spec definiert Relationen als eigenständige, autorisierte Datensätze
(RelationRecords) und den Vertrag `RelationStoreCapable`. Sie ergänzt die
eingebetteten Relations aus [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md)
und ersetzt sie nicht.

Code-Referenzen:

- `packages/data-interface/src/index.ts` (`Relation`, `RelationCapable`)
- [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md) (Target-Konventionen, Forward/Reverse-Regel)
- [05-confirmations-and-trust.md](05-confirmations-and-trust.md) (`ConfirmationView`, Trust-Level)

## Motivation

Eingebettete Relations (`item.relations[]`) gehören dem Item, das sie trägt:
kein eigener Autor, keine eigene Berechtigung, kein explizites `from`, keine
eigene Beobachtbarkeit. Für Kanten, die selbst Inhalt sind (knows, attends,
partOf), gilt deshalb die bestehende Regel aus 04: eigenständige, wachsende
Inhalte werden eigene Datensätze — so wie Kommentare und Reaktionen bereits
eigene Items sind.

RelationRecords führen dabei keine zweite Pointer-Syntax ein: ihre
Endpunkte sind selbst eingebettete Relations. Es gibt im Stack genau einen
Ort für Item-Referenzen (`item.relations[]`) und ein Reifikations-Muster
(eigenes Item + eingebettete Relation), das Kommentare und Reaktionen
bereits verwenden — hier angewandt auf Kanten.

## RelationRecord als Item

Ein RelationRecord ist ein Item mit `type: "relation"`. Es gibt keinen
zweiten Persistenz-Pfad und keine zweite Pointer-Syntax: die Endpunkte
liegen als eingebettete Relations im Relation-Item, so wie die Verbindung
eines Kommentars zu seinem Post.

```ts
// Item im Space-Doc
{
  id: "rel-8f2a",
  type: "relation",
  createdBy: "did:key:z6Mk...",   // Autor der Kante
  createdAt: "2026-07-15T10:00:00Z",
  data: {
    predicate: "knows",
    level: "met",                  // domänenspezifisches Kanten-Feld, flach
    confirmationRef: "conf-123"    // optional, s. Trust-Bindung
  },
  relations: [
    { predicate: "from", target: "item:person-anton" },   // Target-Konventionen aus 04
    { predicate: "to",   target: "item:person-kaliya" }
  ]
}
```

Regeln:

1. Ein RelationRecord ist ein Item mit `type: "relation"`. Alle Item-Verträge
   (ItemWriter, AuthorizationCapable, ItemGroupCapable, Sync, Activity-Log,
   Mirror/Bridge) gelten unverändert.
2. Die Endpunkte liegen als eingebettete Relations mit den reservierten
   Prädikaten `from` und `to` in `relations[]` — genau ein Eintrag je
   Prädikat. Die Targets MÜSSEN den Target-Konventionen aus 04 folgen
   (`item:`, `space:{id}/item:`, `global:`).
3. `predicate` ist offen. Gerichtetheit und Symmetrie deklariert die
   Relation-Typ-Definition der App, nicht der Record. Bei symmetrischen
   Prädikaten MÜSSEN die Endpunkte kanonisch geordnet gespeichert werden
   (lexikographisch: `from` ≤ `to` als Target-String). Spiegel-Records sind
   damit strukturell ausgeschlossen, auch bei gleichzeitiger
   Offline-Erzeugung.
4. Die Item-`id` MUSS deterministisch aus dem Tupel
   `(createdBy, predicate, from, to)` abgeleitet werden:
   `"rel-" + hex(sha256(createdBy + "\n" + predicate + "\n" + from + "\n" + to))`.
   Damit konvergieren offline doppelt erzeugte Kanten desselben Autors auf
   denselben Record, und pro Autor existiert höchstens ein Record je Tupel.
   Records verschiedener Autoren über dieselben Endpunkte bleiben bewusst
   getrennt (perspektivischer Graph). Konsequenz: der Schreibpfad MUSS für
   Relation-Items client-bestimmte `id`s akzeptieren (additive Erweiterung
   von `ItemWriter.createItem`, s. RelationStoreCapable Regel 2).
5. `predicate`, `from` und `to` sind nach Erstellung unveränderlich (sie
   definieren die `id`). Umhängen ist Delete + Create. Veränderbar sind nur
   die domänenspezifischen Kanten-Felder in `data` und `confirmationRef`.
6. Domänenspezifische Kanten-Felder (z. B. `tense: "coming"`) liegen flach
   in `data.*`, wie überall im Stack (04: gemeinsame Felder liegen in
   `data`) — `hasField`-Filter, Schema-Validierung und Editoren arbeiten
   ohne Sonderfall. Die Vertragsfelder `predicate` und `confirmationRef`
   sind reserviert; neue Vertragsfelder kommen nur mit einer neuen
   Vokabular-Version (`relation/v2`), nie still in `v1`.
7. Ein RelationRecord SOLL im selben Space liegen wie sein `from`-Ziel.
   Endpunkte in anderen Spaces werden über `space:{id}/item:` adressiert.
8. Records mit nicht auflösbaren oder fehlerhaften Endpunkten (kein oder
   mehr als ein `from`-/`to`-Eintrag) MÜSSEN von Leseflächen ignoriert
   werden (kein Crash, keine Phantom-Knoten). Aufräumen ist eine explizite
   Handlung des Autors bzw. der App, kein impliziter GC.
9. Eingebettete Relations bleiben für wenige, feste Forward-Beziehungen
   erlaubt (04): Anzahl durch die Item-Definition begrenzt, gesetzt vom
   Item-Autor beim Editieren (z. B. `assignedTo`). Kanten MÜSSEN
   RelationRecords sein, wenn ihre Menge mit der Nutzung unbegrenzt wächst
   (jede neue Kante schriebe sonst das Trägeritem um) oder wenn sie einen
   anderen Autor als das Trägeritem haben. Feste Beziehungen DÜRFEN
   ebenfalls als Records geführt werden (die Netzwerk-App tut das für alle
   Relationsarten, auch `takesPlaceAt`).
10. Relation-Items SOLLEN das Vokabular `relation/v1` deklarieren
    (`@context`, s. [06-schema-composition.md](06-schema-composition.md));
    die Schema-Definition folgt in `schemas/vocab/relation/v1/` (validiert
    u. a. genau einen `from`- und einen `to`-Eintrag, die ID-Regel und die
    reservierten Vertragsfelder `predicate`/`confirmationRef`).

## RelationStoreCapable

```ts
interface RelationRecord {
  id: string
  predicate: string
  from: string
  to: string
  /** alle domänenspezifischen data-Felder (flach gespeichert, ohne Vertragsfelder) */
  fields?: Record<string, unknown>
  confirmationRef?: string
  createdBy: string
  createdAt: string
}

interface RelationRecordInput {
  predicate: string
  from: string
  to: string
  fields?: Record<string, unknown>
  confirmationRef?: string
}

/** predicate/from/to sind immutable (Regel 5) — Update nur für den Rest.
    fields ersetzt vollständig; confirmationRef: null entfernt die Referenz. */
interface RelationRecordUpdate {
  fields?: Record<string, unknown>
  confirmationRef?: string | null
}

interface RelationRecordFilter {
  predicate?: string
  from?: string
  to?: string
  /** matcht Records, deren from ODER to gleich diesem Target ist */
  endpoint?: string
}

interface RelationStoreCapable {
  getRelationRecords(filter?: RelationRecordFilter): Promise<RelationRecord[]>
  observeRelationRecords(filter?: RelationRecordFilter): Observable<RelationRecord[]>
  /**
   * Projektion „Endpunkt → verbundene Items über RelationRecords".
   * `endpoint` in Target-Schreibweise (04). RelationCapable leistet das
   * NICHT (s. Regel 6).
   */
  getRelationNeighbors(endpoint: string, predicate?: string): Promise<Item[]>
  observeRelationNeighbors(endpoint: string, predicate?: string): Observable<Item[]>
  createRelationRecord(input: RelationRecordInput): Promise<RelationRecord>
  updateRelationRecord(id: string, updates: RelationRecordUpdate): Promise<RelationRecord>
  deleteRelationRecord(id: string): Promise<void>
}
```

Regeln:

1. `RelationRecord` ist die typisierte Projektion des Relation-Items: die
   Endpunkt-Relations werden auf die Strings `from`/`to` abgebildet, die
   domänenspezifischen `data`-Felder (alles außer `predicate` und
   `confirmationRef`) auf `fields`. `RelationStoreCapable` ist eine
   Fassade, kein eigener Speicher.
2. Der Vertrag MUSS durch eine generische Default-Implementierung über
   `DataInterface` + `ItemWriter` erfüllbar sein
   (`observe({ type: "relation" })` + Projektion + Filter). Connectoren
   DÜRFEN mit indizierten Implementierungen überschreiben. **Damit die
   deterministische `id` schreibbar ist, wird `ItemWriter.createItem`
   additiv erweitert:** das Eingabe-Item DARF eine `id` mitbringen
   (`Omit<Item, "id" | "createdAt"> & { id?: string }`; Code-Änderung in
   `data-interface`, P1b). Connectoren, die RelationStore anbieten, MÜSSEN
   eine mitgelieferte `id` für Relation-Items übernehmen. Existiert die
   `id` bereits, MUSS `createItem` das bestehende Item unverändert
   zurückgeben (idempotent; eine inhaltliche Kollision ist ausgeschlossen,
   weil die `id` das identitätsstiftende Tupel hasht).
3. Autor-Quelle: `createdBy` stammt NIE vom Aufrufer — deshalb fehlt es in
   `RelationRecordInput` bewusst. Der Connector setzt `createdBy` aus
   seiner authentifizierten Identität (`Authenticatable`), und die
   deterministische `id` wird aus genau dieser Identität berechnet. Die
   `id`-Berechnung liegt damit im Connector bzw. in der
   Default-Implementierung, nie in der App. Ausnahme: privilegierte
   Fixture-/ETL-Pfade eines Connectors (z. B. Seed-Injection) schreiben
   Relation-Items direkt als Items an der Fassade vorbei; sie MÜSSEN
   dieselbe ID-Regel und Endpunkt-Form anwenden. Laufzeit-Schreibvorgänge
   der App laufen ausschließlich über den auth-gebundenen RelationStore.
4. `createRelationRecord` ist idempotent: existiert der Record des Autors
   zum selben Tupel bereits, wird er unverändert zurückgegeben (Angleichen
   von `fields` ist ein explizites Update). `updateRelationRecord` ändert
   nur `fields`/`confirmationRef`; Umhängen ist Delete + Create.
   Update-Semantik: `fields` ersetzt das Objekt VOLLSTÄNDIG (kein
   Deep-Merge); `confirmationRef: null` entfernt die Referenz;
   `fields`-Schlüssel, die mit Vertragsfeldern kollidieren (`predicate`,
   `confirmationRef`), werden abgelehnt.
5. Type Guard: `hasRelationStore(c)`, analog zu den bestehenden Guards in
   `packages/data-interface/src/index.ts`.
6. `RelationCapable` (`getRelatedItems`) bleibt unverändert und operiert
   auf eingebetteten Relations. Es löst RelationRecords NICHT auf:
   `getRelatedItems(person, "knows")` filtert nach `relations[].predicate`,
   Relation-Items tragen dort aber `from`/`to`, und das Kanten-Prädikat
   liegt in `data.predicate` — die Standard-Traversierung fände höchstens
   das Relation-Item, nie die Gegenseite. Die Projektion „Endpunkt →
   verbundene Items" leistet deshalb der RelationStore selbst
   (`getRelationNeighbors`/`observeRelationNeighbors`, ableitbar aus
   Records + `getItem`). UI-Flächen, die Kanten kennen, benutzen den
   RelationStore, nicht `RelationCapable`.
7. Berechtigung: `item/create|edit|delete` über `AuthorizationCapable` auf
   dem Relation-Item; Default creator-owns, keine separaten
   Relation-Berechtigungen. `can()` ist dabei nur UI-Affordance (02/03):
   der Connector MUSS unautorisierte Schreiboperationen auf Relation-Items
   im Schreibpfad selbst ablehnen. Wo das Protokoll keine harte Grenze
   zieht (im CRDT-Space kann jedes Mitglied technisch schreiben), ist die
   Vertraulichkeits-Grenze die Space-Wahl — s. Trust-Bindung Regel 6.

## Trust-Bindung

`knows(verified)` trägt keine eigene Kryptografie. Der Nachweis lebt bei den
Confirmations (05), der Graph leitet ab.

Regeln:

1. Ein Verifikationsstatus wird NIE als Feld gespeichert, weder als
   Kanten-Feld in `data` noch anderswo.
2. Ein Record DARF `confirmationRef` tragen: die `id` einer Confirmation
   (`ConfirmationView`, 05).
3. Identitäts-Auflösung eines Endpunkts: ein `global:`-Target ist die
   Identität selbst; ein `item:`-/`space:{id}/item:`-Target liefert die
   Identität aus `data.did` des aufgelösten Items. `data.did` ist ein
   optionales Feld; `person/v1` wird dafür additiv um `did` erweitert.
   Liefert ein Endpunkt keine Identität, ist `verified` nicht ableitbar
   (Regel 5).
4. `verified` gilt genau dann, wenn die referenzierte Confirmation (a) über
   `ConfirmationCapable` auflösbar ist, (b) nicht abgelehnt wurde
   (`isAccepted !== false`) und (c) `issuerId`/`subjectId` den aufgelösten
   Identitäten der beiden Endpunkte entsprechen (Richtung egal). Das
   anzeigbare Vertrauensniveau ist der `trustLevel` der Confirmation.
5. Fehlt die Referenz oder eine Endpunkt-Identität, oder bricht eine
   Bedingung, fällt die Darstellung ohne Fehler auf die niedrigere Stufe
   zurück (z. B. `met`). Widerruf wirkt dadurch automatisch.
6. Sensible Relationen (z. B. `livesAt`) regeln Sichtbarkeit über die Wahl
   des Space und bestehende Berechtigungen, nicht über ein neues
   Krypto-Feld.

## Nicht-Ziele

Diese Spec definiert nicht:

- ein neues Attestation- oder Signaturformat (bleibt WoT),
- eine Graph-Query-Sprache oder Traversierung über mehrere Hops,
- einen globalen, space-übergreifenden Graphen.
