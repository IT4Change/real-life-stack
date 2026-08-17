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

**Begriff:** Ein **Core-Typ** ist ein Typ, dessen Register-Einträge RLS selbst mitliefert — in v0.1: `post`, `event`, `place`, `task`, `person`, `project`, `resource`. Systemtypen ohne eigenständige Karte (`reaction`, `comment`, `relation`) brauchen keinen Registereintrag; sie erscheinen ausschließlich über ihre Flächen (ReactionBar, Kommentarliste, Graph).

#### Zwei Schichten, eine Identitätsquelle

Das Register besteht aus zwei Schichten entlang der Paketgrenze. Die Abhängigkeitsrichtung des Stacks (`toolkit` → `data-interface`, nie umgekehrt) erzwingt das; zugleich trennt es die zwei Änderungsgründe sauber — Datensemantik und Darstellung ändern sich unabhängig voneinander:

| Schicht | Paket | hält | ändert sich wenn |
|---|---|---|---|
| **Typ-Manifest** | `data-interface` (UI-frei) | `id`, Vokabular-Bindung, `relations` | die Datensemantik eines Typs sich ändert |
| **Darstellungs-Register** | `toolkit` | `label`, `icon`, `composerWidgets`, `preview`/`detail`/`footer` | die Darstellung sich ändert |

Das Manifest ist die **einzige Quelle für Typ-Identität**: die Typ-Guards und `KnownItemType` in `data-interface` werden aus ihm abgeleitet, nicht daneben gepflegt. Das Darstellungs-Register hängt seine Einträge an Manifest-Ids an und DARF KEINE Typen einführen. Konsumenten lesen nur ihre Schicht: ein Connector oder Validator braucht das Manifest und zieht keine React-Abhängigkeit; eine Fläche liest die Slots.

#### Eintrag

| Feld | Schicht | Zweck |
|---|---|---|
| `id` | Manifest | stabile Typ-Identität; zugleich der Schlüssel für Lokalisierung |
| Vokabular-Bindung | Manifest | welche `@context`-Schemas der Composer beim Erstellen setzt |
| `relations` | Manifest | welche Kanten der Typ eingehen kann: `{ predicate, itemRole, otherKind }`, keyed by (`predicate`, `itemRole`), siehe „Verhältnis zu Relations" |
| `label` | Darstellung | Anzeigename (Badge, Composer-Auswahl, User-Filter); Anzeigename und Lokalisierung sind Darstellungsgründe, darum nicht im Manifest |
| `icon` | Darstellung | Typ-Icon |
| `composerWidgets` | Darstellung | Widget-Set beim Erstellen (heute `ContentTypeConfig.defaultWidgets`) |
| `relationWidgets` | Darstellung | welches Composer-Widget eine deklarierte Kante bedient, keyed by (`predicate`, `itemRole`) — Widgets sind UI und gehören darum nicht ins Manifest |
| `preview` | Darstellung | knappe Darstellung für Karten und Zeilen (heute `getItemPreviewAdornments`) |
| `detail` | Darstellung | ausführliche Darstellung für das Detail-Panel |
| `footer` | Darstellung | typ-eigene Fußzeile zusätzlich zur Fläche (Task → Assignees) |

`preview`/`detail`/`footer` liefern Slot-Inhalte für die geteilte `ItemPreview`-Hülle — keine eigenen Karten. Karten-Markup bleibt Sache der Fläche.

#### Regeln

1. Das Typ-Manifest MUSS in `data-interface` leben und UI-frei sein; das Darstellungs-Register MUSS im Toolkit leben und ist über die Typ-Id an das Manifest gebunden. Apps DÜRFEN Einträge ergänzen und app-spezifische Felder (Gruppen-Optionen, Submit-Labels) über registrierte Einträge legen. Das Ersetzen bestehender Einträge ist in v0.1 nicht vorgesehen — siehe „Erweiterung und Merge".
2. Jede Fläche, die ein Item darstellt, MUSS ihre typabhängigen Anteile aus dem Register beziehen. Flächen steuern **Dichte und Rahmen** bei (`compact`/`comfortable`, Karte/Panel/Zeile). Der Typ sagt *was*, die Fläche sagt *wieviel*.
3. Module DÜRFEN KEINE eigene Typ-Verzweigung besitzen: kein `if (type === …)` in Modul-Code, keine typabhängige Komponentenwahl am Register vorbei. Modul-eigene **Mechanik** (Drag im Kanban, Pins auf der Karte, Zeitraster im Kalender) bleibt Modulsache — sie verzweigt über Felder und Capabilities, nie über `type`.
4. Das Register DARF NICHT die Modul-Aktivierung tragen (kein `showIn`-Feld). Die bleibt feldbasiert, siehe „Die Rolle von `type`". Ebenso wenig trägt es Capabilities oder Rechte: ob eine Interaktion (Reagieren, Bearbeiten, Kommentieren) verfügbar ist, entscheiden Connector-Capability und Autorisierung — nicht der Typ. Reaktionen insbesondere sind nicht typabhängig.
5. Ein unbekannter `type` — und ebenso ein Manifest-Eintrag ohne Darstellungs-Eintrag — MUSS auf einen generischen Eintrag zurückfallen (Titel, Beschreibung, `base/v1`-Felder, neutrales Badge). Jeder Registereintrag MUSS auf jeder Fläche darstellbar sein; ein Eintrag, der nur auf einer Fläche funktioniert, ist ungültig. Ein Item ohne Registereintrag darf nie unsichtbar oder kaputt sein — sonst bestraft das Register die Erweiterbarkeit, die es ermöglichen soll.
6. Ein neuer Typ wird durch genau **einen Manifest-Eintrag** eingeführt. Andere Schichten hängen Einträge an dessen Id an; fehlt einer, greift Regel 5 — sichtbar generisch, nie kaputt. Wenn die Einführung eines Typs die Pflege einer zweiten **unabhängigen** Liste erfordert (eine, die Typen einführen oder widersprechen kann), ist das ein Fehler in dieser Spec.

#### Erweiterung und Merge

Register-Einträge werden in deterministischer Reihenfolge zusammengesetzt: **Core → App → Space.** Eine Schicht liefert Beiträge in genau einer von zwei Formen:

1. **Typdefinition** — führt eine neue `id` ein. Eine bereits vergebene `id` ist ein **Konflikt** und MUSS abgelehnt werden.
2. **Erweiterungsfragment** — adressiert eine vorhandene `id` und ergänzt sie additiv. Mengen-Felder (Kanten keyed by (`predicate`, `itemRole`), Vokabular-Bindung als Menge) werden vereinigt; neue Keys/Member sind erlaubt, das Entfernen oder Umdefinieren vorhandener ist ein Konflikt. Skalare Felder (`label`, `icon`, Slots) DARF ein Fragment nur setzen, wenn die Basis sie nicht setzt — sonst Konflikt.
3. **Override** ist in v0.1 nicht vorgesehen: Konflikte werden abgelehnt, nicht aufgelöst. Eine spätere Version KANN eine explizite Override-Operation mit Ziel-Key und Prioritätsregel einführen; bis dahin gibt es kein Shadowing, still oder ausdrücklich.

Die zusammengesetzte Sicht ist pro Space deterministisch: gleiche Schichten, gleiches Ergebnis, unabhängig von Lade- oder Registrierungsreihenfolge — Vereinigung und Konfliktprüfung sind ordnungsunabhängig definiert.

#### Verhältnis zu den Schemas

Register und Vokabulare bleiben getrennt: Schemas (`@context`) definieren die **Feldstruktur**, das Register die **Intention** (`type`) und ihre Folgen für Composer und Darstellung. Die Vokabular-Bindung im Manifest benennt, welche Schemas der Composer beim Erstellen setzt (`event` → `base/v1` + `event/v1` + optional `place/v1`), damit Template und Schema nicht divergieren.

#### Verhältnis zu Relations

Das `relations`-Feld deklariert, **welche Kanten ein Typ eingehen kann** — als Composer-/UI-Affordance, **nicht als Validitäts-Whitelist**: `predicate` bleibt offen (Regel aus 04); eine Kante mit einem Prädikat außerhalb des Registers ist gültig und wird generisch dargestellt. Die Arbeitsteilung:

| Frage | Antwortet | Ort |
|---|---|---|
| Welche Relationen bietet die UI für einen `task` an? | Typ-Register | dieses Kapitel |
| Was bedeutet `assignedTo`? Symmetrisch? Sichtbarkeit? | Relation-Typ-Definition | [08-relation-records.md](08-relation-records.md), Regel 3 |
| Eingebettet oder eigenes Relation-Item? | Forward/Reverse-Regeln | [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md) |

Regeln:

1. Ein `relations`-Eintrag besteht aus `predicate`, `itemRole` und `otherKind` (was am anderen Endpunkt steht: `person`, `place`, `item`, …); der Schlüssel ist das Paar (`predicate`, `itemRole`). `itemRole` ist `"from"`, `"to"` oder `"either"`:
   - `"from"` / `"to"` für gerichtete Kanten — welche Rolle **dieses Item** hat. Beide Rollen desselben Prädikats DÜRFEN am selben Typ koexistieren: `task` deklariert `{ blocks, from, task }` **und** `{ blocks, to, task }`, denn ein Task kann blockieren und blockiert werden.
   - `"either"` für symmetrische Prädikate — `person` → `{ knows, either, person }`. Eine symmetrische Kante hat keine Richtung; 08 kanonisiert ihre Endpunkte gerade deshalb. `"either"` und `"from"`/`"to"` schließen sich für dasselbe Prädikat am selben Typ aus (Konflikt), und `itemRole` MUSS zur Symmetrie-Deklaration der Relation-Typ-Definition passen: symmetrisch ⇒ `"either"`, gerichtet ⇒ `"from"`/`"to"`.

   Beispiele, nichtnormativ: `task` → `{ assignedTo, from, person }`; `statement` → `{ votesOn, to, person }` (eingehende Stimmen; der `footer`-Slot weiß darüber, dass er Records **zu** diesem Item abfragt). Welches Composer-Widget eine Kante bedient, deklariert das Darstellungs-Register (`relationWidgets`, gleicher Schlüssel) — Kanten ohne Widget entstehen anderswo, z.B. per Karten-Pick oder Modul-Interaktion. Normativ wird ein Prädikat erst durch seine Relation-Typ-Definition.
2. `otherKind` bindet an die Target-Konventionen aus 04: `person` persistiert als `global:`-Target (User-Id oder DID), item-artige Kinds (`place`, `project`, …) als `item:` bzw. `space:{id}/item:`. Composer und Abfrage leiten die Target-Form der Gegenstelle aus `otherKind` ab, nie umgekehrt.
3. Das Typ-Register definiert **keine** Prädikat-Semantik. Gerichtetheit, Symmetrie und Sichtbarkeit eines Prädikats gehören in die Relation-Typ-Definition (08, Regel 3) — heute App-Konfiguration, Ziel ist die versionierte RelationTypeDefinition im Space. Ein Prädikat, das im Typ-Register auftaucht, MUSS dort definiert sein.
4. Ob eine Kante eingebettet (`item.relations[]`) oder als Relation-Record persistiert wird, entscheiden die Forward/Reverse-Regeln aus 04 — nicht das Typ-Register. Es deklariert die Möglichkeit, nicht den Mechanismus.
5. Personen-Kanten sind ein Fall unter vielen, kein Sonderfall: `peopleRelation` aus `ContentTypeConfig` geht auf in einem Manifest-Eintrag `{ assignedTo, from, person }` plus der `relationWidgets`-Zuordnung `people` im Darstellungs-Register.

#### Nicht-Ziele des Registers

- Modul-Aktivierung (feldbasiert, s.o.)
- Capabilities, Rechte, Interaktions-Verfügbarkeit
- Karten-/Panel-Markup (Sache der Flächen; das Register liefert Slot-Inhalte)
- Feld-Validierung (Sache der Schemas)
- Relation-Gültigkeit (Prädikate bleiben offen; das Register listet Affordances)

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
- `https://real-life-stack.org/vocab/statement/v1` — Marker: Aussage zur Gruppen-Stellungnahme (Resonance); keine eigenen Felder, verlangt `base/v1 title`

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

Für Vokabulare mit eigenem Feld gilt: Da `@context`-Konsistenz nicht erzwingbar ist, **müssen Module den Feldfilter verwenden** und dürfen `hasSchema` nur als zusätzliche Optimierung anbieten.

**Marker-Vokabulare** sind die definierte Ausnahme: ein Vokabular, das kein eigenes Feld einführt, sondern eine Intention markiert und dabei nur Basis-Felder verlangt (z.B. `statement/v1` — verlangt `base/v1 title`). Für sie existiert kein äquivalenter Feldfilter, darum ist `hasSchema` ihr **primärer und einziger** Aktivierungsfilter. Voraussetzungen: der Composer MUSS das Vokabular beim Erstellen setzen (`deriveContext`), und das Vokabular MUSS in der Registry mit Schema und Context ausgewiesen sein. Ein Item ohne das Marker-Vokabular erscheint nicht in dessen Modulen — auch wenn sein `type` gleich heißt; `type` aktiviert nie (s.o.).

> **Status:** `hasSchema` ist implementiert: `matchesFilter` in `data-interface` prüft, dass alle gelisteten Vokabulare in `@context` aktiv sind; die lokal filternden Connectoren (Local, Mock, WoT) erben das, der GraphQL-Pfad transportiert Filter und `@context` end-to-end.

## Modul-Konsequenzen

| Modul | Primärer Filter (heute) | Optimierung (sobald implementiert) | Was es zeigt |
|---|---|---|---|
| Map | `hasField: ['position']` | `hasSchema: ['…/place/v1']` | alles räumlich Darstellbare |
| Calendar | `hasField: ['start']` | `hasSchema: ['…/event/v1']` | alles zeitlich Darstellbares |
| Kanban | konfiguriertes `hasField: [statusField]` (Default: `['status']`) plus Spaltenwert-Prüfung | bei Default `hasSchema: ['…/task/v1']`; bei anderem Feld keine Task-Vokabular-Annahme | Nicht-Relation-Items mit verwertbarem konfiguriertem Spaltenfeld; `archived` nur bei expliziter Spalte |
| Feed | kein Feldfilter — jedes Item mit eigener Karte | — | alles Neue im Space |
| Resonance | `hasSchema: ['…/statement/v1']` (Marker-Vokabular, s.o.) | — | Aussagen zur Gruppen-Stellungnahme |
| Contacts | `hasSchema: ['…/person/v1']` | — | Personen-Profile |

Ein Item mit mehreren Schemas erscheint in jedem zuständigen Modul gleichzeitig. Jedes Modul rendert nur den Schema-Anteil, den es kennt.

Der Feed ist als einziger Eintrag der Tabelle **keine feldaktivierte Sicht**, sondern eine aggregierende (oben, „Verhältnis zwischen Schema- und Feldfiltern", zusammen mit der Suche): er beantwortet „was ist hier neu", nicht „welches Feld kann ich rendern". Deshalb MUSS er alle Items des Scopes zeigen, die eine eigene Karte haben, und darf sie nicht nach Feldern oder Typen auswählen. Kartenlos sind ausschließlich die System-Typen (`comment`, `reaction`, `relation` — sie sprechen innerhalb der Karte eines anderen Items) und `feature` als Geometrie-Marker ohne Karte; das Prädikat dafür ist `rendersAsCard` in `data-interface`. Ein Feed, der Typen aufzählt, verliert jeden neuen Typ lautlos — er hat kein Register zu führen.

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
