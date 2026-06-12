# Unified Module UX (Juni 2026)

**Status:** Umgesetzt (Phase 1–3 abgeschlossen, einzelne Folge-Items als Backlog markiert)
**Bezug:** Normative Definition der geteilten Bausteine in [../spec/modules/shared-components.md](../spec/modules/shared-components.md)

## Ausgangslage

Jedes RLS-Modul (Feed, Kanban, Calendar, Map) rollte seine eigene Item-Card, seinen eigenen Filter und seinen eigenen Create-Trigger. Das skalierte weder für die UX noch für das Hinzufügen weiterer Module (Marketplace, Quests). Ziel des Sprints: ein Stack, in dem alle vier Module dieselben Shared Components für Preview, Detail, Create, Edit, Filter und Profile-Wiring benutzen — funktional einheitlich, Pixel-Polish bleibt Sebastian.

Sebastian war während des Sprints überlastet; Anton hat den Plan in eigener Verantwortung durchgezogen, mit zwei Sync-Punkten (11.06. Layout-Konsens, 12.06. ModulePanel + Such-Position + Moduleinstellungen). Sebastian macht später Visual-Polish über die fertigen Shared Components.

## Outcome — was umgesetzt wurde

### Shared Module Components (toolkit)

- **`ItemPreview`** + Adornment-Slots (`ItemTypeBadge`, `ItemMetaRow`, `ItemTimeRange`, `ItemCommentCount`, `ItemAssignees`) — eine Card für alle Module, mit `density`-Variante (comfortable/compact) für Kanban.
- **`ItemDetailPanel`** — geteiltes Detail, in allen vier Modulen aktiv.
- **`FilterBar`** + Building Blocks (`FilterChip`, `FilterMultiSelect`, `FilterToggle`, `FilterSection`) + `useFilterableItems` / `applyFilterBarValue`. Tag-Filter (AND), Type-Filter (OR), modul-spezifische Extras über `chipsExtra` / `drawerExtra`. Suche sitzt in `leadingActions` direkt neben dem Filter-Button.
- **`CreateFab`** — einheitlicher Floating-Action-Button unten-rechts, öffnet `useItemEditor`-Composer.
- **`ModulePanel`** (`ModulePanelProvider` + `useModulePanel`) — **eine** `AdaptivePanel`-Instanz pro Modul-Surface. Filter, Detail, Composer und Einstellungen swappen in dieselbe Instanz statt sich zu stapeln. Mobile: ein Drawer für alles.
- **`ModuleSettingsPlaceholder`** — Moduleinstellungs-Einstieg (Zahnrad → Panel), Platzhalter bis echte Settings existieren.
- **`useItemEditor`** — kapselt Composer-State, `@context`-Ableitung und createItem/updateItem-Dispatch; Composer schließt nur bei erfolgreichem Submit.

### Pro Modul

- **Feed:** FilterBar + Suche, ItemPreview-Cards, Detail über ModulePanel. `FeedComposerTrigger` bleibt primärer Create-Entry.
- **Kanban:** FilterBar mit „Nur meine Aufgaben" + Zuweisungs-Filter, Suche, CreateFab, Moduleinstellungen-Zahnrad (statt funktionslosem „Spalten bearbeiten"), Detail/Edit über ModulePanel mit Pinning.
- **Calendar:** FilterBar (Typ + Ort + „Nur meine"), Suche, CreateFab, Detail über ModulePanel.
- **Map:** FilterBar als Overlay über der Karte (Offset für Leaflet-Zoom-Controls), Suche, CreateFab, Marker-Klick → Detail über ModulePanel, Marker-Farbe aus Tag-Accent.

### Daten-Layer

- `ItemFilter.hasTag` im `data-interface` (AND-Filter), automatisch von allen Connectoren über `BaseConnector` geerbt.
- Persona-Avatare (Anton, Timo, Sebastian) als echte Portraits, BASE_URL-aware via `resolveAssetUrl`.

## Sebastian-Polish-Backlog

Bewusst offen gelassen, gehört in Sebastians UX-Lead-Verantwortung:

- Exakte Card-Höhen, Avatar-Größen, Hover-/Animation-Timing.
- **Feed-FAB:** ob Feed zusätzlich zum `FeedComposerTrigger` einen CreateFab bekommt (Konsistenz vs. Doppel-Trigger).
- **Map Marker-Click:** Popup-Zwischenstation vs. Direkt-Detail vs. Hybrid — drei Varianten in [../spec/modules/map.md](../spec/modules/map.md) § Offene Punkte 8 dokumentiert, Entscheidung steht aus.
- **Moduleinstellungen:** echte Inhalte pro Modul (Kanban: Spalten-Editor, Standard-Gruppierung, Spalten-Sichtbarkeit).
- FilterBar-Filter-Reichweite (Date-Range, Author) — bewusst weggelassen bis konkretes Bedürfnis.

## Folge-Themen (eigene PRs, nicht Teil des UX-Slices)

- **Profile-Wiring:** Avatar-Klicks (ItemPreview, Detail, CommentBubble, ItemAssignees) → ProfileDialog via `useOpenProfile`.
- **Seed-Versionierung:** `local`-Connector re-seedet nur bei leerem IndexedDB-Store; eine `seedVersion` würde Seed-Daten-Änderungen auch bei bestehendem Store greifen lassen (Demo-Stolperfalle).
- **Server-side Tag-Filter:** `useFilterableItems` clientseitig könnte `tags` in `ItemFilter.hasTag` hochziehen, sobald die UI-Patterns gefestigt sind.
