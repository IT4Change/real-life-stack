# Exploration: RLS-Oberflächenprotokoll

Status: Exploration / RFC-Entwurf
Datum: 13.05.2026

Dieser Ordner ist ein gemeinsamer Arbeitsraum für ein mögliches
**RLS-Oberflächenprotokoll**: eine menschlich lesbare und später
maschinenlesbare Beschreibung von Real-Life-Stack-Oberflächen. Ziel ist, dass
KI-Werkzeuge, Designer und Mitwirkende konsistente Community-Oberflächen
entwerfen und umsetzen können, ohne jedes Mal eine neue App-Architektur zu
erfinden.

Das hier ist noch keine normative Spezifikation. Es ist ein Ort für Kontext,
offene Fragen, persönliche Vorschläge, freie KI-Experimente und eine spätere
Synthese. Erst danach sollten stabile Protokollteile in kleine, gut prüfbare
PRs geschnitten werden.

## Ziele

- Beschreiben, wie RLS-Oberflächen über App-Shell, Spaces, Module,
  Item-Ansichten, Erstellungsflüsse und adaptive Panels strukturiert sind.
- Nah an der bestehenden Real-Life-Stack-Architektur bleiben: Toolkit,
  Hooks, DataInterface, Gruppen/Spaces, generische Items und Connector-
  Fähigkeiten.
- Genug Struktur schaffen, damit KI-Agenten Oberflächen-Slices generieren
  können, ohne aus den RLS-Mustern auszubrechen.
- Genug Offenheit lassen, damit Sebastian, Timo, Anton und externe KI-Tools
  alternative Oberflächenkonzepte einbringen können, bevor etwas normativ wird.

## Nicht-Ziele

- Dieser Ordner entscheidet nicht das finale visuelle Design.
- Dieser Ordner ersetzt nicht die bestehenden RLS-Architekturdokumente.
- Dieser Ordner führt kein neues Frontend-Framework ein.
- Freie KI-Experimente müssen nicht RLS-konform sein.
- Dieser Ordner sollte nicht als fertige Spezifikation gemergt werden, bevor
  die gemeinsame Synthese passiert ist.

## Dokumente

| Dokument | Zweck |
|---|---|
| [brief.md](./brief.md) | Neutraler Anforderungsbrief ohne RLS-Layoutvorgaben. |
| [rls-baseline.md](./rls-baseline.md) | Bestandsaufnahme: Was RLS heute bereits vorgibt. |
| [open-questions.md](./open-questions.md) | Fragen für Anton, Sebastian und Timo vor einer Spezifikation. |
| [synthesis.md](./synthesis.md) | Spätere Auswertung von Vorschlägen und Experimenten. |
| [proposals/](./proposals/) | Persönliche Vorschläge von Anton, Sebastian und Timo. |
| [experiments/](./experiments/) | Prompts und Ergebnisse freier KI-Oberflächenexperimente. |

## Arbeitsablauf

1. `brief.md` als neutrale gemeinsame Eingabe nutzen.
2. Eigene Gedanken unter `proposals/` ergänzen, ohne die Notizen der anderen
   umzuschreiben.
3. Freie KI-Experimente mit `experiments/prompts/open-layout.md` durchführen.
4. Rohergebnisse unter `experiments/outputs/` ablegen.
5. Danach gemeinsam auswerten.
6. Erkenntnisse in `synthesis.md` verdichten.
7. Die eigentliche Spezifikation in kleinen Folge-PRs ausarbeiten.

## Mögliche Folge-PRs

- Begriffe und Glossar.
- App-Shell und Space-Navigation.
- Modul-Manifest-Format.
- Item-Vorschau, Item-Detail und Composer-Ansichten.
- Surface-Blueprint als JSON Schema.
- Validator und Konformitätsprüfungen.
- Generator- oder Runner-Anbindung.
