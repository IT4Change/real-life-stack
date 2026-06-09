# Kanban / Tasks Module

**Status:** Normativer Entwurf v0.1

Das Kanban / Tasks Module ist eine feldbasierte Workflow-Ansicht im Current Space. Es macht Items mit Kanban-kompatiblem `data.status` als Spalten-Board sichtbar und bedienbar.

## Zweck

Das Modul beantwortet im Current Space die Frage:

> Woran arbeiten wir, in welchem Zustand ist es, und was bewegt sich als Nächstes?

Es unterstützt:

- statusfähige Items nach Workflow-Status zu scannen,
- Items zwischen Workflow-Spalten zu bewegen,
- einfache Task-Erstellung und Task-Bearbeitung als Standardaktion,
- Zuweisungen, Tags, Beschreibungen und Kommentare sichtbar zu machen,
- Items aus anderen Modulen als workflowfähige Karten darzustellen.

## Einordnung

| Frage | Antwort |
|---|---|
| Space Module? | Ja |
| App-Shell-Fläche? | Nein |
| Module Components | KanbanBoard, KanbanCard, KanbanToolbar, KanbanTaskForm, KanbanCardDetail |
| Primäre Datenbasis | Items, optional Relations und Profile/User |
| Externe Semantik | optional RLNP/Game/WoT-Projektionen, aber nicht durch Kanban definiert |

## Datenmodell

Das Kanban / Tasks Module liest Items im Current Space, die ein Kanban-kompatibles `data.status` tragen. Es ist damit nicht primär typbasiert, sondern feldbasiert.

Der Standardfall ist:

```text
type: "task"
```

Andere Item-Typen dürfen erscheinen, wenn sie bewusst einen Board-Workflow über `data.status` projizieren. Entscheidend ist nicht der Item-Typ, sondern ob das Item im aktuellen Space sinnvoll in die konfigurierten Spalten einsortiert werden kann.

| Feld | Bedeutung im Kanban |
|---|---|
| `data.title` | Kartentitel |
| `data.description` / `data.content` | Beschreibung oder Kontext |
| `data.status` | Spaltenzuordnung |
| `data.order` | Reihenfolge innerhalb einer Spalte (siehe [task/v1](../schemas/vocab/task/v1/schema.json); nicht `data.position` — das ist in [place/v1](../schemas/vocab/place/v1/schema.json) der GeoJSON-Punkt) |
| `data.tags` | Themen, Labels oder Filter |
| `data.commentCount` | optionale Kommentar-Zusammenfassung |
| `createdAt` | Erstellzeitpunkt, Fallback-Sortierung oder Detailanzeige |
| `createdBy` | Ursprung oder Autor |

Die Default-Spalten folgen dem `status`-Enum aus [task/v1](../schemas/vocab/task/v1/schema.json): `open`, `in-progress`, `done` (`archived` ist gültig, erscheint aber nicht in der Default-UI). Eine App oder ein Space darf andere Spalten konfigurieren. Spalten sind UI-Workflow-Zustände, keine universellen sozialen Zustände. Legacy-Werte (`todo`, `doing`) werden lesend auf das Enum abgebildet und beim nächsten Schreiben migriert (Self-Healing, siehe `normalizeStatus` im Toolkit).

Wichtig:

- Wenn ein QuestRun, Evidence-, Project- oder Post-Item ein Kanban-kompatibles `data.status` trägt, darf es im Kanban erscheinen.
- Wenn ein solches Item nicht im Kanban erscheinen soll, soll es keinen Kanban-Status in `data.status` tragen, sondern eine fachlich spezifischere Projektion nutzen.
- Fachliche Zustände wie Completion, Review, Verifikation oder Attestation dürfen nicht stillschweigend mit `data.status` gleichgesetzt werden.

Relations:

| Relation | Bedeutung |
|---|---|
| `assignedTo` | Karte ist einer globalen Identität oder Person zugewiesen |
| `commentOn` | Kommentare zur Karte |
| domänenspezifische Relations | dürfen angezeigt, aber nicht durch Kanban fachlich definiert werden |

Confirmations können im Kanban sichtbar werden, z.B. als Badge oder Hinweis auf eine bestätigte Handlung. Ein Status wie `done` ist aber keine Confirmation und keine WoT-Attestation.

## Workflow-Regeln

1. `data.status` beschreibt die Position in einem Board-Workflow und macht ein Item kanbanfähig.
2. `data.status` darf nicht als Quest-Completion, pädagogischer Abschluss, Prüfung oder Attestation interpretiert werden.
3. `data.order` ordnet Items innerhalb einer Spalte und hat keine fachliche Bedeutung außerhalb des Boards.
4. Spaltennamen und Spaltenreihenfolge dürfen space-spezifisch konfiguriert werden.
5. Drag-and-drop ist eine UI-Interaktion; die dauerhafte Wahrheit liegt erst nach erfolgreicher Connector-Mutation vor.

## Capabilities

| Capability | Verhalten, wenn vorhanden | Verhalten, wenn fehlt |
|---|---|---|
| `DataInterface` | Items lesen und beobachten | Board kann nicht sinnvoll rendern |
| `ItemWriter` | Tasks erstellen; kanbanfähige Items bearbeiten, verschieben oder löschen | Board read-only anzeigen; Drag, Create, Edit und Delete ausblenden oder deaktivieren |
| `RelationCapable` | Kommentare, Zuweisungen und verwandte Items laden | relationale Details ausblenden oder nur eingebettete `item.relations[]` anzeigen |
| `GroupManager` | Space-/Group-Kontext, Mitglieder oder Spaltenkonfiguration laden | Current Space und Konfiguration müssen von App Shell oder Props kommen |
| `Authenticatable` | Current User für neue Tasks oder Zuweisungen nutzen | auf vorhandene IDs fallbacken; nutzerbezogene Aktionen ggf. ausblenden |
| `ProfileCapable` | Assignees mit Profilinformationen anzeigen | IDs oder einfache User-Daten anzeigen |
| `ConfirmationCapable` | bestätigte Ereignisse oder Trust-Hinweise anzeigen | Confirmation-bezogene Anzeigen ausblenden |

## Aktionen

| Aktion | Voraussetzung | Effekt |
|---|---|---|
| Board lesen | `DataInterface` | Items mit Kanban-kompatiblem `data.status` im Current Space anzeigen |
| Karte öffnen | Item vorhanden | Detailansicht oder Zielmodul öffnen |
| Task erstellen | `ItemWriter`, ggf. `Authenticatable` | Item mit `type: "task"` oder konfiguriertem Typ erstellen |
| Karte verschieben | `ItemWriter` | `data.status` und `data.order` aktualisieren |
| Karte bearbeiten | `ItemWriter` | `data.title`, `data.description`, `data.tags` oder andere UI-Felder aktualisieren |
| Karte zuweisen | `ItemWriter`, optional `RelationCapable` | `assignedTo`-Relation oder äquivalente Projektion aktualisieren |
| Karte löschen | `ItemWriter` | Item löschen, wenn die App diese Aktion erlaubt |

Mutationen laufen über Hooks oder Capability-Interfaces. Das Kanban / Tasks Module darf keine backend-spezifischen Schreibpfade kennen.

## Cross-Module-Verhalten

Das Kanban / Tasks Module darf Items aus anderen Space Modules anzeigen oder dorthin öffnen, ohne deren Semantik zu besitzen.

Beispiele:

- Ein Task mit `start` / `end` kann zusätzlich im Calendar erscheinen.
- Ein Task mit `location` kann zusätzlich in der Map erscheinen.
- Ein QuestRun kann als Karte erscheinen, wenn er `data.status` als Board-Workflow trägt, ohne dass Kanban die Quest-Completion definiert.
- Ein Projekt-Item kann im Feed, in der Map oder im Kanban sichtbar sein.
- Kommentare und Reaktionen können über Feed-Komponenten oder verwandte Components dargestellt werden.

Die konkrete Navigation ist App- oder Shell-Verantwortung.

## Komponenten

| Komponente | Rolle | Wiederverwendbar? |
|---|---|---|
| `KanbanBoard` | Spalten, Karten, Drag-and-drop und Board-Layout | ja |
| `KanbanCard` | kompakte Item-Karte im Board | ja |
| `KanbanToolbar` | Filter und Board-Werkzeuge | ja |
| `KanbanTaskForm` | Task erstellen oder bearbeiten | ja |
| `KanbanCardDetail` | Detailansicht einer Karte | ja |

## Nicht-Ziele

Das Kanban / Tasks Module definiert nicht:

- eine globale Projektmanagement-Methode,
- verbindliche Workflow-Spalten für alle Spaces,
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

1. Wo liegt die Spaltenkonfiguration langfristig: `Group.data.modules`, eigenes Item oder App-Konfiguration?
2. Soll `data.order` global pro Board, pro Status-Spalte oder pro Space eindeutig sein? (Implementierung heute: pro Status-Spalte, Indizes werden beim Drop neu vergeben — siehe `computeColumnReorder`)
3. Wie wird Cross-Space-Drag-and-drop sauber projiziert, wenn ein Connector `ItemGroupCapable` unterstützt?
4. Welche Aufgabenfelder gehören in v0 verbindlich zur Task-Projektion und welche bleiben app-spezifisch?
