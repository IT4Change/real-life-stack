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

Ein Statement trägt das Vokabular **`statement/v1`** in `@context`
(gesetzt vom Composer über `deriveContext`). Die Modul-Aktivierung läuft
über dieses Schema, nie über `type` (Spec 06, „Die Rolle von `type`"):
die Resonance-Ansicht liest `useItems({ hasSchema: [statement/v1] })`,
der Feed nimmt Statements über denselben Filter in seine Union auf, und
Routing/Notifications tragen die Aktivierung als Schema-Hint
(`moduleHints.hasStatement`). `type: "statement"` bleibt für die
Composer-Vorlage, das Badge und User-Filter — die Rollen, die Spec 06
dem Typ zuweist.

### Vote (die Stellungnahme)

Ein Vote ist ein **Relation Record** ([08-relation-records.md](../08-relation-records.md)) —
niemals ein Feld am Statement und kein eigener Item-Typ:

| Feld | Bedeutung |
|---|---|
| `id` | kanonisch: `rel-<SHA-256 über [createdBy, "votesOn", from, to]>` |
| `predicate` | `"votesOn"` |
| `from` | `global:<voterDid>` — MUSS gleich `global:<createdBy>` sein |
| `to` | `item:<statementId>` |
| `fields.value` | `"green"` \| `"yellow"` \| `"red"` |
| `createdBy` | vom Connector aus der authentifizierten Identität gesetzt — nie vom Aufrufer |

Regeln (MUSS):

1. **Ein Vote pro (Person, Statement) — auth-gebunden.** Schreibpfad ist
   ausschließlich die Relation-Store-Fassade: `createdBy` stammt aus der
   authentifizierten Identität, die kanonische Hash-ID bindet
   `(Voter, Statement)` kollisionssicher (kein Trennzeichen-Trick möglich),
   eine vorbelegte ID mit abweichender Identität ist ein **Fehler**, kein
   idempotenter Erfolg, und Update/Delete prüfen Autorschaft. Wechsel der
   Stimme = `updateRelationRecord` auf den **eigenen** Record, gleiche
   Stimme erneut = Rückzug via `deleteRelationRecord`.
2. **Votes werden nie in das Statement-Item geschrieben.** `updateItem`
   rekonziliert `data` vollständig — ein Summary-Feld am Statement würde
   konkurrierende Stimmen gegenseitig löschen. Ein Record pro Person
   merged konfliktfrei (ein Item ist die CRDT-Konfliktgrenze).
3. **Alle Lesepfade teilen EINE Validierung** (`votesFromRelationRecords`
   in `data-interface/src/votes.ts`): Es zählen nur Records, deren
   `from`-Endpunkt an den Autor gebunden ist (`from === global:<createdBy>`)
   und deren `fields.value` gültig ist; pro `(Statement, Voter)` zählt
   höchstens EIN Record — Duplikate kollabieren deterministisch auf die
   lexikographisch kleinste Record-ID, sodass alle Clients unabhängig von
   der Sync-Reihenfolge dasselbe Aggregat bilden. Aggregation ist rein
   clientseitig (`VoteSummary`), gelesen über
   `observeRelationRecords({ predicate: "votesOn", to: "item:<id>" })`.
4. **Votes sind transparent.** Jede Stimme trägt `createdBy`, ist im Space
   für alle Mitglieder lesbar, und die VoteBar zeigt die Voter-Namen je
   Stufe im Tooltip. Anonymität wird nicht versprochen, weil sie technisch
   nicht existiert.

**Vertrauensgrenze:** Die Fassade bindet ehrliche Clients an ihre
Identität, und die geteilte Lese-Validierung macht Mehrfach-Stimmen
unzählbar — auch wenn ein manipulierter Client an der Fassade vorbei
rohe Items schreibt. Die verbleibende Lücke (gefälschtes `createdBy` per
rohem `createItem`) schließen die **SignedClaims** aus
[08-relation-records.md → Autorbindung](../08-relation-records.md#autorbindung-signedclaims):
`votesOn` ist ein `authorial`-Prädikat, jeder Vote-Record trägt die
Ed25519-JWS seines Autors über Identität und Wert, und die Aggregation
verwirft Records ohne gültigen Claim — fail closed, auch nach
Snapshot-Bootstrap.

## Capabilities

| Capability | Verhalten, wenn vorhanden | Verhalten, wenn fehlt |
|---|---|---|
| `DataInterface` | Statements lesen | Modul kann nicht lesen |
| `ItemWriter` | Statements anlegen/bearbeiten | Statement-Schreibaktionen deaktiviert |
| `RelationRecordCapable` | Votes je Statement beobachten | VoteBar ausblenden |
| `RelationRecordWriterCapable` | Stimmen setzen/ändern/zurückziehen | Voten deaktiviert |
| `Authenticatable` | Vote-Identität, eigene Stimme markieren | Voten deaktiviert (Votes sind identitätsgebunden — ohne Identität kein Vote) |
| `ProfileCapable` | Voter-Namen im Tooltip | Fallback auf DIDs |

## Aktionen

| Aktion | Voraussetzung | Effekt |
|---|---|---|
| Statement einbringen | `ItemWriter` | `createItem(type: "statement")` |
| Statement bearbeiten | `ItemWriter` + Berechtigung | `updateItem`; Historie über das Activity-Log |
| Stimme abgeben | `RelationRecordCapable` + `RelationRecordWriterCapable` + `Authenticatable` | `createRelationRecord` (kanonische ID, `createdBy` aus der Identität); der Record entsteht im Owner-Space des Statements |
| Stimme ändern | dito + Autorschaft | `updateRelationRecord` auf den eigenen Record |
| Stimme zurückziehen | dito + Autorschaft | `deleteRelationRecord` auf den eigenen Record |

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
| `VoteBar` (Toolkit) | Verteilungsbalken grün/gelb/rot + Vote-Buttons; sitzt im `footerAdornment` der `ItemPreview`; Tooltip mit Voter-Namen je Stufe (`useVoteUsers`); `stopPropagation` auf Interaktionen | ja |
| `useVotes` (Toolkit) | Vote-Lesen/Schreiben/Aggregation über die Relation-Store-Fassade (optimistisches Overlay, Write-Chain; Schreibentscheidung gegen frisch gelesene Records) | ja |
| `useVoteUsers` (Toolkit) | reaktive, transparente Voter-Liste (abonniert die Records) | ja |

Karten werden ausschließlich aus `ItemPreview` gebaut
(siehe [shared-components.md](./shared-components.md)); die VoteBar ist
ein Adornment, keine eigene Kartenform.

## Activity-Log

Der Connector schreibt Activity automatisch (create/update/delete).
`deriveActivitySummary` erhält einen Zweig für Relation-Items mit
`data.predicate === "votesOn"` analog zum Reaction-Zweig, damit im Log
„Zustimmung zu ‚…‘" statt eines leeren Eintrags steht. Die Edit-Historie
eines Statements ist das Activity-Log; das Modul führt keine eigene
Historie.

## Cross-Module-Verhalten

- **Die Detailansicht folgt dem Item, nicht dem Modul** (#203): ein
  Statement zeigt seine VoteBar im geteilten Detail-Panel, egal aus
  welchem Modul es geöffnet wurde — eine Typ-Regel wie Task-Assignees.
- **Statements erscheinen im Feed** (Schema-Union über `statement/v1`, siehe Datenmodell) und
  tragen dort die VoteBar direkt auf der Karte: die Karte ist die Umfrage.
  Reaktionen bleiben daneben verfügbar (Reaktionen sind nicht typabhängig).
- Ein Statement mit `data.status` darf im Kanban erscheinen, mit
  `data.start` im Kalender (generische Feldpräsenz-Regeln); das Modul
  definiert dazu nichts Eigenes.
- Vote-Records sind reine Relations-Träger (`type: "relation"`) und
  erscheinen in keiner Modul-Ansicht (kein `content`, `status`, `start`,
  `location`).

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

- Vote-Vertrag (Validierung, Dedupe, Input): `packages/data-interface/src/votes.ts`
- Relation-Store-Fassade: `packages/data-interface/src/relation-records.ts` + Spec 08
- Optimistik/Write-Chain-Vorlage: `packages/toolkit/src/hooks/use-reactions.ts`
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
