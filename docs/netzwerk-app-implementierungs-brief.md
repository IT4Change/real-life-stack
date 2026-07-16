# Typen-Konsolidierung — Implementierungs-Brief für Codex

**Auftraggeber:** Anton + Fable (Orchestrierung/Review) · **Implementierung:** Codex
**Stand:** 16.07.2026 · P1b ist gemergt (`1ba1f5899`), die Konvergenz-Strategie
ist normativ auf master (PR #150, `b3349b737`).
**Dein Auftrag jetzt: ausschließlich der Vorschnitt „Typen-Konsolidierung"
vor P3.** Spätere Phasen kommen als eigene Aufträge.

## Pflichtlektüre (in dieser Reihenfolge)

1. `docs/spec/00-architecture.md` — **Architekturregel 9 (Absink-Regel)** ist
   für diesen Auftrag bindend: nichts App-Lokales bauen, was in die Pakete
   gehört.
2. `docs/spec/netzwerk-app.md` — Abschnitte „Typen (Item-Types)",
   „Relationen" und „Konvergenz-Strategie mit der Referenz-App" (der
   Vorschnitt dort IST dieser Auftrag). Review-Log R1–R17: gekippte
   Entscheidungen nicht wieder einführen.
3. `docs/spec/06-schema-composition.md` — Kompositionsregeln, insbesondere:
   Property-Namen MÜSSEN über alle Vokabulare eindeutig sein.
4. `docs/spec/schemas/vocab/person/v1/` und `relation/v1/` — Vorlage für
   Struktur und Stil neuer Vokabulare (`schema.json` + `context.jsonld` +
   `examples/valid/`).
5. `docs/spec/08-relation-records.md` — nur ID-Regel und kanonische Ordnung:
   **Symmetrie ist ID-Semantik.**
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
   und Z. 2853).
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
7. Die **Vokabel-Liste in `06-schema-composition.md`** (ca. Z. 101–105)
   führt `relation/v1` nicht (P1b-Versäumnis) und braucht `project/v1` +
   `resource/v1` (Katalog zieht im selben PR mit).
8. Die **Symmetrie-Definition** (`knows`, `connectedWith`) lebt app-lokal in
   `NETWORK_RELATION_STORE_OPTIONS` (`apps/network/src/data/network-seed.ts`)
   — R14 hat den Katalog im data-interface als Ziel benannt; app-lokal
   driftet sie beim nächsten Konsumenten.

## Auftrag — Scope

### 1. Neue Vokabulare `project/v1` und `resource/v1`

- Struktur je exakt wie `person/v1`: `schema.json` + `context.jsonld` +
  `examples/valid/*.json`. Der Test
  `packages/data-interface/tests/schema-validation.test.ts` entdeckt neue
  vocab-Ordner automatisch — deine Examples werden ohne Wiring zu CI-Fällen.
- **`project/v1`:** `data` required `["title"]`; Properties: `title`
  (string, minLength 1), `description` (string), `website` (string, format
  uri), `repo` (string, format uri); `additionalProperties: true`.
  (Spec-Anker: netzwerk-app.md Typen-Tabelle „Projekt | website, repo";
  Felder exakt so, wie der Netzwerk-Seed sie heute schreibt.)
- **`resource/v1`:** `data` required `["title"]`; Properties: `title`
  (string, minLength 1), `description` (string), `kind` (string — die „Art",
  z. B. tool/space/material; bewusst freier String), `availability` (string,
  freier Text); `additionalProperties: true`. (Spec-Anker: Typen-Tabelle
  „Ressource | Art, Verfügbarkeit". Enum-Verfeinerung kommt additiv mit der
  Marketplace-Linse in P3, nicht jetzt.)
- `06-schema-composition.md`: Vokabel-Liste um `relation/v1`, `project/v1`,
  `resource/v1` ergänzen. **Keine weiteren Spec-Änderungen.**

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
  `website?`, `repo?`) inkl. `ProjectRelations` (forward `locatedAt` →
  PlaceItem; reverse `partOf` ← Person, `connectedWith` ↔ Event — Prädikate
  aus der netzwerk-app.md-Relationen-Tabelle; das sind
  RelationRecord-Prädikate in `data.predicate`, KEINE eingebetteten
  relations[]-Prädikate — im Kommentar kenntlich machen).
- **Neu `ResourceData`/`ResourceItem`/`isResource`** (`title`, `kind?`,
  `availability?`, `description?`).
- **`KnownItemType` += `"project" | "resource" | "relation"`.** Keine
  Duplikation der RelationRecord-Typen — die leben in
  `relation-records.ts`.
- Konsumenten enumeriert der Compiler. Bekannter Fall:
  `packages/toolkit/src/components/calendar/calendar-view.tsx` Titel-
  Fallback — `displayName` in die Kette aufnehmen (`title ?? displayName ??
  name`; der `name`-Fallback darf für Fremddaten bleiben).

### 4. Prädikaten-Katalog (minimal)

- In `packages/data-interface`:
  `interface RelationPredicateDefinition { predicate: string; symmetric: boolean }`
  plus Katalog mit den sieben Prädikaten der netzwerk-app.md-Tabelle:
  `knows` (symmetric), `attends`, `partOf`, `connectedWith` (symmetric),
  `takesPlaceAt`, `livesAt`, `locatedAt`.
- Helper, der daraus `DefaultRelationStoreOptions` ableitet
  (`symmetricPredicates`).
- `apps/network`: `NETWORK_RELATION_STORE_OPTIONS` durch die
  Katalog-Ableitung ersetzen.
- ⚠️ **`symmetric` ist ID-Semantik** (08, kanonische Ordnung): Die Flags
  sind mit allen existierenden Relation-IDs verheiratet — `knows` und
  `connectedWith` symmetric, alle anderen nicht. Ein späterer Flag-Wechsel
  wäre eine ID-Migration; Kommentar am Katalog, der genau das sagt.
- NICHT im Katalog: Labels, Kardinalitäten, UI-Metadaten (P3/P5).

### 5. Person-Runtime-Pfad (WoT-Connector)

- **TDD, Vertragstest zuerst:** `getMyProfile()` liefert ein
  person/v1-konformes Item — `data.displayName` (nie `name`),
  `data.avatarUrl`, `@context` via `deriveContext` enthält person/v1. Dann
  grün machen, ohne den Test zu ändern.
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
3. Schema-Validation-Test deckt project/v1 + resource/v1 automatisch ab
   (mindestens je ein valides Example).
4. `getMyProfile()`-Vertragstest: person/v1-konform inkl. `@context`.
5. Auf allen enumerierten person-Item-Pfaden kein `data.name`/`data.avatar`
   mehr (grep-Beweis im PR-Body; die Nicht-Ziel-Verträge sind ausgenommen).
6. `item-types.ts` enthält kein `GeoLocation` und kein `data.tags` mehr;
   `KnownItemType` umfasst project/resource/relation.
7. Kein package.json-Diff, keine neuen Dependencies.

## Nicht-Ziele

- Keine Umbenennung in `ProfileCapable`/`ContactManager`/`UserProfile`/
  `PublicProfileData` (Folge-Schnitt, wenn Profil↔person-Item konvergiert).
- Keine Vokabulare für post/comment/reaction/feature (bekannte Lücke,
  nicht dieser Schnitt).
- Keine Marketplace-/Linsen-UI (P3), keine Karten-/Bild-Koordinaten-
  Entscheidung (P4).
- Keine Storage-Migration (personal doc, space docs).
- Keine Spec-Regeländerungen außer der Vokabel-Liste in 06.

## Leitplanken

- Ein kohärenter PR gegen `master`; PR-Body mit Spec-Ankern
  (netzwerk-app.md Konvergenz-Abschnitt, 06, 08) und der
  person-Item-Enumeration.
- TDD: Vertragstests zuerst, dann Implementierung. Bestehende Tests nur
  anpassen, wo sie die Drift selbst kodieren (z. B. Seed-`@context`-
  Assertions) — jede Teständerung im PR-Body begründen.
- Absink-Regel (Architekturregel 9): gilt auch hier.
- Checks laufen wie in `AGENTS.md`; nach data-interface-Änderungen
  Toolkit-Rebuild beachten.
