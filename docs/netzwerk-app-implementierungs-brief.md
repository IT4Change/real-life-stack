# Netzwerk-App — Implementierungs-Brief für Codex

**Auftraggeber:** Anton + Fable (Orchestrierung/Review) · **Implementierung:** Codex
**Stand:** 16.07.2026 · P1a ist gemergt (PR #141, squash `fa3449b2`).
**Dein Auftrag jetzt: ausschließlich P1b.** Spätere Phasen kommen als eigene
Aufträge.

## Pflichtlektüre (in dieser Reihenfolge)

1. `docs/spec/08-relation-records.md` — **vollständig, jede Regel ist
   normativ für diesen Auftrag** (Kapitel hat 6 Review-Runden hinter sich).
2. `docs/spec/netzwerk-app.md` — Gesamtplan v4 + Review-Log R1–R9
   (gekippte Entscheidungen nicht wieder einführen).
3. `docs/spec/04-items-relations-groups-spaces.md` (Target-Konventionen),
   `06-schema-composition.md` (Vokabulare), `02`/`03`/`reaktivitaet.md`.
4. `AGENTS.md` des Repos — kanonisch für Arbeitsweise und Checks.

Bei Konflikt gilt: Spec schlägt Code; Review-Log schlägt ältere Spec-Absätze.

## Plan-Stand

| Phase | Inhalt | Status |
|---|---|---|
| P0 | Verträge 08/09/10 | ✅ Spec |
| P1a | App-Gerüst, Seed, Graph-View | ✅ gemergt #141 |
| **P1b** | **RelationRecords + RelationStoreCapable (08) implementieren, Seeds re-importieren, Graph auf Records umstellen** | **JETZT** |
| P2–P5 | Mirror · Linsen · Verdrahtung · Malleable | später |

Ein kohärenter PR gegen `master`, PR-Body mit Spec-Ankern.

## Auftrag P1b — Scope

### 1. `packages/data-interface`

- **`ItemWriter.createItem` additiv erweitern** (08, Fassaden-Regel 2):
  Eingabe-Typ `Omit<Item, "id" | "createdAt"> & { id?: string }`. Bei
  existierender `id` MUSS das bestehende Item unverändert zurückkommen
  (idempotent, kein Überschreiben).
- **Neue Typen + Vertrag** exakt wie in 08 spezifiziert: `RelationRecord`,
  `RelationRecordInput`, `RelationRecordUpdate` (nur `fields`/
  `confirmationRef`!), `RelationRecordFilter` (inkl. `endpoint`),
  `RelationStoreCapable` (inkl. `getRelationNeighbors`/
  `observeRelationNeighbors`), Type Guard `hasRelationStore`.
- **Generische Default-Implementierung** (Factory, z. B.
  `createDefaultRelationStore(connector, { symmetricPredicates })` über
  `DataInterface + ItemWriter + Authenticatable`): Projektion über
  `observe({ type: "relation" })`; Endpunkte als eingebettete Relations
  `from`/`to` im Relation-Item (genau je ein Eintrag); `createdBy` aus der
  authentifizierten Identität, NIE vom Aufrufer.
- **Deterministische ID** (08, Mapping-Regel 4):
  `"rel-" + hex(sha256(createdBy + "\n" + predicate + "\n" + from + "\n" + to))`
  via WebCrypto (kein neues Paket). Symmetrische Prädikate (hier:
  `knows`, `connectedWith`) vorher kanonisch ordnen (`from` ≤ `to`
  lexikographisch). ID-Helfer exportieren — Seed-Importer nutzt denselben.
- `deriveContext`: `type === "relation"` → Vokabular `relation/v1`.
- **Schema `docs/spec/schemas/vocab/relation/v1/`** anlegen
  (context.jsonld + schema.json + examples/valid/): validiert
  `data.predicate` (string, pflicht), optional `data.confirmationRef`,
  genau einen `from`- und einen `to`-Eintrag in `relations[]`; zusätzlich
  `person/v1` additiv um optionales `data.did` erweitern (08,
  Trust-Regel 3). Konventionen: `docs/spec/schemas/README.md`.

### 2. `packages/toolkit`

- Hooks `useRelationRecords(filter?)` und `useRelationNeighbors(endpoint,
  predicate?)` nach dem Muster der bestehenden Hooks (Observable +
  `loaded`). Die `GraphView`-Komponente bleibt unverändert props-basiert.

### 3. `packages/mock-connector`

- Client-bestimmte `id` in `createItem` unterstützen (idempotent, s. o.);
  RelationStore über die generische Default-Implementierung anbieten.

### 4. `apps/network`

- **Seed-Re-Import statt Migration** (Spec P1b): Der Importer erzeugt
  Relationen als Relation-Items über den **privilegierten Fixture-Pfad**
  (MockConnector-Seed-Injection, 08 Fassaden-Regel 3) — NICHT über den
  auth-gebundenen RelationStore. Deterministische IDs über den gemeinsamen
  Helfer, `createdBy` = Seed-Konstante. Prädikate/`meta`→`fields`
  (`attends` mit `tense`/`role`, `connectedWith`, `partOf`).
- **partOf-Aggregation:** `works_on` hat 112 Einträge, aber nur 99
  eindeutige (person, project)-Paare — elf Paare tragen mehrere Kontexte.
  Die ID-Regel erlaubt einen Record pro Tupel → **99 partOf-Records**,
  Kontexte deterministisch als **sortiertes `fields.contexts: string[]`**
  aggregiert (kein `fields.context` mehr).
- Graph-Datenaufbereitung (`project-embedded-graph.ts`) durch eine
  Projektion über RelationRecords ersetzen (Records → `GraphEdge[]`;
  Dangling-Filter behalten; Relation-Items werden NIE Knoten). Domain-Items
  tragen danach keine fachlichen eingebetteten Relations mehr. Ergebnis
  auf dem Bildschirm: derselbe Graph wie in P1a.
- **Neighbors-Scope P1b:** `getRelationNeighbors` löst nur lokale
  `item:`-Targets auf; `global:`/`space:{id}/…` bleiben unaufgelöst
  (kein Cross-Space vor P2), Dangling wird gefiltert.

**Ausdrücklich NICHT in P1b:** Relation-Editor-UI · Activity-Log (10) ·
Mirror/Bridge (09) · verified-Ableitung/Trust-UI (kommt mit dem
Verification-Flow in P4; `confirmationRef` wird nur gespeichert) ·
Änderungen an den normativen Kapiteln 08/09/10 (bei Widerspruch: fragen).

**Definition of Done (exakte Invarianten):** Repo-Checks grün · Unit-Tests
für: ID-Determinismus + kanonische Ordnung, `createRelationRecord`-
Idempotenz, Update-Semantik (`fields` ersetzt vollständig,
`confirmationRef: null` entfernt, reservierte `fields`-Keys abgelehnt),
`endpoint`-Filter, Neighbors-Projektion · **Seed-Invarianten:**
312 Domain-Items + 388 Relation-Items = **700 Seed-Items**; UI exakt
**312 Knoten und 388 Kanten**; Prädikate **192 attends, 97 connectedWith,
99 partOf**; Relation-Items werden nie Knoten; keine fachlichen
eingebetteten Relations mehr auf Domain-Items; **zweimaliger Import in
denselben Mock-Store bleibt bei exakt 700 IDs** · App rendert den
DWebCamp-Graph unverändert aus Records · PR offen mit Spec-Ankern.

## Leitplanken

Unverändert: Feature-Branch + PR, kein Push auf `master`, kein
`--no-verify`; nach Toolkit-/Interface-Änderungen
`pnpm --filter @real-life-stack/toolkit build` (Apps konsumieren `dist`);
keine neuen Runtime-Dependencies; `git branch --show-current` vor Commit;
bei Spec-Ambiguität fragen statt raten.
