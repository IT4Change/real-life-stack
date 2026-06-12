# Space Module Specs

**Status:** Normative Detail-Specs im Aufbau

Dieser Ordner enthält die frischen Space-Module-Spezifikationen des Real Life Stack. Er ist Teil von `docs/spec/` und damit normativ für RLS-Implementierungen.

Der alte Ordner [../../modules/](../../modules/) bleibt historisches Brainstorming und Inspirationsmaterial. Neue verbindliche Moduldefinitionen entstehen hier.

## Grundlage

Space Modules sind pro Space aktivierbare Oberflächen. Sie arbeiten gegen Hooks, `DataInterface` und optionale Capability-Interfaces. Sie besitzen keine Backend-Annahmen und definieren nicht die soziale Semantik von RLNP, die Spielregeln des Real Life Game oder die kryptografische Wahrheit von WoT.

Grundlagen:

- [../00-architecture.md](../00-architecture.md)
- [../01-app-composition.md](../01-app-composition.md)
- [../02-data-interface.md](../02-data-interface.md)
- [../03-capabilities.md](../03-capabilities.md)
- [../04-items-relations-groups-spaces.md](../04-items-relations-groups-spaces.md)
- [../05-confirmations-and-trust.md](../05-confirmations-and-trust.md)

## Modul-Regeln

1. Ein Space Module lebt im Current Space.
2. Ein Space Module liest Daten über Hooks, `DataInterface` und optionale Capabilities.
3. Ein Space Module muss fehlende Capabilities sichtbar oder still degradierbar behandeln.
4. Ein Space Module darf unbekannte Item-Typen nicht brechen.
5. Ein Space Module darf soziale oder spielerische Bedeutung nur anzeigen, nicht selbst definieren.
6. App-Shell-Flächen wie Profile, Contacts, Verification, Auth, Notifications oder Debug/Admin sind keine Space Modules.
7. Module Components sind wiederverwendbare Bausteine innerhalb von Space Modules und werden nicht pro Space als eigene Module aktiviert.

## Aktuelle Modul-Specs

| Modul | Status | Zweck |
|---|---|---|
| [template.md](template.md) | Vorlage | Gemeinsames Raster für neue Space-Module-Specs |
| [feed.md](feed.md) | Normativer Entwurf v0.1 | Aktivitäts- und Inhaltsstrom im Current Space |
| [kanban.md](kanban.md) | Normativer Entwurf v0.1 | Workflow- und Aufgabenboard im Current Space |
| [calendar.md](calendar.md) | Normativer Entwurf v0.1 | Zeitliche Projektion von Items im Current Space |
| [map.md](map.md) | Normativer Entwurf v0.1 | Räumliche Projektion von Items + library-agnostischer Adapter |
| [shared-components.md](shared-components.md) | Normativer Entwurf v0.1 + implementiert | Geteilte Module Components und Hooks (Composer, Detail, Preview, FilterBar, CreateFab, ModulePanel, Editor, Item-Hooks) |

## Reihenfolge für neue Module

Neue Module sollen zuerst gegen [template.md](template.md) beschrieben werden. Erst danach sollte Code oder UI-Verhalten als verbindlich gelten.
