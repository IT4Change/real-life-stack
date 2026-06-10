# Schema-Composition

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt, wie ein RLS-Item seine Struktur und Bedeutung trägt — über **kompositorische `@context`-Vokabulare** statt über eine starre Type-Hierarchie.

Die orthogonale Achse **Kategorisierung** (welchem Thema gehört ein Item an) liegt in [07-tags.md](07-tags.md).

Diese Spec ergänzt [02-data-interface.md](02-data-interface.md) (Core Item) und [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md) (Items, Relations, Groups, Spaces).

Code-Referenz: `packages/data-interface/src/index.ts`

## Motivation

Die frühere Datenmodellierung (insbesondere in Utopia-Map) hat **Layer** in einer Mehrfachrolle benutzt. Ein Layer war gleichzeitig:

1. **Profil-Definition** — welche Felder ein Item hat (Event, Ort, Person, Aufgabe)
2. **Themenkategorie** — zu welchem Thema ein Item gehört (Permakultur, Bildung, regionale Karte)
3. **Visuelle Identität** — Marker-Farbe und Icon auf der Karte
4. **Sichtbarkeits-Toggle** — die Layer-Liste als Filter

Diese Mehrfachrolle führt zu Konflikten: User legen viele Layer an, um Themen abzubilden, brauchen aber denselben Strukturtyp; ein Item kann immer nur in einem Layer sein, obwohl es gleichzeitig Ort UND Event sein könnte.

RLS zerlegt den Layer in orthogonale Achsen:

| Layer-Funktion | RLS-Achse | Kardinalität |
|---|---|---|
| Profil-Definition | **`@context`-Schemas** (Struktur, diese Spec) + **`type`** als Composer-Vorlage und primäre Lesart (siehe unten) | Schemas: mehrere; `type`: einer |
| Themenkategorie | **Tags** — siehe [07-tags.md](07-tags.md) | mehrere |
| Visuelle Identität | **Tag-Display** (`color`/`icon` am Tag-Item, siehe 07) oder typ-getriebene Templates — Design-Entscheidung der App | — |
| Sichtbarkeits-Toggle | **Modul-Aktivierung über Feld-Präsenz** (siehe „Verhältnis zwischen Schema- und Feldfiltern") und Tag-Filter | folgt aus den Daten |

Die **thematische Klammer** ist darüber hinaus der **Space** selbst — verschiedene Communities haben verschiedene Spaces mit eigenen Schwerpunkten.

## Schema-Composition über `@context`

Ein RLS-Item trägt eine `@context`-Liste, die festlegt, welche Vokabulare seine Felder definieren. Das Pattern ist analog zu [W3C Verifiable Credentials](https://www.w3.org/TR/vc-data-model-2.0/), wie auch im WoT-Spec für Attestations verwendet.

### Item mit `@context`

```ts
interface Item {
  id: string
  '@context': string[]            // ordered list of vocabulary URLs
  type?: string | string[]         // primäre Lesart (UI-Hint), siehe „Die Rolle von `type`"
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
5. `type` ist ein optionaler UI-Hint, **kein struktureller Filter**. Modul-Aktivierung und Filterung laufen über Feld-Präsenz oder (zukünftig) `hasSchema`. Welche UI-Aufgaben `type` legitim trägt, definiert „Die Rolle von `type`: primäre Lesart" unten.

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

## Die Rolle von `type`: primäre Lesart

`type` ist kein struktureller Filter (Regel 5 oben) — aber es ist auch mehr als ein beliebiger Hint. Es trägt die **primäre Lesart** eines Items: die Antwort auf die Frage „was ist das für ein Ding?", die UI-Flächen für genau eine Sache brauchen, für die Komposition keine Antwort liefert. Trägt ein Item mehrere `type`-Werte, ist der erste die primäre Lesart.

Was darauf bauen **darf**:

- **Composer-Vorlagen**: Die Typ-Wahl beim Erstellen („Post", „Veranstaltung", „Aufgabe") bestimmt das Start-Widget-Set des Editors. Die Vorlage ist Startpunkt, kein Käfig — Felder bleiben zuschaltbar und entfernbar (so entsteht das Festival: Typ „Event" + zugeschaltetem Ort).
- **Rendering-Dispatch in aggregierenden Sichten**: Feed, Suche und Benachrichtigungen zeigen Items aller Lesarten und brauchen pro Item genau eine Kartendarstellung — `type` entscheidet das Template. Projektions-Module (Calendar, Map, Kanban) brauchen keinen Dispatch: sie rendern alle Items einheitlich als Termin, Marker oder Karte.
- **Benennung in Systemtexten**, wo weder Titel noch Modul-Kontext greifen.

Was **nicht** darauf bauen darf: Modul-Aktivierung, Filterung, Validierung — das ist Sache der Felder und Schemas.

### Lebenszyklus: Typ überdauert, Kontext folgt

1. **Erstellen**: `type` wird aus der User-Intention gesetzt (Composer-Vorlage). `@context` wird aus Typ und tatsächlich befüllten Feldern abgeleitet.
2. **Bearbeiten**: `type` ändert sich **nie automatisch**. `@context` folgt dagegen den tatsächlichen Feldern — wer beim Event das Datum entfernt, verliert `event/v1` aus dem `@context` (sonst wäre das Item dauerhaft schema-invalide), behält aber `type: "event"`. Das Item ist dann eine **ruhende Veranstaltung**: Es verschwindet aus dem Calendar (Feld weg), bleibt auf der Map (Feld da), und sein Template zeigt den unterminierten Zustand an („Termin folgt") statt zu brechen.
3. **Umwandeln**: `type` darf geändert werden — aber nur als **bewusste User-Handlung** (Aufgabe → Quest, Event → Ort). Die UI darf beim Umwandeln Felder der neuen Lesart nachfordern. Ein stiller Typwandel als Nebenwirkung einer Feldänderung ist unzulässig.

### Konstituierende und zugeschaltete Felder

Aus Vorlage und Komposition ergeben sich zwei Klassen von Feldern mit unterschiedlichem Gewicht beim Entfernen:

- **Zugeschaltetes Feld** (z.B. der Ort am Festival): Entfernen ist trivial. Die betroffene Modul-Sicht verschwindet; die UI nennt die Konsequenz im Moment der Handlung („erscheint nicht mehr auf der Karte").
- **Konstituierendes Feld** (Pflichtfeld der primären Lesart, z.B. `start` bei `type: "event"`): Entfernen heißt, dass das Item die Struktur seiner eigenen Lesart verlässt. Die UI muss die Konsequenz zeigen und die Wahl anbieten: Feld entfernen und Lesart behalten (ruhender Zustand) **oder** explizit umwandeln.

Dieselbe Transparenz gilt in Gegenrichtung: Wer ein Feld zuschaltet, das ein Modul aktiviert, bekommt das angesagt („wird jetzt auf der Karte angezeigt"). So wird die Komposition für User erlebbar statt verstecktes Systemverhalten.

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

Bestehende Layer-basierte Daten werden entlang der Achsen-Tabelle aus der Motivation überführt:

1. **Layer-Strukturteil** → entsprechendes Schema im `@context` (Event-Layer → `event/v1`, Place-Layer → `place/v1`) und passender `type`-Wert als primäre Lesart.
2. **Layer-Themenanteil** → Tag. Aus „Layer: Permakultur-Orte" wird ein Tag (`"permaculture"` oder `urn:rls:tag:permaculture`) + `place/v1`-Schema. Tag-Modell siehe [07-tags.md](07-tags.md).
3. **Layer-Darstellung** (Marker-Farbe, Icon) → Display-Felder eines Tag-Items (`color`/`icon`, siehe 07), wenn der Layer thematisch war; die alte Layer-Legende der Karte wird zur Tag-Legende.
4. **Item-Inhalt** → wird gegen die Schemas validiert; Felder, die in keinem aktiven Schema definiert sind, landen in `data` aber sind nicht offiziell spezifiziert.
5. **Layer-Profil-Definitionen** → Composer-Vorlagen (`type` wählt das Start-Widget-Set; die Schemas definieren die Feldstruktur). Die Vorlage ist Startpunkt, kein Käfig — anders als der Layer erzwingt sie die Feldmenge nicht dauerhaft.

Ein Migrations-ETL-Script erzeugt aus Directus-Items neue RLS-Items mit korrektem `@context`, `type` und Tags und schreibt sie in den Ziel-Space.

## Nicht-Ziele

Diese Spec definiert **nicht**:

- Vocabulary-Inhalte über die in „Standardvokabulare" genannten hinaus
- Validierungs-Runtime (gehört in `toolkit` oder einen Schema-Validator)
- Tag-Identität, Tag-Display, Tag-Hierarchie (siehe [07-tags.md](07-tags.md))
- Trust-Modell für Vokabular-Definitionen
- Rendering-Details der einzelnen Module (gehören in `modules/{name}.md`)
- Wie genau `@context` URLs aufgelöst werden, wenn die Registry offline ist (Resilience-Strategie ist Connector-Detail)
