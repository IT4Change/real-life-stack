# Real Life Stack Spec

**Status:** Spezifikationskern im Aufbau

Diese Spec beschreibt den stabilen technischen Vertrag des Real Life Stack. Sie ist der normative Bereich des Repositories. Konzeptdokumente duerfen weiterdenken, Beispiele sammeln oder offene Richtungen erkunden; die Dateien in `docs/spec/` definieren, worauf Code, Connectoren, Hooks und Module sich verlassen duerfen.

## Geltungsbereich

Real Life Stack ist ein backend-agnostischer App- und UI-Baukasten.

Die Spec beschreibt:

- App- und UI-Schichten,
- `DataInterface`,
- generische Items und Relations,
- Connector-Capabilities,
- Reaktivitaet,
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
| [architektur2.md](architektur2.md) | Historischer Ursprung / Referenz | bisher beste Gesamtbeschreibung; wird schrittweise in die neue Spec-Struktur ueberfuehrt |
| [reaktivitaet.md](reaktivitaet.md) | Bestehende Spezifikation | Reaktivitaets- und Relation-Verhalten |
| [04-confirmations-and-trust.md](04-confirmations-and-trust.md) | Normativer Entwurf | Claims, Confirmations, Attestations und Trust-Level |

## Decisions

Entscheidungen mit langfristiger Wirkung werden unter [decisions/](decisions/) dokumentiert.

Aktuell:

- [0001-confirmation-view.md](decisions/0001-confirmation-view.md)

## Dokumentklassen

| Bereich | Normativ? | Bedeutung |
|---|---:|---|
| `docs/spec/` | ja | Stabiler Vertrag fuer Implementierungen |
| `docs/spec/decisions/` | ja | Architekturentscheidungen und Begriffsentscheidungen |
| `docs/modules/` | teilweise | Modulnahe Anforderungen; muessen langfristig gegen `docs/spec/` geprueft werden |
| `docs/concepts/` | nein | Explorative Konzepte, Produktideen, Integrationsnotizen |
| `docs/funding/` | nein | Antragstexte und Kommunikation |

Wenn Code und Spec widersprechen, ist das ein Spec- oder Implementierungsproblem. Neue Regeln sollen nicht stillschweigend in Code, Hooks oder Konzeptdokumenten entstehen.

## Conformance-Ziel

Langfristig soll jeder Connector gegen dieselben Conformance-Slices pruefbar sein:

- Core DataInterface,
- Item Writing,
- Relations,
- Groups/Spaces,
- Profile,
- Confirmations und Trust,
- Reaktivitaet.

Diese Tests sollen nicht jedes Backend gleich machen. Sie sollen sichtbar machen, welche Capabilities ein Connector korrekt implementiert und welche Trust-Aussage seine Daten haben.
