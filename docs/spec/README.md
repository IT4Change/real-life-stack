# Real Life Stack Spec

**Status:** Spezifikationskern im Aufbau

Diese Spec beschreibt den stabilen technischen Vertrag des Real Life Stack. Sie ist der normative Bereich des Repositories. Konzeptdokumente dürfen weiterdenken, Beispiele sammeln oder offene Richtungen erkunden; die Dateien in `docs/spec/` definieren, worauf Code, Connectoren, Hooks und Module sich verlassen dürfen.

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

## Spec-Dokumente und Referenzen

| Dokument | Status | Zweck |
|---|---|---|
| [00-architecture.md](00-architecture.md) | Normativer Startpunkt | Schichtenmodell, Verantwortlichkeiten und Architekturregeln |
| [01-data-interface.md](01-data-interface.md) | Normativer Entwurf | Read-only Core-Vertrag, Items, Observables und Filter |
| [02-capabilities.md](02-capabilities.md) | Normativer Entwurf | Optionale Connector-Fähigkeiten, Type Guards und FullConnector-Abgrenzung |
| [03-items-relations-groups-spaces.md](03-items-relations-groups-spaces.md) | Normativer Entwurf | Items, Relations, Groups/Spaces und Projektionen für RLNP/Game |
| [architektur2.md](architektur2.md) | Historische Referenz, nicht direkt normativ | bisher beste Gesamtbeschreibung; wird schrittweise in die neue Spec-Struktur überführt |
| [reaktivitaet.md](reaktivitaet.md) | Bestehende Spezifikation | Reaktivitäts- und Relation-Verhalten |
| [04-confirmations-and-trust.md](04-confirmations-and-trust.md) | Normativer Entwurf | Claims, Confirmations, Attestations und Trust-Level |

## Decisions

Entscheidungen mit langfristiger Wirkung werden unter [decisions/](decisions/) dokumentiert.

Aktuell:

- [0001-confirmation-view.md](decisions/0001-confirmation-view.md)

## Dokumentklassen

| Bereich | Normativ? | Bedeutung |
|---|---:|---|
| `docs/spec/` | ja | Stabiler Vertrag für Implementierungen |
| `docs/spec/decisions/` | ja | Architekturentscheidungen und Begriffsentscheidungen |
| `docs/modules/` | nein | Frühes Modul-Brainstorming; Inspirationsmaterial für künftige Modul-Specs |
| `docs/concepts/` | nein | Explorative Konzepte, Produktideen, Integrationsnotizen |
| `docs/archive/` | nein | Historische Dokumente, alte Pläne und überholte Architekturstände |
| `docs/funding/` | nein | Antragstexte und Kommunikation |

Wenn Code und Spec widersprechen, ist das ein Spec- oder Implementierungsproblem. Neue Regeln sollen nicht stillschweigend in Code, Hooks oder Konzeptdokumenten entstehen.

## Conformance-Ziel

Langfristig soll jeder Connector gegen dieselben Conformance-Slices prüfbar sein:

- Core DataInterface,
- Item Writing,
- Relations,
- Groups/Spaces,
- Profile,
- Confirmations und Trust,
- Reaktivität.

Diese Tests sollen nicht jedes Backend gleich machen. Sie sollen sichtbar machen, welche Capabilities ein Connector korrekt implementiert und welche Trust-Aussage seine Daten haben.
