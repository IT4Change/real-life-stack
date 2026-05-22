# Real Life Stack Spec

**Status:** Spezifikationskern im Aufbau

Diese Spec beschreibt den stabilen technischen Vertrag des Real Life Stack. Sie ist der normative Bereich des Repositories. Konzeptdokumente dürfen weiterdenken, Beispiele sammeln oder offene Richtungen erkunden; die Dateien in `docs/spec/` definieren, worauf Code, Connectoren, Hooks und UI-Flächen sich verlassen dürfen.

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

Die sechs Kern-Dokumente bauen in dieser Reihenfolge aufeinander auf:

| Dokument | Status | Zweck |
|---|---|---|
| [00-architecture.md](00-architecture.md) | Normativer Startpunkt | Schichtenmodell, Verantwortlichkeiten und Architekturregeln |
| [01-app-composition.md](01-app-composition.md) | Normativer Entwurf | App Shell, Current Space, Space Modules und Module Components |
| [02-data-interface.md](02-data-interface.md) | Normativer Entwurf | Read-only Core-Vertrag, Items, Observables und Filter |
| [03-capabilities.md](03-capabilities.md) | Normativer Entwurf | Optionale Connector-Fähigkeiten, Type Guards und FullConnector-Abgrenzung |
| [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md) | Normativer Entwurf | Items, Relations, Groups/Spaces und Projektionen für RLNP/Game |
| [05-confirmations-and-trust.md](05-confirmations-and-trust.md) | Normativer Entwurf | Claims, Confirmations, Attestations und Trust-Level |

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
