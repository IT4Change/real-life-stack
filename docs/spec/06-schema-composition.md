# Schema-Composition

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt, wie ein RLS-Item seine Struktur und Bedeutung trägt — über **kompositorische `@context`-Vokabulare** statt über eine starre Type-Hierarchie.

Die orthogonale Achse **Kategorisierung** (welchem Thema gehört ein Item an) liegt in [07-tags.md](07-tags.md).

Diese Spec ergänzt [02-data-interface.md](02-data-interface.md) (Core Item) und [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md) (Items, Relations, Groups, Spaces).

Code-Referenz: `packages/data-interface/src/index.ts`

## Motivation

Die frühere Datenmodellierung (insbesondere in Utopia-Map) hat **Layer** in einer Doppelrolle benutzt:

1. Struktur (welche Felder hat ein Item: Event, Ort, Person, Aufgabe)
2. Kategorisierung (zu welchem Thema gehört ein Item: Permakultur, Bildung, regionale Karte)

Diese Doppelrolle führt zu Konflikten: User legen viele Layer an, um Themen abzubilden, brauchen aber denselben Strukturtyp; ein Item kann immer nur in einem Layer sein, obwohl es gleichzeitig Ort UND Event sein könnte.

RLS trennt diese Aspekte:

- **Struktur** ergibt sich aus den **`@context`-Schemas**, die ein Item komponiert (mehrere parallel möglich) — Gegenstand dieser Spec.
- **Art** (als was ein Item erstellt wurde) trägt **`type`** — genau eine pro Item, steuert Template und User-Filter, siehe „Die Rolle von `type`".
- **Kategorisierung** läuft über **Tags** (frei oder URN-basiert, optional in einem Kategoriebaum strukturierbar) — siehe [07-tags.md](07-tags.md).
- **Modul-Sichtbarkeit** folgt aus den Feldern — siehe „Verhältnis zwischen Schema- und Feldfiltern".
- **Thematische Klammer** ist der **Space** selbst — verschiedene Communities haben verschiedene Spaces mit eigenen Schwerpunkten.

## Schema-Composition über `@context`

Ein RLS-Item trägt eine `@context`-Liste, die festlegt, welche Vokabulare seine Felder definieren. Das Pattern ist analog zu [W3C Verifiable Credentials](https://www.w3.org/TR/vc-data-model-2.0/), wie auch im WoT-Spec für Attestations verwendet.

### Item mit `@context`

```ts
interface Item {
  id: string
  '@context': string[]            // ordered list of vocabulary URLs
  type?: string | string[]         // Art des Items (Template + User-Filter), siehe „Die Rolle von `type`"
  createdAt: string
  createdBy: string
  data: Record<string, unknown>
  tags?: string[]                  // tag identifiers (free strings or URNs, see 07-tags.md)
  relations?: Relation[]
}
```

Regeln:

1. `@context[0]` ist immer `https://real-life-stack.org/vocab/base/v1` — definiert die RLS-Item-Basis-Felder (`id`, `createdAt`, `createdBy`, `data`, ...).
2. Weitere Einträge erweitern das Vokabular und damit die in `data` zulässigen Felder.
3. **Property-Namen MÜSSEN über alle Vokabularien eindeutig sein.** JSON-LD's last-wins-Verhalten gilt nur für reine Property-Identifier-Auflösung; die JSON-Schema-Validierung läuft über `allOf` (Schnittmenge) und kennt keine Überschreibung. Vocabulary-Autoren vermeiden Kollisionen aktiv: gleiche Semantik → gleicher Name (Konvention), unterschiedliche Semantik → unterschiedlicher Name. Validator-Verhalten bei einer Kollision ist undefined und gilt als Vokabular-Bug.
4. Semantisch gleiche Properties aus verschiedenen Vokabularen tragen denselben Namen (z.B. `start` für Beginn-Zeitpunkt, egal ob Event oder Task).
5. `type` benennt die Art eines Items (siehe „Die Rolle von `type`") und steuert **nie die Modul-Aktivierung** — welche Items ein Modul zeigt, entscheidet Feld-Präsenz oder (zukünftig) `hasSchema`.

### Beispiel: Workshop in der Markthalle

```json
{
  "id": "uuid-abc",
  "@context": [
    "https://real-life-stack.org/vocab/base/v1",
    "https://real-life-stack.org/vocab/event/v1",
    "https://real-life-stack.org/vocab/place/v1"
  ],
  "type": "event",
  "createdAt": "2026-06-05T14:00:00Z",
  "createdBy": "did:key:z6Mki…",
  "data": {
    "title": "Permakultur-Workshop",
    "start": "2026-07-15T18:00",
    "duration": "PT2H",
    "position": { "type": "Point", "coordinates": [9.5, 51.3] },
    "address": "Markthalle 7"
  },
  "tags": ["urn:rls:tag:permaculture", "urn:rls:tag:education"]
}
```

Dieses Item erscheint **gleichzeitig auf der Map** (wegen `place`-Schema → `position`-Feld) und **im Calendar** (wegen `event`-Schema → `start`-Feld). Keines der Module muss vom anderen wissen.

### Überlagerung statt Konflikt

Wenn zwei `@context`-Schemas dieselbe Semantik treffen (z.B. `start` für Beginn), wird das Feld **geteilt**, nicht dupliziert. Beispiel: ein Item, das gleichzeitig Event und Task ist, hat ein gemeinsames `start`. Strukturelle Überlagerung ist beabsichtigt.

Wenn semantisch unterschiedliche Konzepte denselben Property-Namen tragen würden, ist das ein **Schema-Design-Fehler**, der durch Aliasing im Vocabulary-Context behoben wird (z.B. `event:start` vs. `subscription:start`).

### Die Rolle von `type`

`type` benennt die **Art**, als die ein Item erstellt wurde (`post`, `event`, `task`) — die Intention beim Erstellen. Aus ihr wählt der Composer ein **Template** (Widget-Set beim Erstellen, Karten-Darstellung beim Anzeigen); sie bleibt am Item, damit Module und User sich darauf beziehen können. `type` ist genau eine pro Item; bei mehreren Werten zählt die erste. Pro `type` gehört **ein** Template (Erstellen-Widgets und Anzeige-Karte zusammen); heute als `ContentTypeConfig` je Modul-View definiert; das kanonische, modulübergreifend geteilte **Typ-Register** (nächster Abschnitt) löst diese Streuung ab.

`type` darf tragen: die Composer-Vorlage, die Karten-Wahl in aggregierenden Sichten (Feed, Suche) und **User-Filter** („zeig mir nur Veranstaltungen"). Es darf **nicht** die **Modul-Aktivierung** steuern: ob ein Item im Calendar erscheint, entscheidet `data.start`, nie `type` — sonst verschwände ein Task mit Fälligkeitsdatum zu Unrecht. Der Unterschied ist prinzipiell: Modul-Aktivierung ist eine System-Frage und immer feldbasiert; ein User-Filter ist eine Mensch-Frage und darf die Intention nutzen, die nur in `type` steht (ein Task mit Deadline und ein Event tragen beide `start` — „die Veranstaltungen" sind aus Feldern allein nicht herauszufiltern).

### Typ-Register

Das Typ-Register löst die oben genannte Ausbaustufe ein: **ein** kanonischer Eintrag pro `type`, geteilt von allen Modulen und Flächen. Es beantwortet genau eine Frage — *was folgt daraus, dass ein Item diesen `type` trägt?* — und beantwortet sie an genau einer Stelle.

Motivation aus der Praxis: dieselbe Frage wurde bisher an vier Stellen unabhängig beantwortet (Typ-Guards in `data-interface`, `ContentTypeConfig` je App-View, `ItemTypeBadge`, `getItemPreviewAdornments`). Die vier Listen kennen unterschiedliche Typ-Mengen — `project` und `resource` haben eine Preview-Darstellung, aber keinen Composer-Eintrag; `post` das Umgekehrte — und sind nachweislich auseinandergelaufen (Kalender-Detail mit abweichender Meta-Komponente; Task-Assignees nur im Kanban sichtbar).

#### Eintrag

Ein Registereintrag hält pro `type`:

| Feld | Zweck |
|---|---|
| `label`, `icon` | Anzeige des Typs (Badge, Composer-Auswahl, User-Filter) |
| `composerWidgets` | Widget-Set beim Erstellen (heute `ContentTypeConfig.defaultWidgets`) |
| `relations` | welche Kanten der Typ eingehen kann: `{ predicate, targetKind, widget? }` je Eintrag (`task` → `assignedTo`/person, `event` → `invited`/person und `takesPlaceAt`/place) |
| `preview` | knappe Darstellung für Karten und Zeilen (heute `getItemPreviewAdornments`) |
| `detail` | ausführliche Darstellung für das Detail-Panel |
| `footer` | typ-eigene Fußzeile zusätzlich zur Fläche (Task → Assignees) |

`preview`/`detail`/`footer` liefern Slot-Inhalte für die geteilte `ItemPreview`-Hülle — keine eigenen Karten. Karten-Markup bleibt Sache der Fläche.

#### Regeln

1. Das Register MUSS im Toolkit leben. Apps DÜRFEN Einträge ergänzen und app-spezifische Felder (Gruppen-Optionen, Submit-Labels) über registrierte Einträge legen; sie DÜRFEN NICHT die Darstellungs-Slots eines Core-Typs ersetzen, ohne es ausdrücklich zu tun (bewusstes Override, kein stilles Parallel-Register).
2. Jede Fläche, die ein Item darstellt, MUSS ihre typabhängigen Anteile aus dem Register beziehen. Flächen steuern ausschließlich **Dichte und Rahmen** bei (`compact`/`comfortable`, Karte/Panel/Zeile). Der Typ sagt *was*, die Fläche sagt *wieviel*.
3. Module DÜRFEN NICHT typabhängig rendern. Was ein Modul über ein Item weiß, das eine andere Fläche nicht wüsste, gehört entweder in den Typ (→ Register) oder in die Fläche (→ Dichte) — nie ins Modul.
4. Das Register DARF NICHT die Modul-Aktivierung tragen (kein `showIn`-Feld). Die bleibt feldbasiert, siehe „Die Rolle von `type`". Ebenso wenig trägt es Capabilities oder Rechte: ob eine Interaktion (Reagieren, Bearbeiten, Kommentieren) verfügbar ist, entscheiden Connector-Capability und Autorisierung — nicht der Typ. Reaktionen insbesondere sind nicht typabhängig.
5. Ein unbekannter `type` MUSS auf einen generischen Eintrag zurückfallen (Titel, Beschreibung, `base/v1`-Felder, neutrales Badge). Ein Item ohne Registereintrag darf nie unsichtbar oder kaputt sein — sonst bestraft das Register die Erweiterbarkeit, die es ermöglichen soll.
6. Ein neuer Typ wird durch **einen** Registereintrag eingeführt. Wenn dafür zusätzlich eine zweite Liste zu pflegen ist, ist das ein Fehler in dieser Spec.

#### Verhältnis zu den Schemas

Register und Vokabulare bleiben getrennt: Schemas (`@context`) definieren die **Feldstruktur**, das Register die **Intention** (`type`) und ihre Folgen für Composer und Darstellung. Ein Registereintrag SOLL benennen, welche Vokabulare der Composer beim Erstellen setzt (`event` → `base/v1` + `event/v1` + optional `place/v1`), damit Template und Schema nicht divergieren.

#### Verhältnis zu Relations

Das `relations`-Feld deklariert, **welche Kanten ein Typ eingehen kann** — nicht, was eine Kante bedeutet. Die Arbeitsteilung:

| Frage | Antwortet | Ort |
|---|---|---|
| Welche Relationen kann ein `task` haben? | Typ-Register | dieses Kapitel |
| Was bedeutet `assignedTo`? Symmetrisch? Sichtbarkeit? | Relation-Typ-Definition | [08-relation-records.md](08-relation-records.md), Regel 3 |
| Eingebettet oder eigenes Relation-Item? | Forward/Reverse-Regeln | [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md) |

Regeln:

1. Ein `relations`-Eintrag besteht aus `predicate`, `targetKind` (worauf die Kante zeigt: `person`, `place`, `item`, …) und optional `widget` (welches Composer-Widget die Kante bedient — `people` für Personen-Kanten; Kanten ohne Widget entstehen anderswo, z.B. per Karten-Pick oder Modul-Interaktion).
2. Das Typ-Register definiert **keine** Prädikat-Semantik. Gerichtetheit, Symmetrie und Sichtbarkeit eines Prädikats gehören in die Relation-Typ-Definition (08, Regel 3) — heute App-Konfiguration, Ziel ist die versionierte RelationTypeDefinition im Space. Ein Prädikat, das im Typ-Register auftaucht, MUSS dort definiert sein.
3. Ob eine Kante eingebettet (`item.relations[]`) oder als Relation-Record persistiert wird, entscheiden die Forward/Reverse-Regeln aus 04 — nicht das Typ-Register. Es deklariert die Möglichkeit, nicht den Mechanismus.
4. Personen-Kanten sind ein Fall unter vielen, kein Sonderfall: `peopleRelation` aus `ContentTypeConfig` geht in einem `relations`-Eintrag mit `targetKind: "person"`, `widget: "people"` auf.

#### Nicht-Ziele des Registers

- Modul-Aktivierung (feldbasiert, s.o.)
- Capabilities, Rechte, Interaktions-Verfügbarkeit
- Karten-/Panel-Markup (Sache der Flächen; das Register liefert Slot-Inhalte)
- Feld-Validierung (Sache der Schemas)

## Vocabulary-Registry

### Phase 1: zentral hosted (Standard für v0.1)

RLS-Vokabulare sind als JSON-LD und JSON-Schema unter `https://real-life-stack.org/vocab/{name}/v{version}` erreichbar:

- `https://real-life-stack.org/vocab/base/v1` — Basis-Item-Felder
- `https://real-life-stack.org/vocab/place/v1` — geografische Position
- `https://real-life-stack.org/vocab/event/v1` — Zeitpunkt + Dauer
- `https://real-life-stack.org/vocab/task/v1` — Status, Assignee
- `https://real-life-stack.org/vocab/person/v1` — Profil-Felder
- `https://real-life-stack.org/vocab/relation/v1` — eigenständige RelationRecords
- `https://real-life-stack.org/vocab/project/v1` — Projekt-Felder
- `https://real-life-stack.org/vocab/resource/v1` — Ressourcen-Felder

Jede Vocabulary-URL liefert:

1. Eine JSON-LD-Context-Datei `context.jsonld` — definiert Property-Namen und Datentypen
2. Eine JSON-Schema-Datei `schema.json` — erlaubt formale Validierung
3. Optional `examples/valid/*.json` — well-formed Beispiel-Items für Tooling und Tests

Connectoren und UI-Code dürfen Vocabularies cachen. Versionierung erfolgt über den `/v{n}/`-Pfad-Segment; nicht-rückwärtskompatible Änderungen erzwingen eine neue Major-Version.

### Phase 2: verteilte Registry (offen für spätere Migration)

Späterer Migrationspfad zu einer dezentralen Registry ist konzeptuell vorgesehen, aber außerhalb der v0.1-Spec:

- **Option B:** Vocabularies als Items in einem dedizierten Schema-Space (`type: "vocabulary"`)
- **Option C:** URN-basierte Identifier (`urn:rls:vocab:event:v1`) mit pluggable Resolver (zentral, P2P, content-addressed)

Bestehende `@context`-URLs behalten ihre Gültigkeit, nur die Auflösungs-Schicht ändert sich.

## Standardvokabulare (v0.1)

Diese Vokabulare gehören zum RLS-Core und werden von Standard-Modulen erwartet.

### `base/v1`

Wird **immer** als erstes `@context` geführt. Definiert:

- `id`, `createdAt`, `createdBy`, `data`
- `title` (String) — Anzeigetext, Default-Sortier-/Suchfeld
- `description` (String) — längere Beschreibung, optional Markdown

### `place/v1`

- `position` (GeoJSON-Geometry, mindestens `Point`)
- `address` (String, optional)
- `locationName` (String, optional)

Aktivierung durch Map-Modul: Items mit `data.position` werden auf der Map gerendert; konsequente `@context`-Nutzung würde `hasSchema: ['…/place/v1']` als äquivalenten Filter erlauben (siehe „Verhältnis zwischen Schema- und Feldfiltern" unten).

### `event/v1`

- `start` (ISO-8601-DateTime oder -Date) — Beginn
- `end` (ISO-8601-DateTime oder -Date, optional) — Ende
- `duration` (ISO-8601-Duration, optional; gegenseitig exklusiv mit `end`)
- `rrule` (RFC 5545 RRULE-String, optional)
- `meetingLink` (URL, optional) — siehe Discussion zur Frage „wohin gehört Online-Treffen"

Aktivierung durch Calendar-Modul.

### `task/v1`

- `status` (Enum: `open` | `in-progress` | `done` | `archived`)
- `assignee` (Identifier wie `createdBy`, optional; Einzelwert oder Array für mehrere)
- `dueAt` (ISO-8601-DateTime, optional)
- `priority` (Integer ≥ 0, optional)
- `order` (Integer ≥ 0, optional) — modul-spezifischer Sortier-Index, primär für Kanban innerhalb einer Status-Spalte. Andere Views (Feed, Calendar) ignorieren ihn. Kandidat für ein eigenes kanban-Vokabular in einer späteren Version.

Aktivierung durch Kanban-Modul.

### `person/v1`

- `displayName` (String)
- `avatarUrl` (String, optional)
- `bio` (String, optional)

Aktivierung durch Contacts/Profile-View.

Weitere Vokabulare können von Connectoren oder Modulen ergänzt werden.

## DataInterface-Erweiterungen

`ItemFilter` wird um ein schema-orientiertes Filter-Feld ergänzt:

```ts
interface ItemFilter {
  // ... bestehende Felder (type, hasField, createdBy, source, limit, offset)
  hasSchema?: string[]    // alle genannten @context-Vokabulare müssen aktiv sein
}
```

Bedeutung: Item ist nur Match, wenn sein `@context` jede der genannten URLs enthält.

Der analoge `hasTag`-Filter ist in [07-tags.md](07-tags.md) definiert.

`type` bleibt im Filter erhalten — für **User-Filter** (siehe „Die Rolle von `type`"), nicht als Struktur- oder Aktivierungsfilter.

### Verhältnis zwischen Schema- und Feldfiltern

Module aktivieren ein Item primär **feldbasiert** (das benötigte Feld ist in `data` vorhanden), weil das die Wahrheit über die Renderbarkeit ist. `hasSchema` ist ein **schnellerer Vorfilter** im Connector, der das gleiche Ergebnis liefert, wenn Vocabularies konsistent angewendet werden:

- Map zeigt Items mit `data.position` (= entspricht `hasSchema: ['…/place/v1']` falls Items das Vocab korrekt deklarieren)
- Calendar zeigt Items mit `data.start` (= entspricht `hasSchema: ['…/event/v1']`)
- Kanban zeigt Nicht-Relation-Items mit einem verwertbaren konfigurierten
  `data[statusField]`, dessen Wert einer konfigurierten Spalte entspricht;
  beim Standard `statusField: 'status'` entspricht das `hasSchema:
  ['…/task/v1']` für Task-Items. `archived` gehört nicht zu den Default-
  Spalten und erscheint daher ohne explizite Konfiguration nicht.

Da `@context`-Konsistenz aktuell nicht erzwingbar ist, **müssen Module den Feldfilter verwenden** und dürfen `hasSchema` nur als zusätzliche Optimierung anbieten.

> **Status:** `hasSchema` ist in `ItemFilter` als zukünftige Erweiterung dokumentiert, aber **noch nicht in `data-interface` implementiert**. Module verlassen sich derzeit ausschließlich auf `hasField` und clientseitiges Filtern.

## Modul-Konsequenzen

| Modul | Primärer Filter (heute) | Optimierung (sobald implementiert) | Was es zeigt |
|---|---|---|---|
| Map | `hasField: ['position']` | `hasSchema: ['…/place/v1']` | alles räumlich Darstellbare |
| Calendar | `hasField: ['start']` | `hasSchema: ['…/event/v1']` | alles zeitlich Darstellbares |
| Kanban | konfiguriertes `hasField: [statusField]` (Default: `['status']`) plus Spaltenwert-Prüfung | bei Default `hasSchema: ['…/task/v1']`; bei anderem Feld keine Task-Vokabular-Annahme | Nicht-Relation-Items mit verwertbarem konfiguriertem Spaltenfeld; `archived` nur bei expliziter Spalte |
| Feed | kein Filter / `hasSchema: ['…/base/v1']` | alles |
| Contacts | `hasSchema: ['…/person/v1']` | Personen-Profile |

Ein Item mit mehreren Schemas erscheint in jedem zuständigen Modul gleichzeitig. Jedes Modul rendert nur den Schema-Anteil, den es kennt.

## Migrationspfad von Utopia-Map

Bestehende Layer-basierte Daten werden so überführt:

1. **Layer-Strukturteil** → entsprechendes Schema im `@context` + `type` (Event-Layer → `event/v1`, `type: "event"`).
2. **Layer-Themenanteil** → Tag. Aus „Layer: Permakultur-Orte" wird ein Tag (`"permaculture"` oder `urn:rls:tag:permaculture`) + `place/v1`-Schema. Tag-Modell siehe [07-tags.md](07-tags.md).
3. **Item-Inhalt** → wird gegen die Schemas validiert; Felder, die in keinem aktiven Schema definiert sind, landen in `data` aber sind nicht offiziell spezifiziert.
4. **Layer-Profile** → Templates (Composer-Vorlagen, referenziert über `type`); die Feldstruktur liefern die Schemas.

Ein Migrations-ETL-Script erzeugt aus Directus-Items neue RLS-Items mit korrektem `@context` und Tags und schreibt sie in den Ziel-Space.

## Nicht-Ziele

Diese Spec definiert **nicht**:

- Vocabulary-Inhalte über die in „Standardvokabulare" genannten hinaus
- Validierungs-Runtime (gehört in `toolkit` oder einen Schema-Validator)
- Tag-Identität, Tag-Display, Tag-Hierarchie (siehe [07-tags.md](07-tags.md))
- Trust-Modell für Vokabular-Definitionen
- Rendering-Details der einzelnen Module (gehören in `modules/{name}.md`)
- Wie genau `@context` URLs aufgelöst werden, wenn die Registry offline ist (Resilience-Strategie ist Connector-Detail)
