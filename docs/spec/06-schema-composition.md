# Schema-Composition

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt, wie ein RLS-Item seine Struktur und Bedeutung trägt — über **kompositorische `@context`-Vokabulare** statt über eine starre Type-Hierarchie.

Die orthogonale Achse **Kategorisierung** (welchem Thema gehört ein Item an) liegt in [07-tags.md](07-tags.md).

Diese Spec ergänzt [02-data-interface.md](02-data-interface.md) (Core Item) und [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md) (Items, Relations, Groups, Spaces).

Code-Referenz: `packages/data-interface/src/index.ts`

## Motivation

Die frühere Datenmodellierung (insbesondere in Utopia-Map) hat **Layer** in einer Mehrfachrolle benutzt: als Strukturtyp, als Themenkategorie, als visuelle Identität (Marker-Farbe, Icon) und als Sichtbarkeits-Filter. Das führt zu Konflikten: User legen viele Layer an, um Themen abzubilden, brauchen aber denselben Strukturtyp; ein Item kann immer nur in einem Layer sein, obwohl es gleichzeitig Ort UND Event sein könnte.

RLS trennt diese Aspekte:

- **Struktur** ergibt sich aus den **`@context`-Schemas**, die ein Item komponiert (mehrere parallel möglich) — Gegenstand dieser Spec.
- **Erstellung und Darstellung** definieren **Templates** — genau eines pro Item, referenziert über `type`, siehe „Templates".
- **Kategorisierung** läuft über **Tags**, inklusive Farbe und Icon — siehe [07-tags.md](07-tags.md).
- **Sichtbarkeit** in Modulen folgt aus den Feldern — siehe „Verhältnis zwischen Schema- und Feldfiltern".
- **Thematische Klammer** ist der **Space** selbst — verschiedene Communities haben verschiedene Spaces mit eigenen Schwerpunkten.

## Schema-Composition über `@context`

Ein RLS-Item trägt eine `@context`-Liste, die festlegt, welche Vokabulare seine Felder definieren. Das Pattern ist analog zu [W3C Verifiable Credentials](https://www.w3.org/TR/vc-data-model-2.0/), wie auch im WoT-Spec für Attestations verwendet.

### Item mit `@context`

```ts
interface Item {
  id: string
  '@context': string[]            // ordered list of vocabulary URLs
  type?: string | string[]         // Template-Referenz, siehe „Templates"
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
5. `type` referenziert das Template eines Items (siehe „Templates" unten) und ist **kein struktureller Filter**. Modul-Aktivierung und Filterung laufen über Feld-Präsenz oder (zukünftig) `hasSchema`.

### Beispiel: Workshop in der Markthalle

```json
{
  "id": "uuid-abc",
  "@context": [
    "https://real-life-stack.org/vocab/base/v1",
    "https://real-life-stack.org/vocab/event/v1",
    "https://real-life-stack.org/vocab/place/v1"
  ],
  "type": ["Event"],
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

## Templates

Ein **Template** definiert, wie ein Item erstellt und dargestellt wird: Name, Icon, das Start-Widget-Set im Composer und die kontextuelle Beschriftung — dasselbe `title`-Feld heißt im Projekt-Template „Name". Templates binden Widgets auch an unterschiedliche Semantik: das Personen-Widget erfasst im Task-Template eine Zuweisung (`assignedTo`-Relation), im Event-Template Teilnehmer. Das Feld `type` ist die **Template-Referenz** des Items; bei mehreren Werten zählt der erste.

Templates und Schemas sind orthogonal: Schemas beschreiben, **welche Felder** ein Item hat — Templates, **als was** es erstellt und gezeigt wird. Zwei Templates können dieselbe Struktur nutzen („Projekt" und „Anzeige" unterscheiden sich nur in Darstellung und Ansprache), und ein Item kann Felder tragen, die sein Template nicht vorsah (etwa ein zugeschalteter Ort am Event).

Regeln:

1. Die Template-Referenz wird beim Erstellen gesetzt und ändert sich nicht von selbst. Ein Template-Wechsel (z.B. Aufgabe → Quest) ist eine eigene, bewusste User-Aktion; die UI darf dabei fehlende Pflichtfelder des neuen Templates nachfordern.
2. Auf das Template bauen: der Composer (Start-Widget-Set; weitere Felder bleiben zuschaltbar), die Item-Darstellung in Feed und Suche, Icon und Benennung in Systemtexten.
3. Modul-Aktivierung, Filterung und Validierung laufen nie über das Template (Regel 5 oben). Calendar, Map und Kanban rendern alle Items einheitlich und brauchen keine Template-Wahl.
4. Beim Bearbeiten folgt `@context` den tatsächlichen Feldern, die Template-Referenz bleibt. Ein Event, dessen `start` entfernt wird, verliert `event/v1`, behält `type: "event"`, verschwindet aus dem Calendar und bleibt — sofern `position` vorhanden — auf der Map; das Event-Template zeigt es als Veranstaltung ohne Termin.
5. Feldänderungen, die Modul-Sichtbarkeit ändern, zeigt die UI im Moment der Änderung an („erscheint nicht mehr im Calendar"). Beim Entfernen eines Pflichtfelds des eigenen Templates bietet sie den Template-Wechsel als Alternative an.

Templates sind heute im App-Code definiert (`ContentTypeConfig` im Toolkit: `id`, `label`, `icon`, `defaultWidgets`, `widgetLabels`, …). Die Definition ist serialisierbar gehalten; space-konfigurierbare Templates — als Items, analog zu Tag-Items in [07-tags.md](07-tags.md) — sind ein möglicher späterer Schritt außerhalb dieser Spec-Version.

## Vocabulary-Registry

### Phase 1: zentral hosted (Standard für v0.1)

RLS-Vokabulare sind als JSON-LD und JSON-Schema unter `https://real-life-stack.org/vocab/{name}/v{version}` erreichbar:

- `https://real-life-stack.org/vocab/base/v1` — Basis-Item-Felder
- `https://real-life-stack.org/vocab/place/v1` — geografische Position
- `https://real-life-stack.org/vocab/event/v1` — Zeitpunkt + Dauer
- `https://real-life-stack.org/vocab/task/v1` — Status, Assignee
- `https://real-life-stack.org/vocab/person/v1` — Profil-Felder

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

`type` bleibt im Filter erhalten, ist aber **kein primärer Strukturfilter** mehr.

### Verhältnis zwischen Schema- und Feldfiltern

Module aktivieren ein Item primär **feldbasiert** (das benötigte Feld ist in `data` vorhanden), weil das die Wahrheit über die Renderbarkeit ist. `hasSchema` ist ein **schnellerer Vorfilter** im Connector, der das gleiche Ergebnis liefert, wenn Vocabularies konsistent angewendet werden:

- Map zeigt Items mit `data.position` (= entspricht `hasSchema: ['…/place/v1']` falls Items das Vocab korrekt deklarieren)
- Calendar zeigt Items mit `data.start` (= entspricht `hasSchema: ['…/event/v1']`)
- Kanban zeigt Items mit `data.status` (= entspricht `hasSchema: ['…/task/v1']`)

Da `@context`-Konsistenz aktuell nicht erzwingbar ist, **müssen Module den Feldfilter verwenden** und dürfen `hasSchema` nur als zusätzliche Optimierung anbieten.

> **Status:** `hasSchema` ist in `ItemFilter` als zukünftige Erweiterung dokumentiert, aber **noch nicht in `data-interface` implementiert**. Module verlassen sich derzeit ausschließlich auf `hasField` und clientseitiges Filtern.

## Modul-Konsequenzen

| Modul | Primärer Filter (heute) | Optimierung (sobald implementiert) | Was es zeigt |
|---|---|---|---|
| Map | `hasField: ['position']` | `hasSchema: ['…/place/v1']` | alles räumlich Darstellbare |
| Calendar | `hasField: ['start']` | `hasSchema: ['…/event/v1']` | alles zeitlich Darstellbares |
| Kanban | `hasField: ['status']` | `hasSchema: ['…/task/v1']` | alles als Aufgabe Darstellbares |
| Feed | kein Filter / `hasSchema: ['…/base/v1']` | alles |
| Contacts | `hasSchema: ['…/person/v1']` | Personen-Profile |

Ein Item mit mehreren Schemas erscheint in jedem zuständigen Modul gleichzeitig. Jedes Modul rendert nur den Schema-Anteil, den es kennt.

## Migrationspfad von Utopia-Map

Bestehende Layer-basierte Daten werden so überführt:

1. **Layer-Strukturteil** → entsprechendes Schema im `@context` + `type` (Event-Layer → `event/v1`, `type: "event"`).
2. **Layer-Themenanteil** → Tag. Aus „Layer: Permakultur-Orte" wird ein Tag (`"permaculture"` oder `urn:rls:tag:permaculture`) + `place/v1`-Schema; Marker-Farbe und Icon des Layers werden Tag-Display. Siehe [07-tags.md](07-tags.md).
3. **Item-Inhalt** → wird gegen die Schemas validiert; Felder, die in keinem aktiven Schema definiert sind, landen in `data` aber sind nicht offiziell spezifiziert.
4. **Layer-Profile** → Templates (referenziert über `type`); die Feldstruktur definieren die Schemas.

Ein Migrations-ETL-Script erzeugt aus Directus-Items neue RLS-Items mit korrektem `@context`, `type` und Tags und schreibt sie in den Ziel-Space.

## Nicht-Ziele

Diese Spec definiert **nicht**:

- Vocabulary-Inhalte über die in „Standardvokabulare" genannten hinaus
- Validierungs-Runtime (gehört in `toolkit` oder einen Schema-Validator)
- Tag-Identität, Tag-Display, Tag-Hierarchie (siehe [07-tags.md](07-tags.md))
- Trust-Modell für Vokabular-Definitionen
- Rendering-Details der einzelnen Module (gehören in `modules/{name}.md`)
- Wie genau `@context` URLs aufgelöst werden, wenn die Registry offline ist (Resilience-Strategie ist Connector-Detail)
