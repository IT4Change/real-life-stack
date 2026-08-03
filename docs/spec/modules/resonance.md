# Resonance Module (Resonanz)

**Status:** Normativer Entwurf v0.1

Das Resonance Module ist eine Listen-Ansicht im Current Space, in der
Mitglieder Aussagen einbringen und die Gruppe sich mit einer dreistufigen
Stellungnahme (grün / gelb / rot) dazu positioniert. Es macht sichtbar,
was in der Gruppe Resonanz findet.

Herkunft: das „Narrative"-Modul des Web-of-Trust-Prototyps
(it4change/web-of-trust-prototype), übertragen auf das RLS-Item-Modell.

## Zweck

Das Modul beantwortet im Current Space die Frage:

> Wie steht die Gruppe zu dieser Aussage?

Die Aussage ist bewusst generisch: eine These („Wir brauchen einen
zweiten Brunnen"), ein Ziel („Erst die Küche, dann der Seminarraum"),
ein Angebot („Ich übernehme die Pressearbeit"). Die Nutzung —
Meinungsbild, Priorisierung, Aufgabenverteilung — entsteht sozial aus
dem Inhalt, nicht aus Feature-Varianten des Moduls.

## Einordnung

| Frage | Antwort |
|---|---|
| Space Module? | Ja (opt-in über den Gruppen-Dialog, kein Default-Modul) |
| App-Shell-Fläche? | Nein |
| Module Components | ResonanceView (App), VoteBar (Toolkit), useVotes (Toolkit) |
| Primäre Datenbasis | Items (`statement`, `vote`) + Relations |
| Externe Semantik | keine |

## Datenmodell

### Statement (die Aussage)

| Feld | Bedeutung |
|---|---|
| `type` | `"statement"` |
| `data.title` | die Aussage — ein Satz; Pflicht |
| `data.description` | optionaler Kontext |
| `tags` | Top-level am Item, Kategorisierung — siehe [07-tags.md](../07-tags.md) |
| `createdBy` | Autorin der Aussage |

Die Resonance-Ansicht liest Statements über den Typ-Filter
(`useItems({ type: "statement" })`). Das weicht bewusst von der
Feldpräsenz-Konvention aus Spec 06 ab: ein Statement hat kein
natürliches Alleinstellungs-Feld, und Cross-Module-Projektion von
Statements ist kein Ziel dieses Moduls (siehe Nicht-Ziele).

### Vote (die Stellungnahme)

Ein Vote ist ein **eigenes Item** — niemals ein Feld am Statement:

| Feld | Bedeutung |
|---|---|
| `id` | deterministisch: `vote:<statementId>:<voterDid>` |
| `type` | `"vote"` |
| `data.value` | `"green"` \| `"yellow"` \| `"red"` |
| `relations` | `[{ predicate: "votesOn", target: "item:<statementId>" }]` |
| `createdBy` | die Stimme gehört dieser DID |

Regeln (MUSS):

1. **Ein Vote pro (Person, Statement).** Die deterministische Item-ID
   erzwingt das strukturell: `createItem` mit vorhandener ID ist
   idempotent (liefert das bestehende Item), ein Wechsel der Stimme ist
   `updateItem` auf das **eigene** Vote-Item.
2. **Votes werden nie in das Statement-Item geschrieben.** `updateItem`
   rekonziliert `data` vollständig — ein Summary-Feld am Statement würde
   konkurrierende Stimmen gegenseitig löschen. Ein Item ist die
   CRDT-Konfliktgrenze; ein Vote-Item pro Person merged konfliktfrei
   (gleiches Muster wie Reaktionen, siehe `use-reactions.ts`).
3. **Aggregation ist rein clientseitig** (`VoteSummary`: green/yellow/
   red/total + eigene Stimme), gelesen über
   `observeRelatedItems(statementId, "votesOn", { direction: "to" })`.
4. **Votes sind transparent.** Jede Stimme trägt `createdBy` und ist im
   Space für alle Mitglieder lesbar und im Sync-Log autorsigniert.
   Anonymität wird nicht versprochen, weil sie technisch nicht existiert.

## Capabilities

| Capability | Verhalten, wenn vorhanden | Verhalten, wenn fehlt |
|---|---|---|
| `DataInterface` | Statements + Votes lesen | Modul kann nicht lesen |
| `ItemWriter` | Statements anlegen/bearbeiten, Votes setzen/ändern | Schreibaktionen deaktiviert |
| `RelationCapable` | Votes je Statement beobachten | VoteBar ausblenden |
| `Authenticatable` | eigene Stimme markieren, Vote-Identität | Voten deaktiviert |
| `ProfileCapable` | Voter-Namen im Tooltip | Fallback auf DIDs |

## Aktionen

| Aktion | Voraussetzung | Effekt |
|---|---|---|
| Statement einbringen | `ItemWriter` | `createItem(type: "statement")` |
| Statement bearbeiten | `ItemWriter` + Berechtigung | `updateItem`; Historie über das Activity-Log |
| Stimme abgeben | `ItemWriter` + `Authenticatable` | `createItem(type: "vote")` mit deterministischer ID |
| Stimme ändern | dito | `updateItem` auf das eigene Vote-Item |
| Stimme zurückziehen | dito | `deleteItem` auf das eigene Vote-Item |

## Sortierungen

Vier Sortierungen, Tiebreaker in Klammern:

| Sortierung | Schlüssel |
|---|---|
| Neueste (Default) | `createdAt` desc (letzte Stimme, Stimmenzahl) |
| Stimmen | Stimmenzahl desc (Zustimmungsrate, letzte Stimme, `createdAt`) |
| Zustimmung | Anteil grün desc (Stimmenzahl, letzte Stimme, `createdAt`) |
| Aktivität | Zeit der letzten Stimme desc (Stimmenzahl, Zustimmungsrate, `createdAt`) |

## Komponenten

| Komponente | Rolle | Wiederverwendbar? |
|---|---|---|
| `ResonanceView` (App) | Liste, Sortierung, Tag-Filter, Create/Detail-Registrierung | nein |
| `VoteBar` (Toolkit) | Verteilungsbalken grün/gelb/rot + Vote-Buttons; sitzt im `footerAdornment` der `ItemPreview`; Tooltip mit Voter-Namen; `stopPropagation` auf Interaktionen | ja |
| `useVotes` (Toolkit) | Vote-Lesen/Schreiben/Aggregation nach dem `use-reactions`-Muster (optimistisches Overlay, Write-Chain) | ja |

Karten werden ausschließlich aus `ItemPreview` gebaut
(siehe [shared-components.md](./shared-components.md)); die VoteBar ist
ein Adornment, keine eigene Kartenform.

## Activity-Log

Der Connector schreibt Activity automatisch (create/update/delete).
`deriveActivitySummary` erhält einen Zweig für `type === "vote"` analog
zum Reaction-Zweig, damit im Log „Stimme (grün) zu ‚…‘" statt eines
leeren Eintrags steht. Die Edit-Historie eines Statements ist das
Activity-Log; das Modul führt keine eigene Historie.

## Cross-Module-Verhalten

- Ein Statement mit `data.status` darf im Kanban erscheinen, mit
  `data.start` im Kalender (generische Feldpräsenz-Regeln); das Modul
  definiert dazu nichts Eigenes.
- Vote-Items sind reine Relations-Träger und erscheinen in keiner
  anderen Modul-Ansicht (kein `content`, `status`, `start`, `location`).

## Nicht-Ziele

- **Kein Cross-Module-Voting** (Stellungnahmen zu beliebigen Items
  anderer Module) — bewusst vertagt; das Datenmodell (`votesOn` auf
  beliebige `item:`-Targets) schließt es nicht aus.
- Keine Prozess-Semantik (kein Konsent-Verfahren, keine Beschlüsse,
  keine Quoren), kein Punkte-Budget, kein Ranking-Ballot.
- Keine Anonymität (siehe Datenmodell Regel 4).
- Keine eigene Historien-Struktur (Activity-Log genügt).
- Kein Default-Modul: Aktivierung ausschließlich über den Gruppen-Dialog.

## Implementierungsreferenzen

- Vote-Mechanik-Vorlage: `packages/toolkit/src/hooks/use-reactions.ts`
- Karten/Adornments: `packages/toolkit/src/components/preview/item-preview.tsx`
- View-Blaupause: `apps/reference/src/views/feed-view.tsx`,
  `collection-view.tsx`
- Prototyp: `web-of-trust-prototyp/narrative-app` (Schema
  `opinion-graph.ts`, `VoteBar.tsx`)

## Offene Punkte

- Bearbeiten fremder Statements: aktuell folgt das Modul den generischen
  Item-Berechtigungen (`use-item-permissions`); ob Statements nach der
  ersten Fremd-Stimme eingefroren werden sollten, ist offen.
- JSON-Import von Statement-Listen (Prototyp-Feature) — bei Bedarf nachrüsten.
