# App Composition

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt, wie eine RLS-App strukturiert ist. Sie definiert die Trennung zwischen App Shell, Current Space, Space Modules und Module Components.

Code-Referenzen:

- `packages/toolkit/src/components/layout/`
- `packages/toolkit/src/components/feed/`
- `packages/toolkit/src/components/kanban/`
- `packages/toolkit/src/components/calendar/`
- `packages/toolkit/src/components/map/`
- `packages/toolkit/src/components/detail/` — modul-agnostisches Detail-Panel
- `packages/toolkit/src/hooks/`
- `apps/reference/src/App.tsx` — Komposition: Provider, AuthGate, App Shell
- `apps/reference/src/views/` — ein File pro Space Module + `module-outlet.tsx` (Dispatch)
- `apps/reference/src/hooks/use-workspace-routing.ts` — Space/Module-Auflösung aus URL

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

## Overlay-Flächen (Panels, Dialoge, Notifications)

Overlays folgen einem Drei-Ebenen-Modell. Pro Ebene gibt es höchstens **eine** Fläche; Ebenen dürfen einander überlagern, weil sie sichtbar von anderer Art sind.

Persistente App-Chrome (Navbar, BottomNav) ist keine Overlay-Ebene, sondern der Rahmen, in dem die Ebenen leben. Ihre direkt geöffneten Menüs, Popovers und Tooltips bilden eine eigene, oberste Schicht (siehe Regel 7 und die z-Index-Spalte).

Die z-Index-Spalte nennt die heute im Code vergebenen Werte (`packages/toolkit/src/components/primitives/` und `layout/`). Normativ ist die **Reihenfolge**: Chrome unter den Overlay-Ebenen, Ebene 1 unter Ebene 2, Chrome-Menüs oben.

| Ebene | Fläche | Form | z-Index | Inhalt |
|---|---|---|---|---|
| Chrome (Rahmen) | Navbar, BottomNav | persistente Leisten | `z-40` | Navigation, Space Switcher, User Menu; lebt unter den Overlay-Ebenen |
| 1 Content-Panel | eine app-weite Instanz | Sidebar (Desktop) ↔ Drawer (Mobile) | `z-55` | Item-Detail, Composer, Filter — Content wird getauscht, nie gestapelt |
| 2 Dialog | eine Instanz | zentriertes Modal + Backdrop (Desktop) / Sheet (Mobile) | `z-60`/`z-65` | fokussierte Tasks: Kontakte, Verifizieren, Gruppe, Profil |
| 3 Notification | nicht-destruktiver Hinweis | Banner / Toast | über Ebene 2 | zeitkritische Interrupts: eingehende Verifizierung, Space-Einladung |
| Chrome-Menü / Popover / Tooltip | portalisiert, an Chrome-Trigger gebunden | Dropdown, Popover, Tooltip | `z-70` | User Menu, Tooltips, Status-Popovers; portalisiert, nie im `z-40`-Kontext eingesperrt |

Regeln:

1. **Eine Fläche pro Ebene.** Gleichartige Flächen werden nie gestapelt — das verhindert „Panel über Panel" strukturell, nicht per z-index.
2. **Das Content-Panel ist persistent.** Es bleibt beim Modul-Wechsel offen und hält, was der Nutzer zuletzt geöffnet hat, bis er schließt oder anderen Content öffnet.
3. **Dialoge überlagern, ersetzen nicht.** Ein abgedunkeltes Modal liest sich als höhere Ebene und erhält den Content darunter. Ein Dialog ist nie eine zweite Sidebar.
4. **Interrupts stehlen nie den Kontext.** Ebene 3 ersetzt nie Ebene-1/2-Content und nimmt keinen Fokus; der Nutzer öffnet sie bewusst, der Flow landet dann in Ebene 2.
5. **Verschachtelte Flows pro Ebene laufen über einen Back-Stack** (z.B. Kontakte → Verifizieren → zurück), nie über eine zweite gleichartige Fläche.
6. Overlays sind **Präsentation, nie Aktivierung** — welche Items ein Modul zeigt, entscheidet Feld-Präsenz (siehe [06-schema-composition.md](06-schema-composition.md)), nie eine Overlay-Fläche.
7. **Persistente Chrome bleibt erreichbar.** Navbar, BottomNav und ihre direkt geöffneten Menüs, Popovers und Tooltips MÜSSEN über bzw. erreichbar neben den Ebene-1-Content-Panels bleiben. Ein Chrome-Menü (z.B. das User Menu) MUSS portalisiert auf der obersten Schicht (`z-70`) liegen und DARF NICHT im `z-40`-Stacking-Context der Navbar eingesperrt werden, sonst öffnet es hinter einem `z-55`-Content-Panel.
8. **Folge-Inhalt stapelt nicht in derselben Ebene.** Innerhalb einer Ebene wird KEINE zweite gleichartige Fläche geöffnet. Ein aus einer Fläche aufgerufener Folge-Inhalt MUSS entweder den Inhalt derselben Fläche per Back-Stack tauschen (Regel 5) ODER auf eine andere Ebene wechseln (Ebene-1-Content-Panel). Ein Profil, das aus der Kontaktliste (Ebene 2) geöffnet wird, DARF NICHT als zweiter Dialog über dem Kontakte-Dialog erscheinen.
9. **Ebene-Wechsel ist explizit.** Wechselt ein Flow von Ebene 2 in ein Ebene-1-Content-Panel (oder umgekehrt), SOLL die Ausgangsfläche geschlossen oder sichtbar zurückgesetzt werden, damit nie zwei fokussierte Flächen denselben Kontext beanspruchen.

### Ebene 3: Interrupt-Notifications

Ebene 3 trägt eingehende, zeitkritische Events, die nicht aus einer Nutzer-Aktion stammen: Counter-Verification, Space-Invite, Mutual-Verification (im Code `incoming-verification`, `space-invite`, `mutual-verification`, siehe `packages/toolkit/src/hooks/use-incoming-events.tsx`).

Diese Subsektion beschreibt das **Ziel-Verhalten**. Bekannte Divergenz zum heutigen Ist-Zustand: `apps/reference/src/App.tsx` rendert die Events aktuell als echte modale Radix-Dialoge (`IncomingVerificationDialog`, `IncomingSpaceInviteDialog`, `MutualVerificationDialog` via `open={!!...}`); eine Toast- oder Banner-Fläche existiert im Toolkit noch nicht.

Regeln:

1. Ein eingehendes Event MUSS nicht-destruktiv erscheinen: als Hinweis, Toast oder Banner. Es DARF NICHT automatisch ein Modal öffnen, das den laufenden Kontext (Ebene 1 oder Ebene 2) ersetzt oder den Fokus zieht.
2. Der Nutzer entscheidet, wann er reagiert. Erst seine Aktion auf der Notification öffnet den zugehörigen Flow in Ebene 2 (z.B. Verifizieren-Dialog).
3. Ebene 3 ist abgegrenzt von Ebene 1 (persistenter, vom Nutzer geöffneter Content) und Ebene 2 (vom Nutzer gestartete, fokussierte Tasks): Ebene 3 ist System-initiiert und passiv, bis der Nutzer sie aufgreift.
4. Mehrere gleichzeitige Events SOLLEN als Liste oder gestapelte Hinweise innerhalb der einen Notification-Fläche erscheinen, nicht als mehrere konkurrierende Modals.

### ARIA-Konventionen

Overlay-Flächen folgen den WAI-ARIA Authoring Practices (APG). Nur Verweis und wichtigste Pflichten:

1. **Dialoge** (Ebene 2) folgen dem APG-Pattern *Dialog (Modal)*: `role="dialog"` mit `aria-modal="true"`, Fokus beim Öffnen in den Dialog, Fokus-Trap, Esc schließt, Fokus-Rückgabe zum auslösenden Element.
2. **Chrome-Menüs** (User Menu, Aktionsmenüs) folgen *Menu* und *Menu Button*: `aria-haspopup`, Pfeiltasten-Navigation, Esc schließt und gibt den Fokus an den Trigger zurück.
3. **Tooltips** folgen *Tooltip*: per Hover und Fokus erreichbar, Esc blendet aus, kein Fokus-Fang.
4. Diese Pflichten sind in den Radix-basierten Primitives `Dialog`, `DropdownMenu` und `Tooltip` (`packages/toolkit/src/components/primitives/`) bereits umgesetzt; Overlays SOLLEN diese Primitives nutzen, statt das Verhalten neu zu bauen.

### Content-Bereich

Der Content-Bereich ist die Fläche unterhalb der Top-Navigation, links einer rechten Sidebar und rechts einer linken Sidebar. Er rückt automatisch ein, wenn eine Sidebar öffnet (die Panel-Fläche publiziert ihre Breite als CSS-Variable, die der Content als Padding konsumiert); sonst ist er eine `flex-1`-Spalte.

Module wählen einen **Füllmodus** im Content-Bereich: *full-bleed* (füllt die Fläche randlos, z.B. Map) oder *zentrierter Container* (Standard, z.B. Feed, Calendar, Kanban). Full-bleed räumt auf Mobile auch unter die BottomNav.

### Verworfene Alternativen

Festgehalten, damit sie nicht neu aufgemacht werden:

- **Panel-Provider pro View:** jedes Modul mountete sein eigenes Panel, Debug/Profil separat — verursachte die gleichseitige Überlagerung und verlor die modulübergreifende Persistenz.
- **Debug nach links:** links ist für ein späteres Nav-Menü reserviert, und eine nicht-modale Dev-Sidebar neben dem Content ist dasselbe Anti-Pattern; das eine rechte Panel zu teilen ist sauberer.
- **Reines Flex-Row mit Sidebars als Flex-Children:** der Mobile-Drawer/Modal kann kein Flex-Child sein, also bräuchte es trotzdem die Overlay-Ausnahme; das CSS-Var-Inset liefert denselben Content-Bereich (inkl. links).
- **Dialoge als `AdaptivePanel`s / ein Stack für alles:** Dialoge sind immer zentrierte Modals (nie Sidebar/Drawer); und Interrupts in das eine Panel zu falten ließe ein System-Event den Nutzer-Kontext verdrängen.

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
| Calendar | zeitliche Monats-, Wochen-, Tages- oder Listenansicht auf Events, Quests oder Campaign-Phasen | Items mit `start` / `end` |
| Kanban / Tasks | Aufgaben- und Workflow-Ansicht | Items mit `status` |
| Marketplace | Angebote, Bedürfnisse, Ressourcen und mögliche Matches | Items, Profilfelder, Tags oder Relations |
| Quests | Quest-Übersicht, Questlog, QuestRuns, Evidence und Completion-Status | RLNP-Items und Confirmations |
| Campaign View | Adventures, Campaigns und World State | Game-Projektionen über Items, Relations und Confirmations |

## Module Components

Module Components sind wiederverwendbare Bausteine innerhalb von Space Modules. Sie können in mehreren Modulen auftauchen, sind aber nicht selbst pro Space aktivierbare Oberflächen.

Geteilte Bausteine, die mehr als ein Modul nutzt, sind in [modules/shared-components.md](modules/shared-components.md) normativ definiert (Vertrag, Slot-Konvention, Datenanker pro Komponente und pro Hook). Diese Sektion gibt die taxonomische Einordnung.

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
- [modules/calendar.md](modules/calendar.md)

## Offene Punkte

Diese Spec definiert die Taxonomie. Detail-Specs für weitere Space Modules können später folgen.

Mögliche spätere Dokumente:

- `modules/map.md`,
- `modules/marketplace.md`,
- `modules/quests.md`,
- `modules/campaign-view.md`.
