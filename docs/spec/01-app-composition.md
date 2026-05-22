# App Composition

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt, wie eine RLS-App strukturiert ist. Sie definiert die Trennung zwischen App Shell, Current Space, Space Modules und Module Components.

Code-Referenzen:

- `packages/toolkit/src/components/layout/`
- `packages/toolkit/src/components/feed/`
- `packages/toolkit/src/components/kanban/`
- `packages/toolkit/src/components/calendar/`
- `packages/toolkit/src/hooks/`
- `apps/reference/src/App.tsx`

## Grundstruktur

```text
App
├─ App Shell
│  ├─ Navigation
│  ├─ Space Switcher
│  ├─ User/Profile
│  ├─ Contacts/Verification
│  ├─ Notifications/Events
│  └─ Debug/Admin
└─ Current Space
   └─ Space Modules
      ├─ Feed
      ├─ Map
      ├─ Calendar
      ├─ Kanban
      ├─ Marketplace
      ├─ Quests
      └─ Campaign View
```

Jedes Space Module kann aus Module Components zusammengesetzt sein.

Kernregel:

```text
App Shell = globaler, space-übergreifender Rahmen
Space Module = pro Space aktivierbare Oberfläche
Module Component = wiederverwendbarer Baustein innerhalb von Modulen
```

## App Shell

Die App Shell ist der globale Rahmen einer RLS-App. Sie lebt nicht innerhalb eines einzelnen Space und ist nicht pro Space aktivierbar.

Zur App Shell gehören:

- Navigation,
- Space- oder Workspace-Wechsel,
- User Menu,
- Profilzugang,
- Kontakte,
- Verifikation,
- Auth,
- Notifications und eingehende Events,
- Relay-, Delivery- oder Sync-Status,
- globale Dialoge,
- Debug- und Adminflächen.

Regeln:

1. Die App Shell darf den aktuellen Space auswählen und anzeigen.
2. Die App Shell darf globale Connector-Capabilities nutzen, z.B. Auth, Contacts, Verification, Messaging oder Profile.
3. Die App Shell darf Space Modules aktivieren, deaktivieren oder navigierbar machen.
4. Die App Shell ist nicht selbst ein Space Module.
5. Funktionen wie Profile, Contacts, Verification oder Auth sind App-Shell-Flächen, auch wenn ihre Daten in Space Modules sichtbar werden können.

## Current Space

Der Current Space ist der aktuell ausgewählte Arbeits-, Sichtbarkeits- und Mitgliedschaftskontext. Im RLS-Code wird er technisch meist als `Group` abgebildet.

Regeln:

1. Space Modules arbeiten im Kontext des Current Space.
2. Welche Space Modules aktiv sind, kann über Space-/Group-Metadaten ausgedrückt werden, z.B. `Group.data.modules`.
3. Ein Space kann andere Module aktivieren als ein anderer Space.
4. Ein Netzwerk, Label oder White-Label-Kontext ist nicht automatisch ein Space. Er kann mehrere Spaces umfassen.

## Space Modules

Ein Space Module ist eine aktivierbare Oberfläche innerhalb eines Space.

Ein Space Module:

- erscheint typischerweise in Navigation, Tabs oder Space-Konfiguration,
- arbeitet gegen Hooks, `DataInterface` und optionale Capabilities,
- zeigt und bearbeitet Items, Relations, Confirmations oder andere Projektionen im Current Space,
- darf eigene UI-Zustände besitzen,
- darf keine Backend-Annahmen treffen,
- besitzt nicht die soziale Semantik von RLNP,
- besitzt nicht die Spielregeln des Real Life Game,
- besitzt nicht die kryptografische Wahrheit von WoT.

Beispiele:

| Space Module | Aufgabe | Grundlage |
|---|---|---|
| Feed | Aktivität, Posts, Events, Dokumentation, Kommentare, Reaktionen | Items und Relations |
| Map | räumliche Ansicht auf Orte, Events, Ressourcen oder Quests | Items mit `location` |
| Calendar | zeitliche Ansicht auf Events, Quests oder Campaign-Phasen | Items mit `start` / `end` |
| Kanban / Tasks | Aufgaben- und Workflow-Ansicht | Items mit `status` |
| Marketplace | Angebote, Bedürfnisse, Ressourcen und mögliche Matches | Items, Profilfelder, Tags oder Relations |
| Quests | Quest-Übersicht, Questlog, QuestRuns, Evidence und Completion-Status | RLNP-Items und Confirmations |
| Campaign View | Adventures, Campaigns und World State | Game-Projektionen über Items, Relations und Confirmations |

## Module Components

Module Components sind wiederverwendbare Bausteine innerhalb von Space Modules. Sie können in mehreren Modulen auftauchen, sind aber nicht selbst pro Space aktivierbare Oberflächen.

Beispiele:

- ItemPreview,
- ItemDetail,
- ContentComposer,
- FilterBar,
- CommentSection,
- ReactionBar,
- DateWidget,
- LocationWidget,
- PeopleWidget,
- Questlog.

Regeln:

1. Module Components sollen möglichst klein und wiederverwendbar bleiben.
2. Module Components dürfen Hooks nutzen, wenn sie dadurch eindeutig an den RLS-Kontext gebunden sind.
3. Allgemeine UI-Primitives bleiben außerhalb der Modul-Taxonomie.
4. Ein Component wird erst dann zu einem Space Module, wenn er als eigenständige, pro Space aktivierbare Oberfläche erscheint.

## Was kein Space Module ist

Nicht jedes sichtbare UI-Element ist ein Space Module.

| Oberfläche | Einordnung |
|---|---|
| AppShell, Navbar, BottomNav, ModuleTabs | App Shell / Layout |
| WorkspaceSwitcher | App Shell |
| UserMenu | App Shell |
| ProfileDialog | App Shell, kann in Modulen referenziert werden |
| ContactsDialog | App Shell |
| VerificationDialog | App Shell |
| RelayStatusBadge | App Shell / Connector-Status |
| DebugDashboard | App Shell / Debug/Admin |
| ItemPreview, ItemDetail, Composer, Questlog | Module Component |

## Abgrenzung zu RLNP, Game und WoT

Space Modules machen externe Semantik bedienbar, besitzen sie aber nicht.

| Ebene | Verantwortung |
|---|---|
| WoT | Identität, Kontakte, Verifikationen, Attestations, Sync |
| RLNP | soziale Semantik, Quests, Evidence, Completion, soziale Operationen |
| Real Life Game | Game Packs, Adventures, Campaigns, Progression, World State |
| RLS | App Shell, Space Modules, Module Components, Hooks und Connector-Projektionen |

Beispiel:

Ein Quests-Modul ist ein Space Module. Es darf Quests, QuestRuns, Evidence, Completion-Status und verschiedene Quest-Komponenten anzeigen und bedienbar machen. Ein Questlog ist darin eine mögliche Module Component, aber nicht selbst die ganze Modul-Ebene. Das Quests-Modul definiert nicht selbst, was eine Quest sozial bedeutet oder wann eine Quest als abgeschlossen gilt. Diese Semantik bleibt im RLNP.

## Modul-Detail-Specs

Verbindliche Detail-Specs für Space Modules entstehen unter [modules/](modules/). Der alte Ordner [../modules/](../modules/) bleibt historisches Brainstorming und Inspirationsmaterial.

Aktuell:

- [modules/template.md](modules/template.md)
- [modules/feed.md](modules/feed.md)
- [modules/kanban.md](modules/kanban.md)

## Offene Punkte

Diese Spec definiert die Taxonomie. Detail-Specs für weitere Space Modules können später folgen.

Mögliche spätere Dokumente:

- `modules/map.md`,
- `modules/calendar.md`,
- `modules/marketplace.md`,
- `modules/quests.md`,
- `modules/campaign-view.md`.
