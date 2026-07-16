# Netzwerk-App — Typen, Relationen, Views (Spec-Entwurf)

Status: ENTWURF v4 (Anton + Eli, 15.07.2026) — Review-Runden R1 + R2
eingearbeitet; **P0-Verträge ausformuliert** in
[08-relation-records.md](08-relation-records.md),
[09-mirror-bridge.md](09-mirror-bridge.md),
[10-activity-log.md](10-activity-log.md). Ursprung:
DWeb-Camp-Graph-Prototyp (`~/workspace/workspace/dwebcamp-2026/dweb-graph/
graph.html`) als UX-Referenz und Testdatensatz.

## Kernidee

Eine RLS-App, in der **Items typisiert** sind, **Relationen zwischen Items
first-class** sind, und **Views austauschbare Linsen** auf denselben
Datenraum eines Space sind.

## Datenmodell

### Typen (Item-Types)

| Typ | Kernfelder |
|---|---|
| Person | avatarUrl (kanonisch per `person/v1`-Schema), offers/needs, DID (optional, verknüpft WoT) |
| Event | start/end, Ort-Relation |
| Projekt | website, repo |
| Place | geo (lat/lng) ODER Bild-Koordinaten, Adresse |
| Ressource | Art, Verfügbarkeit |

**Feld-Platzierung (Review-Fix):** label, description, links, avatar usw.
liegen im aktuellen RLS-Modell in `item.data`, nicht als neue Basisfelder.
Space-/Group-Zugehörigkeit ist **Group-/Connector-Kontext**, kein
universelles Item-Feld.

### Relationen — heutiger Vertrag vs. Ziel

**Ist-Stand (verifiziert):** RLS modelliert Relations eingebettet als
`{ predicate, target, meta }` in `item.relations`
(`packages/data-interface/src/index.ts`); `RelationCapable` liefert nur
verbundene Items, keine Relations-Records.

**Ziel:** eigenständige, versionierte **RelationRecords** (id, type, from,
to, fields wie `tense`, Sichtbarkeit, author) mit CRUD, Beobachtung und
Berechtigung — ein **neuer Vertrag `RelationStoreCapable`**. Das ist ein
Architektur-Entscheid → **P0**, nicht P1-Nebenarbeit.

**Entschieden (P0, 15.07.):** RelationRecords sind **Items mit
`type: "relation"`** (analog zu Kommentaren/Reaktionen als eigene Items,
Regel aus Spec 04) — kein zweiter Persistenz-Pfad; Sync, Permissions,
Activity-Log und Mirror greifen automatisch. `RelationStoreCapable` ist die
typisierte Fassade darüber. Die Endpunkte liegen als **eingebettete
Relations** (`from`/`to`) im Relation-Item — eine Pointer-Syntax im Stack;
`id` deterministisch aus `(createdBy, predicate, from, to)`;
`predicate`/Endpunkte nach Erstellung immutable. Normativ:
[08-relation-records.md](08-relation-records.md).

| Relation | Von → Zu | Besonderheit |
|---|---|---|
| knows | Person → Person | Stufen met / verified — s.u. Trust-Bindung |
| attends | Person → Event | Feld `tense: coming/currently/has-been` |
| partOf | Person → Projekt | |
| connectedWith | Projekt ↔ Event | |
| takesPlaceAt | Event → Place | |
| livesAt | Person → Place | sensibel: engste Sichtbarkeit |
| locatedAt | Projekt → Place | |

### Trust-Bindung (Review-Fix — KEIN SignedClaim-Revival)

RLS hat `SignedClaim` bewusst durch **ConfirmationView /
EncounterVerificationCapable** ersetzt (`docs/spec/05-confirmations-and-
trust.md`). Deshalb:

- `knows(verified)` trägt **keine eigene JWS**, sondern **referenziert die
  WoT-Confirmation/Attestation** (Verifikations-Nachweis lebt beim
  WoT-Connector, mit definierter Prüfung, Kanten-/Space-Bindung und
  Widerruf). Der Graph **leitet `verified` ab** aus der referenzierten,
  geprüften Confirmation.
- Sensible Relationen (livesAt) regeln Sichtbarkeit über den bestehenden
  Berechtigungs-Vertrag, nicht über ein neues Krypto-Feld.

### Multi-Space — Referenz statt Klon (präzisiert nach Review)

Ziel-Modell unverändert: **Canonical Home + Mirror + Brücken-Clients**
(autor-signierte Snapshots). ABER, Ist-Stand verifiziert: Es existiert
`CrossGroupIndex` (`packages/wot-connector/src/CrossGroupIndex.ts`), der
nach nacktem `item.id` indexiert — Home- und Mirror-Instanzen mit gleicher
ID würden sich überschreiben; Snapshot-Frische, Signaturprüfung und
Bridge-Protokoll fehlen. Nötig ist ein **eigener Vertrag** mit
zusammengesetztem Schlüssel `homeSpaceId + itemId` und definierter
Mirror-Aktualisierung inkl. explizitem E2EE- und Konfliktmodell → **eigene
Phase (P2), nicht Gratis-Beigabe**.

## Views

| View | Status | Bindung |
|---|---|---|
| Graph | NEU (Port des Prototyp-Renderers als Toolkit-Komponente + Storybook) | alle Typen + Relationen |
| List | NEU, generisch (Marketplace = List über Ressourcen) | alle |
| Grid | NEU | alle |
| Kanban | NEU (Statusfeld) | Projekte/Ressourcen |
| Map | EXISTIERT → verdrahten; NEU: **Bild-Karten-Modus** (Camp-JPG, Pixel-Koordinaten, Karten-Kontext pro Space) | Place-gebunden |
| Kalender | EXISTIERT → verdrahten | Events |

Prinzip: Views konsumieren Hooks (`useItems`, später `useRelations`),
besitzen keine Daten.

## AppShell

Space-Switch · Verification/Verified Contacts (über
EncounterVerificationCapable) · **Activity-Log** · Profil · Suche · Filter
(Morph-Button) · Settings (Type/View/Relation-Editoren → späte Phase).

**Activity-Log (Review-Fix):** append-only Collection; der Logeintrag wird
**atomar mit der Mutation** geschrieben (gleiche CRDT-Transaktion), sonst
divergieren Item und Log bei Offline-Merges.

## Seed-Spaces

1. **DWebCamp** — Import aus `dweb-graph/graph.json` (Sessions→Events,
   Speaker→Persons; SPEAKS_AT→attends(has-been), FEATURES→connectedWith).
2. **Mein Netzwerk** — Favoriten/met/verified; Multi-Space-Testfall
   (erst ab P2 wirklich geteilt, davor Duplikat mit TODO-Marker).

## Phasen (nach Review neu geschnitten)

- **P0 — Verträge (Spec-Entscheidungen, kein App-Code): ✅ AUSFORMULIERT**
  (1) RelationRecord + RelationStoreCapable und (2) Trust-Bindung an
  Confirmations → [08-relation-records.md](08-relation-records.md);
  (3) Mirror-/Bridge-Vertrag (Schlüssel `homeSpaceId+itemId`, Frische,
  Signaturprüfung) → [09-mirror-bridge.md](09-mirror-bridge.md);
  (4) Activity-Log-Vertrag (Collection-Form, ID-/Sortiermodell, Retention,
  Atomarität, Connector-Capability) → [10-activity-log.md](10-activity-log.md).
- **P1a — App-Gerüst:** `apps/network`, DWebCamp-Seed, Graph-View,
  AppShell/Space-Switch — auf **bestehenden eingebetteten Relations**,
  ohne Cross-Space, ohne Signaturen. **Ausdrücklich NICHT in P1a:**
  Relation-Editor, Activity-Log (wartet auf P0-Vertrag), jede Form von
  Nutzdaten-Migration.
- **P1b — Relation-Records:** persistente RelationRecords + Connector-/
  Hook-Vertrag aus P0 implementieren; Graph-View umstellen. **Übergang von
  eingebetteten `item.relations`: für Seed-/Demo-Daten schlicht Re-Import**
  (keine Migrationsmaschinerie); Nutzdaten-Migration existiert zu diesem
  Zeitpunkt nicht, weil P1a keine Nutzdaten-Editoren hat.
- **P2 — Mirror/Bridge:** Multi-Space mit explizitem E2EE-/Konfliktmodell.
- **P3 — Linsen:** List/Grid/Suche/Filter generisch.
- **P4 — Verdrahtung + Fluss:** Map (inkl. Bild-Modus), Kalender, Kanban,
  Verification-Flow.
- **P5 — Malleable:** Type/View/Relation-Editoren.

## Prozess

Plan: Anton + Eli → **Multi-Model-Review** (Runde 1 absolviert, Befunde
eingearbeitet; Runde 2 auf dieser Fassung) → Implementierung **Codex
5.6-sol** über die Pipeline. `AGENTS.md` des Repos ist für die
Implementierung kanonisch.

## Review-Log

- R1 (15.07., externes Modell): (1) Relations = Architekturentscheid, Ist-
  Vertrag ist eingebettet → P0. (2) SignedClaim nicht wiederbeleben,
  Confirmations-Projektion nutzen. (3) CrossGroupIndex (nicht
  „CrossSpaceIndex"), nackte item.id → eigener Mirror-Vertrag nötig.
  (4) P1 zu breit → P0/P1a/P1b/P2. (5) Feld-Platzierung `data`,
  Space ≠ Item-Basisfeld. (6) Activity-Log atomar zur Mutation.
  **Alle Punkte übernommen.**
- R2 (15.07.): (1) P1a explizit OHNE Relation-Editor und OHNE
  Nutzdaten-Migration; P1b-Übergang = Re-Import der Seeds. (2) Activity-Log
  braucht benannten P0-Vertrag (Collection, ID/Sortierung, Retention) und
  fliegt aus P1a. **Beide übernommen.**
- R3 (15.07., Codex, auf Kapitel 08): (1) Identitäts-Mapping `item:` ↔
  `global:` für die verified-Ableitung definieren (→ `data.did`,
  person/v1 additiv erweitern). (2) Symmetrische Kanten offline nicht
  eindeutig → kanonische Endpunktordnung + deterministische Record-id.
  (3) `predicate`/`from`/`to` nach Erstellung immutable, Update nur
  `fields`/`confirmationRef`, Umhängen = Delete+Create. (4) Berechtigung im
  Schreibpfad durchsetzen; `can()` bleibt UI-Affordance. **Alle vier
  übernommen.** Zusätzlich (Antons Einwand „zwei Arten von Relations?"):
  Endpunkte als eingebettete Relations statt `data.from/to` — eine
  Pointer-Syntax, Reifikations-Muster wie bei Kommentaren.
- R4 (15.07., Codex, 2. Pass auf Kapitel 08): (1) Deterministische `id`
  passte nicht zum ItemWriter-Vertrag (`createItem` ohne `id`-Parameter,
  `createdBy`-Quelle undefiniert) → `createItem` additiv um optionale
  client-`id` erweitert (idempotent bei existierender id); Autor-Quellvertrag:
  `createdBy` nie vom Aufrufer, Connector setzt es aus authentifizierter
  Identität und berechnet die `id` selbst. (2) „Transparente Traversierung"
  über RelationCapable war falsch behauptet (Kanten-Prädikat liegt in
  `data.predicate`, nicht `relations[].predicate`) → RelationCapable löst
  Records ausdrücklich NICHT auf; neue Projektion
  `getRelationNeighbors`/`observeRelationNeighbors` im RelationStore.
  **Beide übernommen.** Codex-Fazit: damit implementierungsreif.
- R5 (15.07., Anton, auf Kapitel 08): Kanten-Felder NICHT in `data.fields`
  verschachteln → flach in `data.*` wie überall im Stack (hasField-Filter,
  Schema-Validierung 06, Malleable-Editoren P5 ohne Sonderfall).
  Kollisionsschutz stattdessen über das bestehende Muster: `relation/v1`
  reserviert `predicate`/`confirmationRef`, neue Vertragsfelder nur per
  Vokabular-Version. In der `RelationRecord`-Projektion bleiben die
  Domänenfelder als `fields` gebündelt. **Übernommen.**
- R6 (15.07., Anton, auf Kapitel 08): „wachsend" präzisiert — Record-Pflicht
  gilt, wenn die Kantenmenge mit der Nutzung unbegrenzt wächst (jede neue
  Kante schriebe das Trägeritem um) oder die Kante einen anderen Autor als
  das Trägeritem hat; feste Beziehungen DÜRFEN ebenfalls Records sein (die
  Netzwerk-App führt alle 7 Relationsarten als Records). **Übernommen.**
- R7 (15.07., Codex, auf Kapitel 09): (1) Freigabe war nicht an den
  Ziel-Space gebunden (Bridge hätte gültige Snapshots in beliebige eigene
  Spaces kopieren können) → `targetSpaceId` in die signierte Payload,
  Empfänger prüfen Gleichheit, N Spaces = N Snapshots. (2) `(seq, ts)` war
  keine totale Ordnung (zwei Offline-Geräte, gleiche seq → Ziel-Spaces
  divergieren dauerhaft) → totale Ordnung `(seq, ts, sha256(Payload))`,
  Übernahme nur bei strikt größerer Version. (3) Tombstone durfte die
  Versionsmarke nicht löschen (Resurrection durch Replay alter Snapshots)
  → Receipt `(homeSpaceId, itemId, höchste Version, Signer-DID)` bleibt
  dauerhaft. (4) Signer für Updates festgezogen: ausschließlich
  `createdBy`, Erst-Annahme bindet die Signer-DID, fremde Signer werden
  verworfen; Delegation out of scope. **Alle vier übernommen.**
- R8 (15.07., Codex, 2. Pass auf Kapitel 09): `seq` hatte keine normierte
  Quelle (getrennte lokale Zähler → gemergter, neuerer Snapshot mit
  kleinerer seq würde dauerhaft verworfen) → `seq` = home-weit
  replizierter Lamport-Zähler pro gespiegeltem Item (Freigabe-Registry im
  Home-Doc, Publish: `seq = 1 + max(beobachtet)`); totale Ordnung jetzt
  `(seq, deviceId, sha256(Payload))`, `ts` nur noch Anzeigezeit.
  **Übernommen.** Codex-Fazit: kein weiterer P0-Befund an 09.
- R9 (16.07., Codex, auf Kapitel 10): (1) `actor#seq` nicht eindeutig bei
  mehreren Geräten derselben DID → `id = actor#deviceId#seq`,
  Anzeige-Ordnung `(ts, actor, deviceId, seq)`. (2) `ActivityEntry[]`
  erzwingt weder Eindeutigkeit noch sichere Retention (Array-Merge kann
  IDs duplizieren, Pruning arbeitet auf Positionen) →
  `activity: Record<id, ActivityEntry>` (Map), Dedup strukturell per Key,
  Retention löscht deterministisch gewählte Schlüssel. (3) `actor` leitet
  der Connector aus der authentifizierten Identität ab, nie aus einem
  App-Parameter. **Alle drei übernommen.**
- R10 (16.07., Codex, auf P1b-Brief + 08): (1) Seed-Daten kollidieren mit
  ID-Regel (112 works_on, nur 99 Paare) → 99 partOf-Records,
  `fields.contexts` sortiert aggregiert = 388 Relation-Records gesamt.
  (2) Seed-Autor vs. Autor-Quellvertrag → privilegierter Fixture-/
  ETL-Pfad in 08 Regel 3 verankert (gleiche ID-Regel, Laufzeit nur über
  auth-gebundenen Store). (3) Update-/Lesesemantik präzisiert: `fields`
  ersetzt vollständig, `confirmationRef: null` entfernt, reservierte Keys
  abgelehnt; P1b-Neighbors lösen nur lokale `item:`-Targets. (4) Exakte
  Abnahme-Invarianten im Brief (700 Seed-Items, 312 Knoten/388 Kanten,
  192/97/99, Doppel-Import stabil). **Alle vier übernommen.**
