# RLS Modules

**Status:** Historisches Brainstorming / Inspirationsmaterial

Dieser Ordner enthält frühe Modulideen aus der Zeit vor der heutigen Abgrenzung zwischen Real Life Stack, Real Life Network Protocol und Real Life Game.

Die Dokumente in diesem Ordner sind aktuell keine Modul-Spezifikation. Sie können hilfreiche Produktideen, User Stories oder UI-Impulse enthalten, aber sie definieren keine verbindlichen Space Modules und keine fachliche Semantik.

Aktuelle Modul-Taxonomie steht in [../spec/01-app-composition.md](../spec/01-app-composition.md). Neue verbindliche Space-Module-Specs entstehen unter [../spec/modules/](../spec/modules/).

- App Shell = globaler, space-übergreifender Rahmen,
- Space Module = pro Space aktivierbare Oberfläche,
- Module Component = wiederverwendbarer Baustein innerhalb von Modulen.

Für neue Modul-Arbeit gilt:

1. Space Modules sind UI- und Interaktionsbausteine innerhalb eines Space.
2. Space Modules arbeiten gegen Hooks, `DataInterface` und Capability-Interfaces.
3. Space Modules besitzen keine Backend-Annahmen.
4. Space Modules besitzen nicht die soziale Semantik von RLNP.
5. Space Modules besitzen nicht die Spielregeln des Real Life Game.
6. App-Shell-Flächen wie Profile, Contacts, Verification und Auth sind keine Space Modules.
7. Alte Inhalte in diesem Ordner dürfen als Inspiration genutzt werden, müssen aber frisch gegen die heutige Spec geprüft werden.

Normative Grundlage:

- [../spec/README.md](../spec/README.md)
- [../spec/00-architecture.md](../spec/00-architecture.md)
- [../spec/01-app-composition.md](../spec/01-app-composition.md)
- [../spec/modules/README.md](../spec/modules/README.md)
