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
| Module Components | Unterordner innerhalb von Space Modules oder geteilte Toolkit-Komponenten | FeedItem, ContentComposer, ReactionBar, CommentSection, KanbanCard, KanbanToolbar |
| Primitives | `packages/toolkit/src/components/primitives/` | Button, Card, Dialog, Input, Tabs |
| Hooks | `packages/toolkit/src/hooks/` | useItems, useComments, useReactions, useConfirmations |

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
