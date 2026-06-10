# Code and Storybook Mapping

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt, wie die App-Komposition des Real Life Stack auf Code und Storybook abgebildet wird.

Die Source of Truth bleibt die Spec:

- [00-architecture.md](00-architecture.md)
- [01-app-composition.md](01-app-composition.md)
- [modules/](modules/)

Storybook ist keine eigene Spezifikation. Storybook macht die Spec visuell prüfbar und navigierbar.

## Code-Mapping

Der Toolkit-Code muss die RLS-Taxonomie nicht in jedem Ordnernamen exakt spiegeln. Wichtiger ist, dass jedes Bauteil fachlich eindeutig eingeordnet ist.

| RLS-Ebene | Typische Code-Orte | Beispiele |
|---|---|---|
| App Shell | `packages/toolkit/src/components/layout/`, `auth/`, `contacts/`, `debug/` | Navbar, BottomNav, WorkspaceSwitcher, UserMenu, ProfileDialog, ContactsDialog, VerificationDialog, DebugDashboard |
| Space Modules | `packages/toolkit/src/components/feed/`, `kanban/`, `calendar/`, `map/` | Feed, Kanban / Tasks, Calendar, Map |
| Module Components | geteilte Top-Level-Ordner (`comments/`, `reactions/`, `composer/`, `detail/`) oder Unterordner innerhalb von Space Modules | FeedItem, ContentComposer, ReactionBar, CommentSection, KanbanCard, KanbanToolbar, ItemDetailPanel |
| Primitives | `packages/toolkit/src/components/primitives/` | Button, Card, Dialog, Input, Tabs |
| Hooks | `packages/toolkit/src/hooks/` | useItems, useComments, useReactions, useConfirmations |
| Logik-Helfer (modulübergreifend) | `packages/toolkit/src/lib/` | applyItemListFilter (Display-Filter), parseEventDate / isAllDayDate |
| Logik-Helfer (modulgebunden) | im jeweiligen Modul-Ordner, z.B. `components/kanban/reorder.ts` | computeColumnReorder, normalizeStatus |

In der Reference-App spiegelt sich die Taxonomie so:

| App-Ebene | Code-Ort |
|---|---|
| Komposition (Provider, AuthGate, App Shell) | `apps/reference/src/App.tsx` |
| Space-Module-Instanzen (eine Datei pro Modul) | `apps/reference/src/views/feed-view.tsx`, `kanban-view.tsx`, `calendar-view.tsx`, `map-view.tsx` |
| Modul-Dispatch (welches Modul rendert, wie es den Space füllt) | `apps/reference/src/views/module-outlet.tsx` |
| Space/Module-Routing (URL → aktiver Space + Modul) | `apps/reference/src/hooks/use-workspace-routing.ts` |

Regeln:

1. App-Shell-Flächen sind nicht pro Space aktivierbare Module.
2. Space Modules sind pro Space aktivierbare Oberflächen.
3. Module Components sind wiederverwendbare Bausteine innerhalb oder zwischen Space Modules.
4. Primitives kennen keine RLS-Semantik.
5. Hooks gehören zur RLS-Hook-Schicht, nicht zur Modul-Taxonomie.
6. Physische Ordner dürfen pragmatisch bleiben, solange Spec, Exports und Storybook die Einordnung klar machen.

## Storybook-Mapping

Storybook soll die RLS-Taxonomie sichtbar machen. Story-Titel verwenden diese Top-Level-Struktur:

```text
RLS
├─ App Shell
├─ Space Modules
├─ Module Components
└─ Primitives
```

Namensregeln:

| Ebene | Storybook-Prefix | Beispiel |
|---|---|---|
| App Shell | `RLS/App Shell/...` | `RLS/App Shell/Navigation/Navbar` |
| Space Module Overview | `RLS/Space Modules/{Module}/Overview` | `RLS/Space Modules/Kanban/Overview` |
| Space Module Component | `RLS/Space Modules/{Module}/{Component}` | `RLS/Space Modules/Kanban/Board` |
| Geteilte Module Component | `RLS/Module Components/{Group}/{Component}` | `RLS/Module Components/Reactions/ReactionBar` |
| Primitive | `RLS/Primitives/{Component}` | `RLS/Primitives/Button` |

Storybook darf dieselbe Komponente mehrfach zeigen, wenn dadurch unterschiedliche RLS-Kontexte klarer werden. Beispiel: `ReactionBar` kann als generische Module Component erscheinen und später zusätzlich in einer Feed-Overview verwendet werden.

## Overview Stories

Jedes Space Module soll langfristig eine Overview-Story haben.

Eine Overview-Story zeigt:

1. das Modul als Oberfläche im Space-Kontext,
2. typische Items oder Projektionen,
3. wichtige Module Components im Zusammenspiel,
4. sinnvolles Degradationsverhalten, wenn Features fehlen,
5. keine Backend-spezifische Logik.

Overview-Stories sind visuelle Einstiegspunkte, keine Integrationstests und keine Backend-Simulation.

## Kanban-Referenzmapping

Kanban / Tasks ist das erste abgerundete Referenzmodul für diese Mapping-Regeln. Es zeigt, wie ein Space Module aus wiederverwendbaren Module Components, generischen Items und optionalen Capabilities zusammengesetzt wird.

| Spec-Begriff | Code | Storybook | Daten-/Capability-Annahme |
|---|---|---|---|
| Kanban / Tasks Space Module | `packages/toolkit/src/components/kanban/kanban-module.stories.tsx` | `RLS/Space Modules/Kanban/Overview` | Items im Current Space mit Kanban-kompatiblem `data.status` |
| Board-Layout | `kanban-board.tsx` | `RLS/Space Modules/Kanban/Board` | `Item.data.status`, `Item.data.order`, optional `relations: assignedTo` und `users` |
| Filter/Werkzeuge | `kanban-toolbar.tsx` | `RLS/Space Modules/Kanban/Toolbar` | Items, optionale `users`, optionaler `currentUserId`; Mutationen werden über Callbacks/Capabilities angebunden |
| Task-Erstellung/Bearbeitung | `kanban-task-create.tsx` | Modulkomponente; in späteren Stories direkt prüfbar | `ItemWriter` für persistente Erstellung/Bearbeitung; App entscheidet über erlaubte Felder |
| Kartendetail | `kanban-card-detail.tsx` | Modulkomponente; in späteren Stories direkt prüfbar | Item-Daten, optional `users`, Tags, Status und Assignee-Relations |

Die Kanban-Komponenten stellen ihren eigenen Container-Query-Kontext bereit, damit sie auch außerhalb der App Shell, z.B. in Storybook oder eingebetteten Modulflächen, korrekt zwischen mobiler und breiter Darstellung wechseln.

## Feed-Referenzmapping

Feed ist das Referenzmodul für einen generischen Aktivitäts- und Inhaltsstrom im Current Space. Es zeigt Items unterschiedlicher Typen als Stream, ohne selbst neue Fachobjekte zu erfinden.

| Spec-Begriff | Code | Storybook | Daten-/Capability-Annahme |
|---|---|---|---|
| Feed Space Module | `packages/toolkit/src/components/feed/feed-module.stories.tsx` | `RLS/Space Modules/Feed/Overview` | Feed-fähige Items im Current Space, sortiert nach `createdAt` |
| Feed Item | `feed-item.tsx` | In der Overview als Standardprojektion verwendet | Generisches `Item` mit `data.title`, `data.content` oder `data.description`; type-spezifische Metadaten bleiben optional |
| Composer | `feed/feed-composer-trigger.tsx` (Feed-Trigger), `composer/content-composer.tsx` (geteilt) | `RLS/Module Components/ContentComposer` und Feed-Overview | Persistente Erstellung braucht später `ItemWriter`; die Story hält neue Items nur lokal |
| Reaktionen | `components/reactions/` (geteilt) | `RLS/Module Components/Reactions/...`; in der Overview als statischer Slot sichtbar | Optional über `RelationCapable`/`reactsTo`; Feed bleibt nutzbar ohne Relations |
| Kommentare | `components/comments/` (geteilt) | `RLS/Module Components/Comments/CommentSection` | Optional über `RelationCapable`/`commentOn`; FeedItem kann Kommentaranzahlen anzeigen |
| PostCard | `post-card.tsx` | `RLS/Module Components/Feed/PostCard` | Spezifische ältere Post-Projektion; nicht die kanonische generische Feed-Projektion |

Die Feed-Overview darf keine Backend-Simulation erzwingen. Sie zeigt das Zusammenspiel von Composer, FeedItem und optionalen Social Slots; echte Mutationen, Relations und Confirmations werden über Connector-Capabilities angebunden.

## Calendar-Referenzmapping

Calendar ist das Referenzmodul für zeitliche Projektionen im Current Space. Es zeigt Items unterschiedlicher Typen als Monats-, Wochen-, Tages- oder Listenansicht, wenn sie ein parsebares `data.start` tragen.

| Spec-Begriff | Code | Storybook | Daten-/Capability-Annahme |
|---|---|---|---|
| Calendar Space Module | `packages/toolkit/src/components/calendar/calendar-module.stories.tsx` | `RLS/Space Modules/Calendar/Overview` | Items im Current Space mit `data.start`, optional `data.end` |
| Header und Ansichtsauswahl | `calendar-view.tsx` | `RLS/Space Modules/Calendar/Overview` | UI-Zustand steuert Zeitraum, Monat/Woche/Tag/Liste und Heute-Sprung |
| Filter | `calendar-view.tsx` | `RLS/Space Modules/Calendar/Overview` | Typ-, Orts- und Current-User-Filter bleiben lokal; Persistenz ist App-/Shell-Verantwortung |
| Monatsansicht | `calendar-view.tsx` | `RLS/Space Modules/Calendar/Overview` | `Item.data.start` gruppiert Events nach Kalendertag; Event-Pills öffnen das Item |
| Wochen-/Tagesansicht | `calendar-view.tsx` | `RLS/Space Modules/Calendar/Overview` | Zeitgebundene Items werden auf einfache Zeitslots projiziert |
| Eventliste | `calendar-view.tsx` | `RLS/Space Modules/Calendar/Overview` | Zeitgebundene Items im sichtbaren Zeitraum, sortiert und nach Tag gruppiert |
| Event-Erstellung/Bearbeitung | `CalendarView` Create-Hook, später über `ContentComposer` | Create-Hook sichtbar, Persistenz noch nicht abgebildet | Persistente Erstellung braucht `ItemWriter`; Calendar bleibt ohne Writer read-only |
| Teilnehmer/Bestätigungen | spätere Module Components | noch nicht abgebildet | Optional über `RelationCapable` und `ConfirmationCapable` |

Die Calendar-Overview orientiert sich am Edge-Prototyp unter `https://real-life-stack.de/edge/` (Navigation `Kalender`), bleibt aber technisch eine backend-agnostische Projektion über generische Items.

## Nicht-Ziele

Diese Spec definiert nicht:

- eine Pflicht zur sofortigen Ordner-Umstrukturierung,
- eine vollständige Storybook-Abdeckung für alle Komponenten,
- visuelles Design,
- Backend- oder Connector-Mocks als Norm,
- Produktnavigation einzelner Apps.

## Offene Punkte

1. Ob `components/auth/` dauerhaft App Shell bleibt oder später stärker WoT-spezifisch ausgelagert wird.
2. Ob einzelne Module Components, z.B. `ReactionBar`, eigene geteilte Code-Ordner bekommen sollen.
3. Ob Storybook später automatisiert gegen die Spec-Module-Liste geprüft werden soll.
