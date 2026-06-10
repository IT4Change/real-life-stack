# Real Life Stack Spec

**Status:** Spezifikationskern im Aufbau — **Single Source of Truth** des Repositories

Diese Spec beschreibt den stabilen technischen Vertrag des Real Life Stack. Sie ist der normative Bereich des Repositories. Konzeptdokumente dürfen weiterdenken, Beispiele sammeln oder offene Richtungen erkunden; die Dateien in `docs/spec/` definieren, worauf Code, Connectoren, Hooks und UI-Flächen sich verlassen dürfen.

**Bei Konflikt zwischen Spec und Implementierung gewinnt die Spec.** Entweder Code anpassen oder Spec ändern + PR-Note. Code soll nicht stillschweigend neue Regeln einführen.

## Geltungsbereich

Real Life Stack ist ein backend-agnostischer App- und UI-Baukasten.

Die Spec beschreibt:

- App- und UI-Schichten,
- `DataInterface`,
- generische Items und Relations,
- Connector-Capabilities,
- Reaktivität,
- Groups/Spaces als technische Arbeits- und Sichtbarkeitskontexte,
- backend-agnostische Projektionen auf Claims, Confirmations und Trust.

Die Spec beschreibt nicht:

- Web-of-Trust-Kryptografie, DIDs oder VC-JWS-Formate,
- die soziale Bedeutung des Real Life Network Protocol,
- Game Packs, Adventures oder Campaign-Regeln,
- Produkt-, Funding- oder Kommunikationsstrategie.

Diese Bereiche bleiben in ihren eigenen Repositories oder Konzeptdokumenten. RLS darf sie darstellen und nutzbar machen, besitzt ihre Semantik aber nicht.

## Normative Kern-Spec

Die Kern-Dokumente bauen in dieser Reihenfolge aufeinander auf:

| Dokument | Status | Zweck |
|---|---|---|
| [00-architecture.md](00-architecture.md) | Normativer Startpunkt | Schichtenmodell, Verantwortlichkeiten und Architekturregeln |
| [01-app-composition.md](01-app-composition.md) | Normativer Entwurf | App Shell, Current Space, Space Modules und Module Components |
| [02-data-interface.md](02-data-interface.md) | Normativer Entwurf | Read-only Core-Vertrag, Items, Observables und Filter |
| [03-capabilities.md](03-capabilities.md) | Normativer Entwurf | Optionale Connector-Fähigkeiten, Type Guards und FullConnector-Abgrenzung |
| [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md) | Normativer Entwurf | Items, Relations, Groups/Spaces und Projektionen für RLNP/Game |
| [05-confirmations-and-trust.md](05-confirmations-and-trust.md) | Normativer Entwurf | Claims, Confirmations, Attestations und Trust-Level |
| [06-schema-composition.md](06-schema-composition.md) | Normativer Entwurf | Schema-Komposition über `@context`, Standardvokabulare, `type`-Hint |
| [07-tags.md](07-tags.md) | Normativer Entwurf | Tags als Kategorisierungs-Achse: einfache Strings + strukturierte URN-Tags |

## Formale Schemas

[schemas/](schemas/) enthält die maschinen-lesbaren Vokabular-Definitionen, die in 06 und 07 referenziert werden:

| Pfad | Inhalt |
|---|---|
| [schemas/README.md](schemas/README.md) | Konventionen, Komposition, Versionierung |
| [schemas/vocab/](schemas/vocab/) | Pro Vokabular: `context.jsonld` (JSON-LD) + `schema.json` (JSON-Schema) + `examples/valid/` |

Aktuelle Vokabulare: `base/v1`, `place/v1`, `event/v1`, `task/v1`, `person/v1`.

## Weitere Referenzen

| Dokument | Status | Zweck |
|---|---|---|
| [modules/](modules/) | Normative Detail-Specs im Aufbau | Verbindliche Space-Module-Spezifikationen auf Basis der Kern-Spec |
| [code-and-storybook-mapping.md](code-and-storybook-mapping.md) | Normativer Entwurf | Abbildung von App Shell, Space Modules, Module Components und Primitives in Code und Storybook |
| [architektur2.md](architektur2.md) | Historische Referenz, nicht direkt normativ | bisher beste Gesamtbeschreibung; wird schrittweise in die neue Spec-Struktur überführt |
| [reaktivitaet.md](reaktivitaet.md) | Ergänzende Referenz | Bestehendes Detailverhalten für Reaktivität und Relations; wird später in passende Kern-Slices überführt |

## Decisions

Entscheidungen mit langfristiger Wirkung werden unter [decisions/](decisions/) dokumentiert.

Aktuell:

- [0001-confirmation-view.md](decisions/0001-confirmation-view.md)

## Dokumentklassen

| Bereich | Normativ? | Bedeutung |
|---|---:|---|
| `docs/spec/` | ja | Stabiler Vertrag für Implementierungen |
| `docs/spec/modules/` | ja | Verbindliche Space-Module-Detail-Specs |
| `docs/spec/schemas/` | ja | Maschinen-lesbare Vokabular-Schemas (JSON-LD + JSON-Schema) |
| `docs/spec/decisions/` | ja | Architekturentscheidungen und Begriffsentscheidungen |
| `docs/modules/` | nein | Frühes Modul-Brainstorming; Inspirationsmaterial für künftige Modul-Specs |
| `docs/concepts/` | nein | Explorative Konzepte, Produktideen, Integrationsnotizen |
| `docs/archive/` | nein | Historische Dokumente, alte Pläne und überholte Architekturstände |
| `docs/funding/` | nein | Antragstexte und Kommunikation |

Wenn Code und Spec widersprechen, ist das ein Spec- oder Implementierungsproblem. Neue Regeln sollen nicht stillschweigend in Code, Hooks oder Konzeptdokumenten entstehen.

## Conformance-Ziel

Langfristig soll jeder Connector gegen dieselben Conformance-Slices prüfbar sein:

- App Composition,
- Core DataInterface,
- Item Writing,
- Relations,
- Groups/Spaces,
- Profile,
- Confirmations und Trust,
- Reaktivität.

Diese Tests sollen nicht jedes Backend gleich machen. Sie sollen sichtbar machen, welche Capabilities ein Connector korrekt implementiert und welche Trust-Aussage seine Daten haben.

## Spec-driven Roadmap

Schritte auf dem Weg zur vollständig spec-getriebenen Entwicklung. Stufe 1 ist umgesetzt; die folgenden Stufen sind dokumentiert, damit sie nicht vergessen werden, und werden bei Bedarf jeweils als eigener PR aufgesetzt.

### Stufe 1 — Konsolidierung (umgesetzt)

- `schemas/` in `docs/spec/schemas/` als Single Source of Truth zusammengeführt
- Diese README als Navigations-Index
- `AGENTS.md` macht Spec-First explizit (Spec gewinnt bei Konflikt mit Code)

### Stufe 2 — Maschinen-prüfbar (geplant)

- **CI-Schema-Validierung**: AJV validiert alle `docs/spec/schemas/vocab/*/examples/valid/*.json` gegen ihr Schema und prüft, dass jedes Item in `packages/data-interface/data/items.json` gegen `base/v1` + die in seinem `@context` aktiven Vocabs validiert. Bricht den Build, wenn Daten die Spec verletzen.
- **Glossar** (`docs/spec/glossary.md`): jede Spec-Begrifflichkeit (Item, Group, Space, Vocab, Schema, Tag, Capability, Connector, Module, Composer, Widget, …) einmalig definiert. Querverweise von den Specs in den Glossar.
- **Stub-Conformance-Tests** pro Modul-Spec: ein Test prüft, dass der versprochene Vertrag (z.B. `MapAdapter` aus `modules/map.md`) im Code so existiert. Wenn jemand eine Adapter-Methode entfernt, bricht der Test mit Verweis auf die Spec-Stelle.

### Stufe 3 — Generiert und extern (langfristig)

- **TypeScript-Typen aus JSON-Schemas generieren**: `Item`, `Place`, `Event`, `Task`, `Person` werden per `json-schema-to-typescript` aus den `schema.json` produziert. Der Code-Layer kann nicht mehr divergieren — was die AI als TypeScript sieht, ist genau die Spec.
- **Externe Vocab-URLs**: `https://real-life-stack.org/vocab/base/v1` resolvt tatsächlich auf das Schema (statisch gehostet aus dem Repo). Damit funktioniert JSON-LD-Tooling end-to-end, externe Konsumenten können validieren.
- **Compliance-Profile**: Tabellen pro Connector („welche Capabilities, welche Vocabs"), per Tests geprüft.
- **Spec-Versionierung als Lifecycle**: heute v0.1 (normativer Entwurf). Stabilisierung → v1.0; Breaking Changes → neue Major-Version, alte bleibt erreichbar.
