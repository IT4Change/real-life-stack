# Feed Module

**Status:** Normativer Entwurf v0.1

Das Feed Module ist der Aktivitäts- und Inhaltsstrom im Current Space. Es macht Items sichtbar, die für wiederholtes Lesen, Reagieren, Kommentieren oder Weiteröffnen relevant sind.

## Zweck

Der Feed beantwortet im Current Space die Frage:

> Was ist hier gerade sichtbar passiert oder wurde hier geteilt?

Er unterstützt:

- schnelles Scannen aktueller Inhalte,
- Lesen von Posts, Events, Tasks, Orten, Projekten oder anderen feed-fähigen Items,
- Kommentare und Reaktionen, wenn der Connector Relations und Schreiben unterstützt,
- Weiteröffnen von Items in Detailansichten oder anderen Space Modules.

## Einordnung

| Frage | Antwort |
|---|---|
| Space Module? | Ja |
| App-Shell-Fläche? | Nein |
| Module Components | ItemPreview + Adornments (ItemTypeBadge, ItemMetaRow, ItemCommentCount), ContentComposer, ReactionBar, CommentSection, Widgets |
| Primäre Datenbasis | Items und optional Relations |
| Externe Semantik | optional RLNP/Game/WoT-Projektionen, aber nicht durch den Feed definiert |

## Datenmodell

Der Feed liest Items im Current Space. Er darf bekannte Typen speziell darstellen, muss unbekannte Typen aber robust generisch anzeigen statt sie zu verschweigen.

Feed-fähig ist **jedes Item mit eigener Karte**. Der Feed wählt weder nach Typ noch nach Feld aus: ein Ort, eine Aufgabe, ein Projekt oder ein künftiger Typ erscheint, sobald es ihn gibt.

Nicht feed-fähig sind ausschließlich Items ohne eigene Karte:

```text
comment, reaction, relation   # sprechen in der Karte eines anderen Items
feature                       # Geometrie-Marker ohne Karte
```

Die Unterscheidung gehört nicht in den Feed: das Prädikat `rendersAsCard` in `data-interface` trägt sie, damit Feed, Liste und Suche dieselbe Antwort geben ([06-schema-composition.md](../06-schema-composition.md) → Modul-Konsequenzen).

| Feld | Bedeutung im Feed |
|---|---|
| `data.title` | Überschrift |
| `data.content` / `data.description` | Haupttext oder Kurzbeschreibung |
| `data.start` / `data.end` | zeitlicher Kontext |
| `data.location` / `data.address` | räumlicher Kontext |
| `tags` | Top-level am Item, einfache Sortierung oder Themenhinweis — siehe [07-tags.md](../07-tags.md) |
| `createdAt` | Standard-Sortierung |
| `createdBy` | Autor- oder Ursprungsanzeige |

Relations:

| Relation | Bedeutung |
|---|---|
| `commentOn` | Kommentare zu einem Item |
| `reactsTo` | Reaktionen auf ein Item |
| domänenspezifische Relations | dürfen angezeigt, aber nicht vom Feed semantisch definiert werden |

Confirmations können im Feed sichtbar werden, wenn ein Connector `ConfirmationCapable` anbietet. Der Feed darf daraus Badges, Trust-Hinweise oder Ereigniszeilen ableiten, darf aber keine Confirmation erfinden.

## Sortierung

Die Basissortierung ist absteigend nach `createdAt`.

Andere Sortierungen sind erlaubt, wenn sie explizit als UI- oder Connector-Funktion erkennbar bleiben, z.B.:

- Entfernung,
- Relevanz im persönlichen Netzwerk,
- Space-spezifische Priorisierung,
- angeheftete Items.

Der Feed darf solche Sortierungen nicht als Trust-, Safety- oder Wahrheitsaussage darstellen.

## Capabilities

| Capability | Verhalten, wenn vorhanden | Verhalten, wenn fehlt |
|---|---|---|
| `DataInterface` | Items lesen und beobachten | Feed kann nicht sinnvoll rendern |
| `ItemWriter` | neue Feed-Items, Kommentare oder Reaktionen erstellen | Composer und schreibende Aktionen ausblenden oder deaktivieren |
| `RelationCapable` | Kommentare, Reaktionen und Kontextbezüge laden | Kommentare/Reaktionen ausblenden oder als nicht verfügbar markieren |
| `Authenticatable` | Current User und Autorinformationen auflösen | auf `createdBy` fallbacken; Nutzeraktionen ggf. deaktivieren |
| `ProfileCapable` | reichere Autorprofile anzeigen | Name/Avatar fallbacken auf verfügbare Item-/User-Daten |
| `ConfirmationCapable` | Trust-Hinweise, Badges oder bestätigte Ereignisse anzeigen | Confirmation-bezogene Anzeigen ausblenden |

## Aktionen

| Aktion | Voraussetzung | Effekt |
|---|---|---|
| Feed lesen | `DataInterface` | Items im Current Space anzeigen |
| Item öffnen | Item vorhanden | Detailansicht oder Zielmodul öffnen |
| Post erstellen | `ItemWriter`, ggf. `Authenticatable` | `type: "post"` oder konfigurierten Item-Typ erstellen |
| Kommentieren | `ItemWriter` + `RelationCapable` | `type: "comment"` mit `commentOn`-Relation erstellen |
| Reagieren | `ItemWriter` + `RelationCapable` | `type: "reaction"` mit `reactsTo`-Relation erstellen |

Mutationen laufen über Hooks oder Capability-Interfaces. Der Feed darf keine backend-spezifischen Schreibpfade kennen.

## Cross-Module-Verhalten

Der Feed darf Items an andere Space Modules übergeben, ohne diese fest zu importieren oder ihre Semantik zu besitzen.

Beispiele:

- Item mit `location` oder `address` kann in der Map geöffnet werden.
- Item mit `start` / `end` kann im Calendar geöffnet werden.
- Item mit `status` kann im Kanban geöffnet werden.
- Quest- oder QuestRun-Items können im Quests-Modul geöffnet werden, z.B. in einer Questlog-Komponente.
- Campaign- oder Adventure-Projektionen können in der Campaign View geöffnet werden.

Die konkrete Navigation ist App- oder Shell-Verantwortung.

## Komponenten

| Komponente | Rolle | Wiederverwendbar? |
|---|---|---|
| `ItemPreview` + Adornments | generische Item-Vorschau (Author / Title / Description / Tags) plus `ItemTypeBadge` im Header, `ItemMetaRow` für Date+Address im Meta-Slot, `ItemCommentCount` im Footer | ja, shared (`packages/toolkit/src/components/preview/`) |
| `ContentComposer` | Feed- oder Item-Erstellung | ja |
| `ReactionBar` | Reaktionen anzeigen und setzen | ja |
| `CommentSection` | Kommentare und Antworten anzeigen | ja |
| Widgets | Felder wie Datum, Ort, Personen, Tags oder Status darstellen | ja |

## Nicht-Ziele

Das Feed Module definiert nicht:

- eine globale Notification-Inbox,
- ein Social-Graph-Ranking,
- Moderations- oder Safety-Policies,
- RLNP-Completion-Logik,
- Game-Fortschritt,
- WoT-Attestation-Formate,
- backend-spezifische Query- oder Tabellenstrukturen.

Automatisch generierte Feed-Ereignisse sind nur dann Feed-Inhalte, wenn sie als Items, Confirmations oder Connector-Events projiziert werden. Der Feed erzeugt keine soziale Wahrheit aus UI-Beobachtungen.

## Implementierungsreferenzen

- `packages/toolkit/src/components/feed/`
- `packages/toolkit/src/hooks/use-items.ts`
- `packages/toolkit/src/hooks/use-comments.ts`
- `packages/toolkit/src/hooks/use-reactions.ts`

## Offene Punkte

1. Wie werden automatisch generierte Aktivitätszeilen modelliert: als Items, Confirmations oder Connector-Events?
2. Welche Sortierungen gehören in v0 außer `createdAt`?
3. Wie werden Space-spezifische Sichtbarkeitsregeln im Feed angezeigt, ohne sie im Feed selbst zu definieren?
4. Welche Typen bietet das „+" im Feed zum Erstellen an? Die Anzeige ist entschieden (jede Karte), das Erstellen noch nicht — heute Post und Event.
