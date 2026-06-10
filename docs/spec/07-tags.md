# Tags

**Status:** Normativer Entwurf v0.1

Tags sind die **orthogonale Kategorisierungs-Achse** zu Schemas. Während Schemas die Struktur eines Items beschreiben (siehe [06-schema-composition.md](06-schema-composition.md)), beschreiben Tags die **Themenzuordnung**.

Diese Spec definiert das Tag-Modell für RLS-Items in zwei Schichten:

1. **Einfache Tags** — frei vergebene Strings, lokal pro Space. Heutiger Stand in Kanban, Calendar, Map.
2. **Strukturierte Tags** — URN-identifizierte Tags mit optionaler Anreicherung (Display, Hierarchie, Cross-Space-Sync).

Beide Modi koexistieren; UI- und Connector-Code soll graduell aufsteigen können.

## Motivation

Das frühere Datenmodell in Utopia-Map hat **Layer** doppelt benutzt: einerseits als Strukturtyp (Event vs. Ort vs. Aufgabe), andererseits als Themenfilter (Permakultur vs. Bildung). Diese Doppelrolle hat User dazu gebracht, viele Layer anzulegen, um Themen abzubilden — obwohl die Strukturen gleich waren.

Schemas und `type` (siehe 06) lösen die Strukturseite. Tags lösen die Kategorisierungsseite — inklusive Farbe und Icon, die früher am Layer hingen (siehe Tag-Display unten). Mit beidem zusammen ist Layer als Konzept ablösbar.

Damit User Themen nicht wieder in Strukturtypen abbilden, müssen Tags in der UI gleichwertig sichtbar sein (Picker, Farben, Filter, Legende).

### Heutiger Code-Stand

Im Toolkit (Kanban-Card, Calendar-Event, Feed-Item) werden Tags heute als **plain string array** auf `item.data.tags` gelesen:

```ts
const tags = (item.data.tags as string[]) ?? []
```

Beispieldaten in Stories und demo-data:

```json
"data": {
  "title": "Beete vorbereiten",
  "status": "todo",
  "tags": ["garten", "einkauf"]
}
```

Display (Farbe, Lesbarkeit) wird durch eine Hash-Funktion aus dem String berechnet (`getTagColor(tag)`). Kein zentrales Tag-Verzeichnis, keine Hierarchie, keine Cross-Space-Konvention.

Dieses einfache Modell ist UX-pragmatisch und für viele Use-Cases ausreichend. Die Spec **erkennt es als gültig an** und definiert darüber hinaus, wie strukturierte Anreicherung optional draufgesetzt werden kann.

## Tag-Identität

### Einfache Tags (heute)

Ein Tag ist ein **String**, frei vergeben durch den User, gültig im Scope des Space. Heute lebt das Feld code-seitig auf `item.data.tags`:

```json
"data": {
  "tags": ["garten", "einkauf", "infrastruktur"]
}
```

Keine Eindeutigkeitsgarantie zwischen Spaces — `"infrastruktur"` in Space A ist nicht dasselbe Konzept wie `"infrastruktur"` in Space B. Das ist OK, solange Tags lokal verwendet werden.

### Strukturierte Tags

Sobald Tags Cross-Space, geteilt oder mit Display-Konsistenz verwendet werden, brauchen sie eine **stabile URN**:

- `urn:rls:tag:permaculture` — globaler Tag aus einem Standard-Namespace
- `urn:rls:tag:space:<space-id>:regional/leipzig` — Space-lokaler Tag mit expliziter Namespacing
- `urn:rls:tag:network:<network-id>:thema:bildung` — Netzwerk-Tag (RLNP)

Regeln:

1. Tag-URNs sind stabil und referenzierbar.
2. Strings ohne URN-Form gelten als Space-lokale einfache Tags.
3. Standard-Tags (`urn:rls:tag:...` ohne Space-/Network-Präfix) kommen aus einer kuratierten Tag-Library oder einem Cross-Space-Konsens.
4. Eine Migration String → URN ist später möglich, ohne dass bestehende Items kaputtgehen: ein String-Tag „permaculture" kann als „identisch mit `urn:rls:tag:permaculture`" registriert werden, wenn ein Tag-Item dafür entsteht.

## Tag-Display (Tag-Items als optionale Anreicherung)

Strukturierte Tags **können** als Items im Space leben (üblicherweise im verwendenden Space, oder in einem dedizierten Tag-Space):

```json
{
  "id": "uuid-tag-perma",
  "@context": [
    "https://real-life-stack.org/vocab/base/v1",
    "https://real-life-stack.org/vocab/tag/v1"
  ],
  "createdAt": "…",
  "createdBy": "anton@real-life.org",
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

### Display-Resolution

Wenn UI einen Tag anzeigt:

1. Tag-Item für die Identität (URN oder String) im Space gefunden → nutze dessen `name` / `color` / `icon`
2. Kein Tag-Item gefunden → Default-Display:
   - Anzeigename = der String / der lokale URN-Suffix
   - Farbe = Hash → Tailwind-Palette (wie heute in Kanban)
   - Kein Icon

Damit funktioniert UI sowohl für freie Strings als auch für strukturierte URN-Tags.

## Lokation des `tags`-Feldes — **offene Frage**

Aktuell **inkonsistent**:

| Wo | Lokation |
|---|---|
| `schemas/vocab/base/v1/schema.json` | `tags` als **top-level** Property |
| Toolkit-Code (Kanban, Calendar, Feed) | `item.data.tags` |
| Demo-Daten in `data-interface/data/items.json` | `item.data.tags` |

Beide Lokationen haben Argumente:

- **`data.tags`** (heute Code-Stand): Tags sind Teil der Item-Daten wie alle anderen Felder. Symmetrisch zu `data.title`, `data.start` etc. Einfach für freie Strings.
- **`tags` top-level**: Tags sind eine separate Achse der Item-Identität, nicht Teil des fachlichen Inhalts. Analog zu `relations`. Erleichtert Cross-Schema-Filter (`hasTag` greift unabhängig vom Vocabulary).

**Diese Spec legt die Entscheidung bewusst nicht fest.** Sobald entschieden, wird das `base/v1`-Schema und der Code (Toolkit + demo-data) angepasst.

## Hierarchie (optional)

Ein Tag-Item kann ein optionales `parent` haben, das auf eine andere Tag-URN zeigt. Daraus ergibt sich ein Baum (oder mehrere Wurzeln). UI-Eigenschaften:

- Filter „zeige `urn:rls:tag:landwirtschaft`" inkludiert implizit alle Kind-Tags (Permakultur, Biolandbau, …)
- Item-Tags werden üblicherweise als Leaf-Tags zugewiesen (spezifischster Tag)
- Hierarchie ist **optional** — ein flacher Tag-Pool ist gültig

Einfache String-Tags haben keine Hierarchie.

## Cross-Space-Tags

Spaces können Tags aus anderen Quellen importieren oder global definierte Tags benutzen. Ein importierter Tag bleibt unter seiner Original-URN erreichbar; das Tag-Item kann pro Space mit Display-Overrides (`color`, `icon`) ergänzt werden, die URN bleibt stabil.

Cross-Space-Discovery und Trust für Tag-Definitionen sind außerhalb des v0.1-Scope (siehe Nicht-Ziele).

## DataInterface

`ItemFilter` wird um einen tag-orientierten Filter erweitert:

```ts
interface ItemFilter {
  // ... bestehende Felder (type, hasField, createdBy, source, limit, offset)
  hasTag?: string[]   // alle genannten Tag-IDs (String oder URN) müssen am Item hängen
}
```

Bedeutung: Item ist nur Match, wenn die Tag-Sammlung des Items **jede** der genannten IDs enthält.

Hierarchische Tag-Auflösung (Eltern-Tag inkludiert Kinder) ist eine UI-Optimierung und kein DataInterface-Vertrag.

> **Status:** `hasTag` ist als zukünftige Erweiterung dokumentiert, aber **noch nicht in `data-interface` implementiert**. Module verlassen sich derzeit auf clientseitiges Filtern nach `data.tags`.

## Migrationspfad

Bestehende Code-Stellen (Toolkit, Stories, demo-data) nutzen einfache String-Tags in `data.tags`. Das bleibt gültig. Stufenweiser Ausbau:

1. **Heute** — String-Tags in `data.tags`, Display per Hash → Farbe.
2. **Erste Tag-Items** — Tag-Items mit `name`, `color`, `icon` für die Tags, die ein konsistentes Aussehen brauchen sollen. Strings im Item-Feld bleiben gleich; UI-Resolver findet das Tag-Item und nutzt dessen Display.
3. **URN-Konvention** — sobald ein Tag Cross-Space relevant wird, wird er auf eine URN-Form gehoben und als Tag-Item registriert.
4. **`hasTag`-Filter** — sobald Connector-seitige Tag-Filterung gebraucht wird, wird `ItemFilter.hasTag` in `data-interface` ergänzt.
5. **Hierarchie** — `parent`-Relation im Tag-Item wird genutzt, sobald Themenbäume entstehen.

## Nicht-Ziele

Diese Spec definiert nicht:

- Tag-Discovery zwischen Spaces (welche Tags existieren in welchem Space?),
- Trust-Modell für Tag-Definitionen (wer darf einen Tag mit `urn:rls:tag:...` registrieren?),
- Tag-Sync-Protokoll bei Cross-Space-Verwendung,
- Tag-Übersetzungen / Mehrsprachigkeit,
- UI-Bibliotheken für Tag-Picker oder Tag-Cloud,
- die konkrete Migrationsstrategie String → URN für bestehende Daten (kommt in einem späteren Migrations-PR).
