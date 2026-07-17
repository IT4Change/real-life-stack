# Kanban / Tasks Module

**Status:** Normativer Entwurf v0.2

Das Kanban / Tasks Module ist eine feldbasierte Board-Ansicht im Current
Space. Es projiziert Nicht-Relation-Items in Spalten; welches Feld die
Spalte bestimmt, ist über `statusField` konfigurierbar.

## Zweck

Das Standard-Tasks-Board beantwortet im Current Space die Frage:

> Woran arbeiten wir, in welchem Workflow-Zustand ist es, und was bewegt
> sich als Nächstes?

Dieselbe Komponente darf außerdem eine fachliche, read-only Gruppierung
zeigen. Beispiel: Eine Ressourcen-Linse gruppiert Ressourcen nach `kind`
(`tool`, `space`, `skill`). Das macht aus `kind` weder einen Task-Status
noch eine mutierbare Workflow-Semantik. Das Netzwerk-Board selbst zeigt die
echten Camp-Aufgaben als schreibbaren Standard-Workflow.

## Einordnung

| Frage | Antwort |
|---|---|
| Space Module? | Ja |
| App-Shell-Fläche? | Nein |
| Module Components | KanbanBoard, KanbanCard, KanbanToolbar, KanbanTaskForm, KanbanCardDetail |
| Primäre Datenbasis | Nicht-Relation-Items, optional Relations und Profile/User |
| Externe Semantik | optional RLNP/Game/WoT-Projektionen, aber nicht durch Kanban definiert |

## Datenmodell und Konfiguration

`KanbanBoard.statusField` bestimmt das Spaltenfeld und defaultet auf
`"status"`. Ein Item ist nur dann in einer Board-Spalte verwertbar, wenn
es kein `type: "relation"` ist, sein konfiguriertes Feld einen nicht-leeren
String trägt **und der Wert einer konfigurierten Spalte entspricht**. Items
ohne verwertbares Feld oder mit nicht konfiguriertem Wert erscheinen nicht.
Legacy-Werte `todo` und `doing` werden lesend normalisiert.

| Feld | Bedeutung im Kanban |
|---|---|
| `data.title` | Kartentitel |
| `data.description` / `data.content` | Beschreibung oder Kontext |
| `data[statusField]` | Spaltenzuordnung; im Standard `data.status` |
| `data.order` | Reihenfolge innerhalb einer Spalte, ausschließlich beim schreibbaren Task-Workflow (siehe [task/v1](../schemas/vocab/task/v1/schema.json)); nicht `data.position` |
| `tags` | Top-level am Item, Themen oder Labels — siehe [07-tags.md](../07-tags.md) |
| `data.commentCount` | optionale Kommentar-Zusammenfassung |
| `createdAt` | Fallback-Sortierung, Detailanzeige und in read-only Boards primärer Sortierschlüssel |
| `createdBy` | Ursprung oder Autor |

Für `statusField="status"` folgen die Default-Spalten dem `status`-Enum
aus [task/v1](../schemas/vocab/task/v1/schema.json): `open`,
`in-progress`, `done` (`archived` ist gültig, erscheint aber nicht in der
Default-UI und wird nicht implizit in eine andere Spalte einsortiert). Apps
oder Spaces dürfen Spalten explizit konfigurieren.

Für ein anderes `statusField` konfigurieren Apps die Spalten oder leiten
sie aus den vorkommenden verwertbaren Werten ab. Diese Feld-Konfiguration
ändert keine Vocabulary-Zugehörigkeit. Die task/v1-Aktivierung bleibt
**feldbasiert** (bewusste Entscheidung gegen Typ-Bindung): JEDES Item,
dessen `data.status` einen Task-Enum-Wert trägt, aktiviert task/v1 und
gehört auf das Default-Board — unabhängig vom `type`. Andere Felder
(z. B. `kind`) aktivieren task/v1 dagegen nie, auch wenn ihre Werte
zufällig im Task-Enum liegen. Fachliche Zustände wie `kind`, Completion,
Review, Verifikation oder Attestation werden nicht stillschweigend zu
`data.status`.

## Workflow- und Read-only-Regeln

1. Im schreibbaren Standard-Tasks-Board beschreibt `data.status` die
   Position im Board-Workflow.
2. `data.status` darf nicht als Quest-Completion, pädagogischer Abschluss,
   Prüfung oder Attestation interpretiert werden.
3. `data.order` ordnet nur den schreibbaren Workflow innerhalb einer
   Spalte und hat keine fachliche Bedeutung außerhalb dieses Boards.
4. `statusField` darf auf ein anderes Feld zeigen, ohne dessen
   Fachsemantik umzudeuten.
5. `readOnly` unterbindet Drag-and-drop, Move- und External-Drop-Aktionen
   unabhängig davon, ob ein `ItemWriter` vorhanden ist.
6. Read-only Boards sortieren Karten deterministisch: `createdAt` ASC,
   dann `data.title` ASC, dann `id` ASC. Sie schreiben weder das
   konfigurierte Feld noch `data.order`.
7. Drag-and-drop ist im schreibbaren Board nur eine UI-Interaktion; die
   dauerhafte Wahrheit liegt erst nach erfolgreicher Connector-Mutation
   vor.

## Capabilities

| Capability | Verhalten, wenn vorhanden | Verhalten, wenn fehlt |
|---|---|---|
| `DataInterface` | Items lesen und beobachten | Board kann nicht sinnvoll rendern |
| `ItemWriter` | Im schreibbaren Tasks-Board Items erstellen, bearbeiten, verschieben oder löschen | Board read-only anzeigen; Drag, Create, Edit und Delete ausblenden oder deaktivieren |
| `RelationCapable` | Kommentare, Zuweisungen und verwandte Items laden | relationale Details ausblenden oder nur eingebettete `item.relations[]` anzeigen |
| `GroupManager` | Space-/Group-Kontext, Mitglieder oder Spaltenkonfiguration laden | Current Space und Konfiguration müssen von App Shell oder Props kommen |
| `Authenticatable` | Current User für neue Tasks oder Zuweisungen nutzen | auf vorhandene IDs fallbacken; nutzerbezogene Aktionen ggf. ausblenden |
| `ProfileCapable` | Assignees mit Profilinformationen anzeigen | IDs oder einfache User-Daten anzeigen |
| `ConfirmationCapable` | bestätigte Ereignisse oder Trust-Hinweise anzeigen | Confirmation-bezogene Anzeigen ausblenden |

Ein explizites `readOnly` ist stärker als jede Schreib-Capability: Eine
Linse bleibt eine Sichtweise und führt keine Mutation aus.

## Aktionen

| Aktion | Voraussetzung | Effekt |
|---|---|---|
| Board lesen | `DataInterface` | Nicht-Relation-Items mit verwertbarem `data[statusField]` anzeigen |
| Karte öffnen | Item vorhanden | Detailansicht oder Zielmodul öffnen |
| Task erstellen | `ItemWriter`, schreibbares Standard-Board, ggf. `Authenticatable` | Item mit `type: "task"` erstellen |
| Karte verschieben | `ItemWriter`, schreibbares Board | `data.status` und `data.order` aktualisieren |
| Karte bearbeiten | `ItemWriter`, schreibbares Board | `data.title`, `data.description`, `tags` oder andere UI-Felder aktualisieren |
| Karte zuweisen | `ItemWriter`, schreibbares Board, optional `RelationCapable` | `assignedTo`-Relation oder äquivalente Projektion aktualisieren |
| Karte löschen | `ItemWriter`, schreibbares Board | Item löschen, wenn die App diese Aktion erlaubt |

Read-only Boards bieten ausschließlich „Board lesen“ und „Karte öffnen“.
Mutationen laufen über Hooks oder Capability-Interfaces; das Modul kennt
keine backend-spezifischen Schreibpfade.

## Cross-Module-Verhalten

Das Kanban / Tasks Module darf Items aus anderen Space Modules anzeigen
oder dorthin öffnen, ohne deren Semantik zu besitzen.

- Ein Task mit `start` / `end` kann zusätzlich im Calendar erscheinen.
- Ein Task mit `location` kann zusätzlich in der Map erscheinen.
- Ein QuestRun kann im Standard-Board erscheinen, wenn er bewusst
  `data.status` als Board-Workflow trägt, ohne dass Kanban die
  Quest-Completion definiert.
- Ein Ressourcen-Board mit `statusField="kind"` gruppiert nur seine
  Ressource-Felder; es führt kein `data.status` und kein `data.order` ein.
- Kommentare und Reaktionen können über Feed-Komponenten oder verwandte
  Components dargestellt werden.

Die konkrete Navigation ist App- oder Shell-Verantwortung.

## Komponenten

| Komponente | Rolle | Wiederverwendbar? |
|---|---|---|
| `KanbanBoard` | Spalten, Karten, optionales Drag-and-drop und Board-Layout; `statusField` + `readOnly` | ja |
| `KanbanCard` | kompakte Item-Karte im Board | ja |
| `KanbanToolbar` | Filter und Board-Werkzeuge für vollständige, schreibbare Module | ja |
| `KanbanTaskForm` | Task erstellen oder bearbeiten | ja |
| `KanbanCardDetail` | Detailansicht einer Karte | ja |

Eine read-only Lens bindet keine `KanbanToolbar` ein.

## Nicht-Ziele

Das Kanban / Tasks Module definiert nicht:

- eine globale Projektmanagement-Methode,
- verbindliche Workflow-Spalten für alle Spaces,
- eine Umdeutung beliebiger Fachfelder zu Task-Status,
- RLNP-Quest-Completion,
- pädagogische Bewertung,
- WoT-Attestation-Formate,
- Berechtigungs- oder Safety-Policies,
- backend-spezifische Tabellen, Mutations oder Drag-and-drop-Protokolle.

## Implementierungsreferenzen

- `packages/toolkit/src/components/kanban/`
- `packages/toolkit/src/components/kanban/kanban-board.tsx`
- `packages/toolkit/src/components/kanban/kanban-task-create.tsx`
- `packages/toolkit/src/components/kanban/kanban-card-detail.tsx`
- `packages/toolkit/src/hooks/use-items.ts`
- `packages/toolkit/src/hooks/use-mutations.ts`

## Offene Punkte

1. Wo liegt die Spaltenkonfiguration langfristig: `Group.data.modules`,
   eigenes Item oder App-Konfiguration?
2. Soll `data.order` global pro Board, pro Status-Spalte oder pro Space
   eindeutig sein? (Heute nur im schreibbaren Standard-Workflow pro
   Status-Spalte; read-only Boards verwenden keine Order-Mutation.)
3. Wie wird Cross-Space-Drag-and-drop sauber projiziert, wenn ein
   Connector `ItemGroupCapable` unterstützt?
4. Welche Aufgabenfelder gehören in v0 verbindlich zur Task-Projektion und
   welche bleiben app-spezifisch?
