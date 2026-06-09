# Schema-Composition and Tags

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt, wie ein RLS-Item seine Struktur und Bedeutung trägt — über **kompositorische `@context`-Vokabulare** statt über eine starre Type-Hierarchie — und wie **Tags** als orthogonale Kategorisierungs-Achse organisiert sind.

Sie ergänzt [02-data-interface.md](02-data-interface.md) (Core Item) und [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md) (Items, Relations, Groups, Spaces).

Code-Referenz: `packages/data-interface/src/index.ts`

## Motivation

Die frühere Datenmodellierung (insbesondere in Utopia-Map) hat **Layer** in einer Doppelrolle benutzt:

1. Struktur (welche Felder hat ein Item: Event, Ort, Person, Aufgabe)
2. Kategorisierung (zu welchem Thema gehört ein Item: Permakultur, Bildung, regionale Karte)

Diese Doppelrolle führt zu Konflikten: User legen viele Layer an, um Themen abzubilden, brauchen aber denselben Strukturtyp; ein Item kann immer nur in einem Layer sein, obwohl es gleichzeitig Ort UND Event sein könnte.

RLS löst die beiden Aspekte voneinander:

- **Struktur** ergibt sich aus den **`@context`-Schemas**, die ein Item komponiert (mehrere parallel möglich)
- **Kategorisierung** läuft über **Tags** (frei, optional in einem Kategoriebaum strukturierbar)
- **Thematische Klammer** ist der **Space** selbst — verschiedene Communities haben verschiedene Spaces mit eigenen Schwerpunkten

## Schema-Composition über `@context`

Ein RLS-Item trägt eine `@context`-Liste, die festlegt, welche Vokabulare seine Felder definieren. Das Pattern ist analog zu [W3C Verifiable Credentials](https://www.w3.org/TR/vc-data-model-2.0/), wie auch im WoT-Spec für Attestations verwendet.

### Item mit `@context`

```ts
interface Item {
  id: string
  '@context': string[]            // ordered list of vocabulary URLs
  type?: string[]                  // optional UI-hint, deskriptiv
  createdAt: string
  createdBy: string
  data: Record<string, unknown>
  tags?: string[]                  // tag URNs
  relations?: Relation[]
}
```

Regeln:

1. `@context[0]` ist immer `https://real-life-stack.org/vocab/base/v1` — definiert die RLS-Item-Basis-Felder (`id`, `createdAt`, `createdBy`, `data`, ...).
2. Weitere Einträge erweitern das Vokabular und damit die in `data` zulässigen Felder.
3. Die Reihenfolge wirkt auf Property-Resolution: spätere `@context`-Einträge können frühere Definitionen überschreiben (last-wins, gleiches Verhalten wie JSON-LD).
4. Semantisch gleiche Properties aus verschiedenen Vokabularen sollen denselben Namen tragen (z.B. `start` für Beginn-Zeitpunkt, egal ob Event oder Task) — Aliasing kann im Vocabulary-Context definiert werden.
5. `type` ist ein optionaler UI-Hint, **kein struktureller Filter**. UI-Code soll nicht über `type` verzweigen, sondern über Schema-Präsenz im `@context`.

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

## Vocabulary-Registry

### Phase 1: zentral hosted (Standard für v0.1)

RLS-Vokabulare sind als JSON-LD und JSON-Schema unter `https://real-life-stack.org/vocab/{name}/v{version}` erreichbar:

- `https://real-life-stack.org/vocab/base/v1` — Basis-Item-Felder
- `https://real-life-stack.org/vocab/place/v1` — geografische Position
- `https://real-life-stack.org/vocab/event/v1` — Zeitpunkt + Dauer
- `https://real-life-stack.org/vocab/task/v1` — Status, Assignee
- `https://real-life-stack.org/vocab/person/v1` — Profil-Felder

Jede Vocabulary-URL liefert:

1. Eine JSON-LD-Context-Datei (`*.jsonld`) — definiert Property-Namen und Datentypen
2. Eine JSON-Schema-Datei (`*.schema.json`) — erlaubt formale Validierung

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

Aktivierung durch Map-Modul: Items mit `@context` enthält `place/v1` werden auf der Map gerendert.

### `event/v1`

- `start` (ISO-8601-DateTime) — Beginn
- `end` (ISO-8601-DateTime, optional) — Ende
- `duration` (ISO-8601-Duration, optional)
- `recurrence` (ICAL-RRULE-String, optional)

Aktivierung durch Calendar-Modul.

### `task/v1`

- `status` (Enum: `open` | `in-progress` | `done` | `archived`)
- `assignee` (DID-String oder Item-Ref, optional)
- `dueAt` (ISO-8601-DateTime, optional)
- `priority` (Integer, optional)

Aktivierung durch Kanban-Modul.

### `person/v1`

- `displayName` (String)
- `avatarUrl` (String, optional)
- `bio` (String, optional)

Aktivierung durch Contacts/Profile-View.

Weitere Vokabulare können von Connectoren oder Modulen ergänzt werden.

## Tags

Tags sind die orthogonale Kategorisierungs-Achse zu Schemas. Während Schemas **Struktur** liefern, liefern Tags **Themenzuordnung**.

### Identität

Tags sind URNs:

- `urn:rls:tag:permaculture` — globaler Tag aus einem Standard-Namespace
- `urn:rls:tag:space:<space-id>:regional/leipzig` — Space-lokaler Tag
- `urn:rls:tag:network:<network-id>:thema:bildung` — Netzwerk-Tag (RLNP)

Regeln:

1. Tag-URNs sind stabil und referenzierbar.
2. Tags ohne Namespace gelten als Space-lokal.
3. Standard-Tags (`urn:rls:tag:...` ohne Space-/Network-Präfix) kommen aus der Vocabulary-Registry oder einer kuratierten Tag-Library.

### Tag als Item

Tags sind selbst Items, in einem Space (üblicherweise dem Space, in dem sie verwendet werden, oder einem dedizierten Tag-Space):

```json
{
  "id": "uuid-tag-perma",
  "@context": [
    "https://real-life-stack.org/vocab/base/v1",
    "https://real-life-stack.org/vocab/tag/v1"
  ],
  "createdAt": "…",
  "createdBy": "did:key:…",
  "data": {
    "urn": "urn:rls:tag:permaculture",
    "name": "Permakultur",
    "description": "Themen rund um regenerative Landwirtschaft …",
    "color": "#9bc53d",
    "icon": "🌱",
    "parent": "urn:rls:tag:landwirtschaft"
  }
}
```

`tag/v1` definiert die Tag-spezifischen Felder. Tags werden wie alle Items im Space verwaltet — Mitglieder können sie vorschlagen, Space-Admins entscheiden.

### Hierarchie (optional)

Ein Tag kann ein optionales `parent` haben, das auf eine andere Tag-URN zeigt. Daraus ergibt sich ein Baum (oder mehrere Wurzeln). UI-Eigenschaften:

- Filter „zeige `urn:rls:tag:landwirtschaft`" inkludiert implizit alle Kind-Tags (Permakultur, Biolandbau, …)
- Item-Tags werden üblicherweise als Leaf-Tags zugewiesen (spezifischster Tag)
- Hierarchie ist **optional** — ein flacher Tag-Pool ist gültig

### Cross-Space-Tags

Spaces können Tags aus anderen Quellen importieren oder global definierte Tags benutzen. Ein importierter Tag bleibt unter seiner Original-URN erreichbar; das Tag-Item kann pro Space mit Display-Overrides (`color`, `icon`) ergänzt werden, die URN bleibt stabil.

## DataInterface-Erweiterungen

`ItemFilter` wird um schema- und tag-orientierte Felder ergänzt:

```ts
interface ItemFilter {
  // ... bestehende Felder (type, hasField, createdBy, source, limit, offset)
  hasSchema?: string[]    // alle genannten @context-Vokabulare müssen aktiv sein
  hasTag?: string[]       // alle genannten Tag-URNs müssen am Item hängen
}
```

Mindestbedeutung:

| Feld | Bedeutung |
|---|---|
| `hasSchema` | Item ist nur Match, wenn sein `@context` jede der genannten URLs enthält |
| `hasTag` | Item ist nur Match, wenn sein `tags`-Array jede der genannten URNs enthält. Hierarchische Tag-Auflösung (Eltern-Tag inkludiert Kinder) ist eine UI-Optimierung und kein DataInterface-Vertrag |

`type` bleibt im Filter erhalten, ist aber **kein primärer Strukturfilter** mehr. UI-Code soll sich auf `hasSchema` stützen.

## Modul-Konsequenzen

| Modul | Aktivierungs-Filter | Was es zeigt |
|---|---|---|
| Map | `hasSchema: ['…/place/v1']` | alles räumlich Darstellbare |
| Calendar | `hasSchema: ['…/event/v1']` | alles zeitlich Darstellbares |
| Kanban | `hasSchema: ['…/task/v1']` | alles als Aufgabe Darstellbares |
| Feed | kein Filter / `hasSchema: ['…/base/v1']` | alles |
| Contacts | `hasSchema: ['…/person/v1']` | Personen-Profile |

Ein Item mit mehreren Schemas erscheint in jedem zuständigen Modul gleichzeitig. Jedes Modul rendert nur den Schema-Anteil, den es kennt.

## Migrationspfad von Utopia-Map

Bestehende Layer-basierte Daten werden so überführt:

1. **Layer-Strukturteil** → entsprechendes Schema im `@context` (Event-Layer → `event/v1`, Place-Layer → `place/v1`).
2. **Layer-Themenanteil** → Tag-URN. Aus „Layer: Permakultur-Orte" wird `urn:rls:tag:permaculture` + `place/v1`-Schema. Layer-Name bleibt als Tag-Name erhalten.
3. **Item-Inhalt** → wird gegen die Schemas validiert; Felder, die in keinem aktiven Schema definiert sind, landen in `data` aber sind nicht offiziell spezifiziert.
4. **Layer-Templates** entfallen — die Schemas selbst sind die Templates.

Ein Migrations-ETL-Script erzeugt aus Directus-Items neue RLS-Items mit korrektem `@context` und Tags und schreibt sie in den Ziel-Space.

## Nicht-Ziele

Diese Spec definiert **nicht**:

- Vocabulary-Inhalte über die in „Standardvokabulare" genannten hinaus
- Validierungs-Runtime (gehört in `toolkit` oder einen Schema-Validator)
- Tag-Discovery oder Cross-Space-Tag-Sync (gehört in Sync-/Indexing-Specs)
- Trust-Modell für Vokabular-Definitionen
- Rendering-Details der einzelnen Module (gehören in `modules/{name}.md`)
- Wie genau `@context` URLs aufgelöst werden, wenn die Registry offline ist (Resilience-Strategie ist Connector-Detail)
