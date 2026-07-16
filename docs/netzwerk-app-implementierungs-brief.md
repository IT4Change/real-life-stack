# Typen-Konsolidierung — Implementierungs-Brief für Codex

**Auftraggeber:** Anton + Fable (Orchestrierung/Review) · **Implementierung:** Codex
**Stand:** 16.07.2026 · P1b ist gemergt (`1ba1f5899`), die Konvergenz-Strategie
ist normativ auf master (PR #150, `b3349b737`). Review-Runde auf diesen Brief
(Codex, 4 Blocker) ist eingearbeitet.
**Dein Auftrag jetzt: ausschließlich der Vorschnitt „Typen-Konsolidierung"
vor P3.** Spätere Phasen kommen als eigene Aufträge.

## Pflichtlektüre (in dieser Reihenfolge)

1. `docs/spec/00-architecture.md` — **Architekturregel 9 (Absink-Regel)** ist
   für diesen Auftrag bindend: nichts App-Lokales bauen, was in die Pakete
   gehört. Ebenso Regel 8: RLS-Core besitzt keine Domänensemantik.
2. `docs/spec/netzwerk-app.md` — Abschnitte „Typen (Item-Types)",
   „Relationen" und „Konvergenz-Strategie mit der Referenz-App" (der
   Vorschnitt dort IST dieser Auftrag). Review-Log R1–R17: gekippte
   Entscheidungen nicht wieder einführen.
3. `docs/spec/06-schema-composition.md` + `docs/spec/schemas/README.md` —
   Kompositionsregeln. Zwei harte Regeln: Property-Namen MÜSSEN über alle
   Vokabulare eindeutig sein, und **Context/Schema deklarieren nur die
   Felder, die das Vokabular besitzt** (additive Konvention).
4. `docs/spec/schemas/vocab/person/v1/` und `relation/v1/` — Vorlage für
   Struktur und Stil neuer Vokabulare (`schema.json` + `context.jsonld` +
   `examples/valid/`).
5. `docs/spec/08-relation-records.md` — ID-Regel, kanonische Ordnung und
   Regel 3: **Symmetrie deklariert die App (Übergangslösung); Ziel ist die
   versionierte RelationTypeDefinition im Space (P5).**
6. `AGENTS.md` des Repos — kanonisch für Arbeitsweise und Checks.

Bei Konflikt gilt: **Schemas schlagen `item-types.ts`**, Spec schlägt Code,
Review-Log schlägt ältere Spec-Absätze.

## Plan-Stand

| Phase | Inhalt | Status |
|---|---|---|
| P0 | Verträge 08/09/10 | ✅ Spec |
| P1a | App-Gerüst, Seed, Graph-View | ✅ gemergt #141 |
| P1b | RelationRecords + Capabilities | ✅ gemergt #146 |
| **Vorschnitt** | **Typen-Konsolidierung: eine Quelle für Referenz- UND Netzwerk-Typen** | **JETZT** |
| P2–P5 | Mirror · Linsen · Verdrahtung · Malleable | später |

Ein kohärenter PR gegen `master`, PR-Body mit Spec-Ankern.

## Warum dieser Schnitt

`item-types.ts` und die Vokabulare werden die eine Quelle für alle Typen
(Entscheid 16.07., netzwerk-app.md). P3 (Linsen: List/Grid/Suche/Filter)
setzt direkt auf diesen Typen auf — die Drift muss vorher zu sein.

## Ist-Drift (verifiziert am 16.07. gegen origin/master)

1. **`ProfileItemData`** (`packages/data-interface/src/item-types.ts`):
   `name`/`avatar` — das kanonische `person/v1`-Schema sagt `displayName`
   (required)/`avatarUrl`. Der Netzwerk-Seed schreibt bereits schema-konform.
2. **Runtime-Drift im WoT-Connector:** `getMyProfile`/`profileObs`
   materialisiert person-Items mit `data.name`/`data.avatar` und **ohne
   `@context`** (`packages/wot-connector/src/wot-connector.ts`, ca. Z. 647
   und Z. 2853). Zusätzlich speichert `updateProfile` beliebige
   Avatar-Strings (z. B. `pic.jpg` in der bestehenden Regression) —
   `person/v1` verlangt heute `format: uri`; reines Umbenennen wäre also
   NICHT schema-konform (Festlegung dazu in Scope 5).
3. **`PlaceData.location: GeoLocation` (required) und
   `EventData.location`** — `place/v1` und die Toolkit-Runtime
   (`use-item-position.ts`, `lib/geo.ts`) nutzen `data.position`
   (GeoJSON-Geometrie). `GeoLocation` hat laut `git grep` außerhalb von
   `item-types.ts` keine Code-Konsumenten — gefahrlos ersetzbar.
4. **`tags` in `TaskData`/`EventData`/`PostData`/`PlaceData`** (also in
   `data`) — `base/v1` definiert `tags` als **Root-Feld** und
   `packages/toolkit/src/lib/item-filter.ts` liest `item.tags`. `data.tags`
   sieht kein Filter je.
5. **`EventData`** fehlen die `event/v1`-Felder `duration`, `rrule`,
   `meetingLink`; **`PlaceData`** fehlt `locationName`.
6. **`KnownItemType`** fehlen `"relation"` (seit P1b live), `"project"`
   (Netzwerk-App live!) und `"resource"` (P3 braucht es).
7. Die **lebenden Vokabular-Indizes** hinken: `06-schema-composition.md`
   (ca. Z. 101–105) und `docs/spec/README.md` führen `relation/v1` nicht
   (P1b-Versäumnis); `docs/spec/schemas/README.md` braucht project/resource;
   `docs/spec/glossary.md` behauptet noch `data.avatar`.
8. Die **Symmetrie-Deklaration** (`knows`, `connectedWith`) lebt als lose
   Options-Konstante in `NETWORK_RELATION_STORE_OPTIONS`
   (`apps/network/src/data/network-seed.ts`). Per 08 Regel 3 ist die
   App-Deklaration die richtige Ebene (Übergangslösung bis P5) — was fehlt,
   ist die vertragliche Form (Interface + Ableitung im data-interface) und
   ein Test, der den Katalog beweist.

## Auftrag — Scope

### 1. Neue Vokabulare `project/v1` und `resource/v1`

- Struktur je exakt wie `person/v1`: `schema.json` + `context.jsonld` +
  `examples/valid/*.json`.
- **Additive Konvention (schemas/README.md) strikt einhalten:** `title` und
  `description` gehören `base/v1` — sie dürfen in den neuen Schemas
  **weder unter `properties` noch im `context.jsonld`** erneut auftauchen
  (ein Re-Claim würde die Terms auf einen anderen JSON-LD-Namespace
  umbiegen). `required: ["title"]` ist erlaubt — Präsenz-Pflicht ohne
  Besitz.
- **`project/v1`:** `data` required `["title"]`; eigene Properties NUR
  `website` (string, format uri), `repo` (string, format uri);
  `additionalProperties: true`. (Spec-Anker: netzwerk-app.md Typen-Tabelle
  „Projekt | website, repo"; Felder exakt so, wie der Netzwerk-Seed sie
  heute schreibt.)
- **`resource/v1`:** `data` required `["title"]`; eigene Properties NUR
  `kind` (string — die „Art", z. B. tool/space/material; bewusst freier
  String), `availability` (string, freier Text); `additionalProperties:
  true`. (Spec-Anker: Typen-Tabelle „Ressource | Art, Verfügbarkeit".
  Enum-Verfeinerung kommt additiv mit der Marketplace-Linse in P3.)
- **Schema-Test härten** (`packages/data-interface/tests/
  schema-validation.test.ts`): Der Test überspringt fehlende Schemas und
  leere Example-Ordner heute still — damit wäre die Abnahme wertlos.
  Pflichtliste der Standardvokabulare einführen (base, event, person,
  place, task, relation, project, resource): fehlendes Schema, fehlendes
  `context.jsonld` oder null valide Examples = Testfehler. Zusätzlich
  eine **Re-Claim-Prüfung** der Contexts: kein Context außer base/v1 darf
  einen von base/v1 besessenen Property-Term (`title`, `description`,
  `content`, `tags`, `relations`, …) erneut deklarieren. NICHT verboten
  sind legitime Nicht-Property-Terms: Wert-Terme (z. B. `open`/`done`/
  `in-progress`/`archived` in task/v1), Prädikat-Terme (`from`/`to` in
  relation/v1) und Präfixe (`rls`, `xsd`) — ein naiver
  „Terms ⊆ Schema-Properties"-Test würde die bestehenden Vokabulare
  brechen.
- **Vokabular-Indizes nachziehen** (im selben PR): Vokabel-Liste in
  `06-schema-composition.md` + `docs/spec/README.md` + `docs/spec/schemas/
  README.md` um relation/project/resource ergänzen; `docs/spec/glossary.md`
  `data.avatar` → `avatarUrl` korrigieren.

### 2. `packages/data-interface/src/vocab.ts`

- Konstanten `VOCAB_PROJECT`, `VOCAB_RESOURCE`.
- `deriveContext`: `type === "project"` → project/v1, `type === "resource"`
  → resource/v1 (typ-basierte Aktivierung wie person/relation).
  Doc-Kommentar der Aktivierungsregeln nachziehen. Tests zuerst.

### 3. `item-types.ts` folgt den Schemas

- **`ProfileItemData`:** `displayName: string` (required per Schema),
  `avatarUrl?`, `bio?`, `did?`; die additiven Felder
  `phone/address/skills/offers/needs` bleiben (`additionalProperties:
  true`). Der Kommentar „person = kanonischer type-String" bleibt.
- **`PlaceData`:** `position` (GeoJSON-Geometrie per place/v1 — minimalen
  Geometrie-Typ lokal definieren, NICHT aus dem Toolkit importieren; das
  Toolkit darf später auf den data-interface-Typ umziehen, nicht umgekehrt),
  `address?`, `locationName?`, `title`, `description?`. `GeoLocation`
  entfernen.
- **`EventData`:** `location`/`address` raus (Karten-Darstellung ist
  Komposition mit place/v1 via `data.position`, siehe 06); `duration?`,
  `rrule?`, `meetingLink?` rein (event/v1); `start`/`end` wie gehabt.
- **`tags` aus allen Data-Interfaces raus** — tags ist Root-Feld
  (`item.tags`, base/v1).
- **Neu `ProjectData`/`ProjectItem`/`isProject`** (`title`, `description?`,
  `website?`, `repo?`) und **`ResourceData`/`ResourceItem`/`isResource`**
  (`title`, `kind?`, `availability?`, `description?`).
- **KEIN `ProjectRelations`/`ResourceRelations`.** Die `*Relations`-
  Interfaces dieser Datei typisieren ausschließlich eingebettete
  `item.relations[]` (Dateikopf-Vertrag); RelationRecord-Prädikate
  (`knows`/`attends`/`partOf`/…) leben in `data.predicate` und sind eine
  andere Welt (08). Sie werden NICHT in `*Relations`-Interfaces oder
  `KnownPredicate` aufgenommen — ihre Typisierung kommt app-seitig aus dem
  Katalog (Scope 4). Dateikopf-Kommentar um genau diese Abgrenzung
  ergänzen.
- **Embedded-Bestand bleibt unangetastet:** `EventRelations.locatedAt`
  (embedded, Event→Place) behält seine Semantik — die RelationRecord-Welt
  nutzt per netzwerk-app.md `takesPlaceAt` (Event→Place) und `locatedAt`
  (Projekt→Place). `locatedAt` existiert damit bewusst in beiden Welten
  (**entschiedener Legacy-Overlap** — kein Umbenennen des
  Embedded-Bestands = keine Datenmigration in diesem Schnitt); der
  Abgrenzungs-Kommentar benennt genau das.
- **`KnownItemType` += `"project" | "resource" | "relation"`.** Keine
  Duplikation der RelationRecord-Typen — die leben in
  `relation-records.ts`.
- Konsumenten enumeriert der Compiler. Bekannter Fall:
  `packages/toolkit/src/components/calendar/calendar-view.tsx` Titel-
  Fallback — `displayName` in die Kette aufnehmen (`title ?? displayName ??
  name`; der `name`-Fallback für Fremddaten darf bleiben).

### 4. Prädikaten-Katalog: Vertrag im Core, Inhalt in der App

Per 08 Regel 3 und Architekturregel 8: Der Core bekommt die **Form**, die
App den **Inhalt**. Der konkrete Katalog ist eine benannte Übergangslösung
bis P5 (versionierte RelationTypeDefinition im Space).

- **`packages/data-interface`:**
  `interface RelationPredicateDefinition { predicate: string; symmetric: boolean }`
  plus Helper `relationStoreOptionsFrom(definitions)` →
  `DefaultRelationStoreOptions` (leitet `symmetricPredicates` ab). KEINE
  konkreten Prädikate im Core.
- **`apps/network`:** Katalog `NETWORK_RELATION_PREDICATES` **`as const`**
  mit den sieben Prädikaten der netzwerk-app.md-Tabelle: `knows`
  (symmetric), `attends`, `partOf`, `connectedWith` (symmetric),
  `takesPlaceAt`, `livesAt`, `locatedAt`. Kommentar am Katalog: (a)
  Interim-Default bis P5 (08 Regel 3), (b) ⚠️ **`symmetric` ist
  ID-Semantik** (08, kanonische Ordnung) — die Flags sind mit allen
  existierenden Relation-IDs verheiratet; ein späterer Flag-Wechsel wäre
  eine ID-Migration.
- Die App leitet ihre Prädikat-Union aus dem `as const`-Katalog ab
  (`typeof NETWORK_RELATION_PREDICATES[number]["predicate"]`) und ersetzt
  `NETWORK_RELATION_STORE_OPTIONS` durch `relationStoreOptionsFrom(...)`.
- **Direkter Katalog-Test** (nicht nur indirekt über den Seed): exakt
  sieben eindeutige Einträge, genau `knows` + `connectedWith` symmetrisch,
  und ein fester ID-Vektor über die katalogabgeleiteten Options (beweist,
  dass die Ableitung dieselben IDs produziert wie bisher).
- NICHT im Katalog: Labels, Kardinalitäten, UI-Metadaten (P3/P5).

### 5. Person-Runtime-Pfad (WoT-Connector)

- **Festlegung avatarUrl:** `person/v1.avatarUrl` verliert den
  `format`-Constraint und wird **`type: string` + `minLength: 1`**
  (einzige Schema-Änderung dieses Schnitts). Begründung: Der Storage
  akzeptiert heute beliebige Strings (`updateProfile`), der Bestand
  enthält relative Referenzen (z. B. `pic.jpg`) und potenziell freie
  Strings, die auch `uri-reference` nicht abdeckt (`hello world`,
  kaputtes Percent-Encoding). Werte in der Projektion auszulassen würde
  über den Profil-Edit-Roundtrip gespeicherte Avatare löschen
  (Datenverlust); Write-Validierung/Migration ist ein eigener Schnitt.
  Für diesen migrationsfreien Schnitt ist string+minLength die einzige
  Schema-Aussage, die der Vertrag garantieren kann. Die `description` im
  Schema dokumentiert die Intention (URI-Referenz auf ein Bild); die
  Rück-Verschärfung auf `format: uri-reference` kommt, wenn ein späterer
  Schnitt Write-Validierung + Bestands-Migration bringt. Der
  Netzwerk-Seed (absolute URLs) bleibt gültig; das `person/v1`-Example
  bekommt einen Fall mit relativer Referenz. Die Projektion emittiert
  `avatarUrl` nur bei nicht-leerem Storage-Wert.
- **TDD, Vertragstest zuerst:** `getMyProfile()` liefert ein Item, das
  **per AJV gegen person/v1 validiert** (nicht nur Feldnamen prüfen):
  `data.displayName` (nie `name`; `getDefaultDisplayName`-Fallback
  garantiert Präsenz), `data.avatarUrl`, `@context` via `deriveContext`
  enthält person/v1 — inklusive der Legacy-Fälle `avatar: "pic.jpg"`
  und `avatar: "hello world"` (freier String) → beide konform. Dann grün
  machen, ohne den Test zu ändern.
- Projektion in `profileObs` und im `updateMyProfile`-Fallback umstellen.
  **Speicherformat NICHT migrieren:** das personal-doc-Profil
  (`{name, avatar, bio}`) bleibt exakt wie es ist — nur die Item-Projektion
  mappt `name → displayName`, `avatar → avatarUrl`.
- Alle Produzenten und Konsumenten von type-`"person"`-Items enumerieren
  (`git grep 'type: "person"'` und `=== "person"`), Liste in den PR-Body.
  Konsumenten, die `data.name`/`data.avatar` von person-**Items** lesen,
  nachziehen.
- **NICHT anfassen:** `ProfileCapable.updateProfile`-Signatur,
  `PublicProfileData`, `ContactInfo`, `UserProfile` — das sind eigene
  Verträge (kein `Item.data`), eigener Schnitt.

### 6. `docs/concepts/item-types.md`

- Nur einen Verweis-Header ergänzen: normative Quellen sind
  `docs/spec/schemas/vocab/` + `packages/data-interface/src/item-types.ts`.
  Inhalt sonst unangetastet (historisches Ideation-Doc).

## Definition of Done — Invarianten

1. Alle bestehenden Tests grün; insbesondere Netzwerk-Seed unverändert:
   **700 Items (312+388), 312 Knoten/388 Kanten, 192 attends /
   97 connectedWith / 99 partOf, Doppel-Import stabil bei 700 IDs** —
   Relation-IDs byte-identisch zu vorher (Symmetrie-Flags unverändert).
   Einziger erwarteter Seed-Unterschied: project-Items tragen jetzt
   project/v1 im `@context`.
2. `deriveContext("project", {})` → `[base, project]`;
   `deriveContext("resource", {})` → `[base, resource]`; alle bestehenden
   Aktivierungen unverändert (Testfälle).
3. Gehärteter Schema-Test: Pflichtliste base/event/person/place/task/
   relation/project/resource — je Schema + Context + mindestens ein
   valides Example; Re-Claim-Prüfung wie in Scope 1 (nur fremd-besessene
   Property-Terms verboten, Wert-/Prädikat-Terme und Präfixe erlaubt).
   (Die bisherige Silent-Skip-Logik reicht als Abnahme nicht.)
4. Katalog-Test: sieben eindeutige Prädikate, genau `knows` +
   `connectedWith` symmetric, fester ID-Vektor über
   `relationStoreOptionsFrom(NETWORK_RELATION_PREDICATES)`.
5. `getMyProfile()`-Vertragstest: AJV-Validierung gegen person/v1 inkl.
   `@context` und Legacy-Avatar-Fällen (`pic.jpg`, freier String).
6. Auf allen enumerierten person-Item-Pfaden kein `data.name`/`data.avatar`
   mehr (grep-Beweis im PR-Body; die Nicht-Ziel-Verträge sind ausgenommen).
7. `item-types.ts` enthält kein `GeoLocation` und kein `data.tags` mehr;
   `KnownItemType` umfasst project/resource/relation; keine
   RelationRecord-Prädikate **neu** in `*Relations`/`KnownPredicate`
   aufgenommen — der bestehende embedded `locatedAt`-Eintrag ist der in
   Scope 3 entschiedene Legacy-Overlap und bleibt.
8. Keine neuen **Runtime**-Dependencies. Einzige erlaubte
   package.json-Änderung: `ajv` + `ajv-formats` als devDependencies des
   WoT-Connectors für den Vertragstest aus DoD 5 (Versionen wie im
   data-interface).

## Nicht-Ziele

- Keine konkreten Domänen-Prädikate im data-interface (08 Regel 3:
  App-Deklaration ist die Übergangslösung; RelationTypeDefinition im
  Space ist P5).
- Keine Umbenennung in `ProfileCapable`/`ContactManager`/`UserProfile`/
  `PublicProfileData` (Folge-Schnitt, wenn Profil↔person-Item konvergiert).
- Keine Umbenennung im Embedded-Relations-Bestand (`locatedAt` von Events
  bleibt) — keine Datenmigration.
- Kein gemeinsamer Label-/Suchfallback über `displayName` in item-filter/
  item-preview/item-detail-view — das machen die Linsen in P3 systematisch;
  hier nur der Calendar-Fallback (bekannter konkreter Konsument).
- Keine Vokabulare für post/comment/reaction/feature (bekannte Lücke,
  nicht dieser Schnitt).
- Keine Marketplace-/Linsen-UI (P3), keine Karten-/Bild-Koordinaten-
  Entscheidung (P4).
- Keine Storage-Migration (personal doc, space docs).
- Kein gemeinsamer Runtime-Schema-Validator: AJV bleibt Test-Werkzeug;
  Schema-Validierung zur Laufzeit ist nicht Teil dieses Schnitts.
- Keine Write-Validierung für Profil-Felder und keine
  Avatar-Bestands-Migration (Voraussetzung für eine spätere
  Rück-Verschärfung des avatarUrl-Formats, eigener Schnitt).
- Keine Spec-Änderungen außer: Vokabular-Indizes (06, spec/README,
  schemas/README, glossary) und `person/v1.avatarUrl` →
  `type: string` + `minLength: 1` ohne `format` (Scope 5).

## Leitplanken

- Ein kohärenter PR gegen `master`; PR-Body mit Spec-Ankern
  (netzwerk-app.md Konvergenz-Abschnitt, 06, 08) und der
  person-Item-Enumeration.
- TDD: Vertragstests zuerst, dann Implementierung. Bestehende Tests nur
  anpassen, wo sie die Drift selbst kodieren (z. B. Seed-`@context`-
  Assertions) — jede Teständerung im PR-Body begründen.
- Absink-Regel (Architekturregel 9): gilt auch hier — und ihr Gegenstück
  Regel 8: keine Domänensemantik in den Core drücken.
- Checks laufen wie in `AGENTS.md`; nach data-interface-Änderungen
  Toolkit-Rebuild beachten.
