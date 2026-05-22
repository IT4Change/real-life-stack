# Surface- und Module-Audit

**Status:** Arbeitsstand, nicht normativ  
**Stand:** 2026-05-22

Diese Bestandsaufnahme ordnet die vorhandenen RLS-Oberflächen gegen die aktuelle Taxonomie ein:

```text
App Shell / Space Modules -> Module Components -> Primitives
                         -> Hooks -> DataInterface -> Connector
```

Sie ist keine neue Spezifikation. Sie zeigt, wo Spec, Code und Storybook bereits zusammenpassen und wo der nächste spec-driven Slice sinnvoll ist.

## Quellen

Berücksichtigt wurden:

- `docs/spec/00-architecture.md`
- `docs/spec/01-app-composition.md`
- `docs/spec/02-data-interface.md`
- `docs/spec/03-capabilities.md`
- `docs/spec/04-items-relations-groups-spaces.md`
- `docs/spec/05-confirmations-and-trust.md`
- `docs/spec/modules/feed.md`
- `docs/spec/modules/kanban.md`
- `docs/spec/modules/calendar.md`
- `docs/spec/code-and-storybook-mapping.md`
- `packages/toolkit/src/components/`
- `packages/toolkit/src/hooks/`
- `packages/data-interface/src/index.ts`
- `apps/reference/src/App.tsx`

`apps/prototype/` und der alte Ordner `docs/modules/` wurden nur als historische Inspiration betrachtet, nicht als Quelle für den aktuellen RLS-Vertrag.

## Gesamtbild

Der aktuelle Kern ist konsistent:

1. RLS ist ein backend-agnostischer UI- und App-Baukasten.
2. App Shell ist der globale Rahmen.
3. Space Modules leben im Current Space.
4. Module Components sind wiederverwendbare Bausteine innerhalb dieser Module.
5. Hooks übersetzen Connector-Observables und Capabilities in React.
6. RLS besitzt nicht die Semantik von RLNP, Real Life Game oder Web of Trust; RLS macht sie darstellbar und bedienbar.

Der größte offene Bereich ist nicht die Architektur, sondern die Abdeckung: Es gibt mehr Code als frische Modul-Specs und mehr Komponenten als sauber eingeordnete Storybook-Flächen.

## App Shell

| Fläche | Spec-Abdeckung | Code | Storybook | Einordnung | Audit |
|---|---|---|---|---|---|
| AppShell / AppShellMain | `01-app-composition.md` | `components/layout/app-shell.tsx` | fehlt als eigene Overview | App Shell / Layout | Stabiler Grundrahmen, aber keine sichtbare App-Shell-Overview. |
| Navbar | `01-app-composition.md` | `components/layout/navbar.tsx` | ja | App Shell / Navigation | Gut eingeordnet. |
| BottomNav | `01-app-composition.md` | `components/layout/bottom-nav.tsx` | ja | App Shell / Navigation | Gut eingeordnet. |
| ModuleTabs | `01-app-composition.md` | `components/layout/module-tabs.tsx` | indirekt über Reference App | App Shell / Modulnavigation | Story fehlt. |
| WorkspaceSwitcher | `01-app-composition.md` | `components/layout/workspace-switcher.tsx` | fehlt | App Shell / Space-Wechsel | Wichtig für Spaces, sollte eigene Story bekommen. |
| GroupDialog | `01-app-composition.md`, `04-items-relations-groups-spaces.md` | `components/layout/group-dialog.tsx` | fehlt | App Shell / Space-Konfiguration | Zentral, aber noch nicht visuell prüfbar. Enthält aktuell die aktivierbaren Module `feed`, `kanban`, `calendar`, `map`. |
| UserMenu / ProfileDialog | `01-app-composition.md`, `03-capabilities.md` | `components/layout/user-menu.tsx`, `profile-dialog.tsx` | fehlt | App Shell / User/Profile | Fachlich richtig in App Shell, Storybook-Lücke. |
| Contacts / Verification | `01-app-composition.md`, `03-capabilities.md` | `components/contacts/` | fehlt | App Shell / Kontakte und Verifikation | Fachlich keine Space Modules. Storybook-Lücke trotz hoher Produktrelevanz. |
| Incoming Events | `01-app-composition.md`, `03-capabilities.md` | `use-incoming-events.tsx`, Incoming-Dialoge | fehlt | App Shell / Notifications | Capability-getrieben, aber nicht als Surface sichtbar dokumentiert. |
| Relay / Connector Status | `03-capabilities.md` | `relay-status-badge.tsx`, `connector-switcher.tsx` | fehlt | App Shell / Connector-Status | Dev- und Statusfläche; Storybook-Lücke. |
| DebugDashboard | `01-app-composition.md` | `components/debug/` | fehlt | App Shell / Debug/Admin | Korrekt nicht als Space Module, aber nicht abgebildet. |

**Einschätzung:** Die App-Shell-Taxonomie ist geklärt, aber Storybook zeigt nur Layout-Fragmente. Es fehlt eine App-Shell-Overview, die Navigation, Space-Wechsel, User-Menü, BottomNav und Statusflächen zusammen sichtbar macht.

## Space Modules

| Modul | Spec-Abdeckung | Code | Storybook | Backend-Agnostik | Audit |
|---|---|---|---|---|---|
| Feed | `modules/feed.md` | `components/feed/`, Reference App `FeedView` | Overview vorhanden | gut, über Items, Slots, Hooks und optionale Capabilities | Referenzmodul. Kommentare/Reaktionen sind in der Overview bewusst nur als Slots sichtbar; echte Connector-Stories fehlen noch. |
| Kanban / Tasks | `modules/kanban.md` | `components/kanban/`, Reference App `KanbanView` | Overview, Board, Toolbar vorhanden | gut, statusfähige Items plus optionale Relations/Profile/Groups | Referenzmodul. TaskForm und CardDetail brauchen eigene Stories. |
| Calendar | `modules/calendar.md` | `components/calendar/calendar-view.tsx`, Prototype-Referenz unter `apps/prototype/src/components/calendar/` | Overview vorhanden | gut, feldbasiert über `data.start` / `data.end`, optional Ort und Tags | Drittes Referenzmodul; Monat/Woche/Tag/Liste, Filter und Create-Hook sind sichtbar. Persistente Create/Edit-Flows und Teilnahme-/Confirmation-Slots fehlen noch. |
| Map | fehlt | `components/map/index.ts` ist Platzhalter, Reference App hat interne Placeholder-Map | fehlt | noch nicht belastbar | Erst Spec, dann Toolkit-Komponente. `apps/prototype/` kann Inspiration liefern, aber nicht übernommen werden. |
| Marketplace | fehlt | kein Toolkit-Modul | fehlt | offen | Fachlich relevant, aber braucht zuerst soziale Abgrenzung von Offer/Need/Commons und Item-Projektionen. |
| Quests | fehlt im RLS, Semantik liegt in RLNP | kein Toolkit-Modul | fehlt | offen | Sollte erst nach stabiler RLNP-Quest-Spec und RLS-Projektionsentscheidung kommen. |
| Campaign View | fehlt im RLS, Semantik liegt im Game | kein Toolkit-Modul | fehlt | offen | Sollte erst nach Game-Spec weitergezogen werden. |

**Einschätzung:** Feed, Kanban und Calendar sind jetzt gute Referenzmodule. Map ist danach sinnvoll, braucht aber mehr Design- und Technikentscheidung.

## Module Components

| Component-Gruppe | Spec-Abdeckung | Code | Storybook | Audit |
|---|---|---|---|---|
| FeedItem | `modules/feed.md`, Mapping-Doku | `feed/feed-item.tsx` | in Feed-Overview | Kanonische generische Feed-Projektion. Eigene Component-Story wäre optional. |
| ContentComposer | `modules/feed.md`, `modules/kanban.md` | `feed/content-composer.tsx` | ja | Wichtiger wiederverwendbarer Baustein. Sollte langfristig nicht nur Feed-semantisch benannt sein. |
| FeedComposerTrigger | `modules/feed.md` | `feed/feed-composer-trigger.tsx` | in Feed-Overview | Gut als Feed-spezifischer Trigger, keine eigene Story nötig. |
| Comments | `modules/feed.md`, Relations-Capability | `feed/comments/` | ja | Hook-basiert über `RelationCapable`; braucht Degradationsstory ohne Relations. |
| Reactions | `modules/feed.md`, Relations-Capability | `feed/reactions/` | ja | Hook-basiert über `RelationCapable`; braucht Degradationsstory ohne Write/Relations. |
| Widgets | Feed/Composer-Kontext | `feed/widgets/` | teilweise | TextWidget hat Story; Date, Location, People, Tags, Status, Media und Group fehlen als eigene Stories. |
| KanbanBoard | `modules/kanban.md` | `kanban/kanban-board.tsx` | ja | Gute Referenz, inklusive responsive/Container-Verhalten. |
| KanbanToolbar | `modules/kanban.md` | `kanban/kanban-toolbar.tsx` | ja | Gute Referenz. |
| KanbanTaskForm | `modules/kanban.md` | `kanban/kanban-task-create.tsx` | fehlt | Relevante Lücke, weil Create/Edit ein Kernworkflow ist. |
| KanbanCardDetail | `modules/kanban.md` | `kanban/kanban-card-detail.tsx` | fehlt | Relevante Lücke, weil Detailflächen in der Reference App wichtig sind. |
| Dashboard Cards | keine Modul-Spec | `dashboard/` | ja | Sind Module Components, kein Space Module. Können später für Overview/Dashboard-Flächen genutzt werden. |

**Einschätzung:** Die wichtigsten Feed- und Kanban-Komponenten sind sichtbar, aber die Storybook-Abdeckung ist ungleichmäßig. Besonders `KanbanTaskForm`, `KanbanCardDetail` und die Composer-Widgets sind gute kleine Folge-Slices.

## Primitives

| Gruppe | Code | Storybook | Audit |
|---|---|---|---|
| Button, Card, Avatar, Input, Tabs, RelativeTime | vorhanden | ja | Gut abgedeckt. |
| Dialog, Sheet, DropdownMenu, Tooltip, Label, Separator, Skeleton, Textarea, Sidebar | vorhanden | fehlt | Kein Blocker, aber Basis-Storybook ist unvollständig. |

**Einschätzung:** Primitives sind nicht die höchste fachliche Priorität. Fehlende Stories können mitlaufen, wenn eine Modul-Story sie braucht.

## Hooks und Capabilities

| Bereich | Spec-Abdeckung | Code | Audit |
|---|---|---|---|
| ConnectorContext | Architektur / DataInterface | `connector-context.tsx` | Klar und schlank. |
| Items | `02-data-interface.md` | `use-items.ts` | Solide Read-Schicht. |
| Mutations | `03-capabilities.md` | `use-mutations.ts` | Wirft aktuell, wenn `ItemWriter` fehlt. Modul-UI sollte schreibende Aktionen vorher degradieren. |
| Groups / Spaces | `04-items-relations-groups-spaces.md` | `use-groups.ts`, `GroupDialog` | Gute Grundlage; Storybook-Lücke für Space-Konfiguration. |
| Auth / Current User | `03-capabilities.md` | `use-auth.ts` | App-Shell-relevant. |
| Contacts / Verification | `03-capabilities.md` | `use-contacts.ts`, `use-verification.ts` | App-Shell-relevant, keine Space Modules. |
| Messaging / Incoming Events | `03-capabilities.md` | `use-relay-status.ts`, `use-incoming-events.tsx` | Status-/Event-Flächen noch nicht Storybook-sichtbar. |
| Comments / Reactions | Feed-Spec + Relations | `use-comments.ts`, `use-reactions.ts` | Praktisch gut, aber Degradationsfälle sollten sichtbar werden. |
| Confirmations | `05-confirmations-and-trust.md` | `use-confirmations.ts` | UI-Nutzung noch dünn. Braucht später konkrete ConfirmationView-Komponenten. |

**Einschätzung:** Die Capability-Schicht passt grundsätzlich zur Spec. Die nächste Reife-Stufe ist nicht mehr neue Capability-Namen, sondern sichtbares Degradationsverhalten in Modulen.

## Reference App

Die Reference App zeigt bereits die Zielkomposition:

- `AppShell`,
- `Navbar`,
- `WorkspaceSwitcher`,
- `ModuleTabs`,
- `BottomNav`,
- Current Space über Route und Connector-Group,
- aktivierbare Module aus `Group.data.modules`,
- Feed, Kanban, Calendar und Map,
- Connector-Wechsel im Dev-Modus,
- globale Profile, Contacts, Verification, Incoming Events und Debug.

Sie ist aktuell aber mehr Produkt-/Integrationsfläche als Spec-Abbildung. Viele dort vorhandene Patterns sollten schrittweise in kleinere Toolkit-Stories und Modul-Specs zurückgeführt werden.

## Wichtigste Lücken

1. **Map ist in der Spec vorgesehen, aber im Toolkit nur Platzhalter.**
2. **App Shell ist konzeptionell sauber, aber Storybook zeigt keine vollständige Shell-Overview.**
3. **Space-Konfiguration über `Group.data.modules` ist praktisch implementiert, aber noch nicht als Surface sichtbar dokumentiert.**
4. **Capability-Degradation ist in Specs beschrieben, aber in Storybook kaum prüfbar.**
5. **KanbanTaskForm, KanbanCardDetail und mehrere Composer-Widgets fehlen als eigene Stories.**
6. **Calendar zeigt Lesen, Zeitraumwechsel, Filter und Create-Hook, aber noch keine persistenten Create/Edit- oder Teilnahme-/Confirmation-Flächen.**
7. **Confirmations sind spezifiziert und in Hooks vorhanden, aber noch kaum UI-sichtbar.**

## Empfohlene nächste Slices

### 1. App-Shell-Overview

Scope:

- Story `RLS/App Shell/Overview`,
- `AppShell`, `Navbar`, `WorkspaceSwitcher`, `ModuleTabs`, `UserMenu`, `BottomNav`, optional Relay-Status,
- rein prop-basiert, ohne Connector-Mock.

Warum:

- macht die Taxonomie sichtbar,
- klärt die Abgrenzung von Profile/Kontakte/Verification als App Shell,
- hilft, Storybook als Navigationskarte des RLS zu nutzen.

### 2. Kanban-Komponenten-Lücken schließen

Scope:

- Stories für `KanbanTaskForm`,
- Stories für `KanbanCardDetail`,
- Mapping-Doku ergänzen, wenn nötig.

Warum:

- kleiner Slice,
- direkt anschlussfähig an das Referenzmodul,
- macht Create/Edit/Detail als Kernworkflow prüfbar.

### 3. Calendar Composer/Edit und Teilnahme-Slots

Scope:

- Event-Erstellung/Bearbeitung über `ContentComposer` und `ItemWriter`,
- optionale Teilnehmer-/Confirmation-Anzeigen als Slots,
- klare Degradation ohne `ItemWriter`, `RelationCapable` oder `ConfirmationCapable`.

Warum:

- Calendar ist jetzt als Projektion mit Create-Hook sichtbar,
- der nächste Reifeschritt ist Schreib- und Sozialkontext ohne Backend-Annahme.

### 4. Capability-Degradation sichtbar machen

Scope:

- kleine Story-Harnesses oder Connector-Mocks für:
  - read-only Connector,
  - Connector ohne Relations,
  - Connector ohne Auth,
  - Connector ohne ItemWriter.

Warum:

- Backend-Agnostik wird praktisch prüfbar,
- verhindert UI, die still einen FullConnector voraussetzt.

### 5. Map zuerst spezifizieren, dann bauen

Scope:

- `docs/spec/modules/map.md`,
- Entscheidung über technische Map-Komponente später,
- `apps/prototype/` nur als Inspiration.

Warum:

- fachlich wichtig,
- aber technische Implementierung hat mehr Abhängigkeiten als Calendar.

## Vorschlag

Calendar steht jetzt als drittes Referenzmodul. Der nächste größere Orientierungsschnitt sollte App Shell sein:

```text
App-Shell-Overview -> Space-Konfiguration -> Capability-Degradation
```

Damit haben wir auf Modulebene drei unterschiedliche Modularten abgedeckt:

- Feed: zeitlicher Aktivitätsstrom,
- Kanban: feldbasierter Workflow,
- Calendar: zeitliche Projektion über Item-Felder.
