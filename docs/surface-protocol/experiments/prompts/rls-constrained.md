# Prompt: RLS-gebundenes Oberflächenkonzept

Du entwirfst ein Oberflächenkonzept für den Real Life Stack. Nutze denselben
Produktkontext wie im offenen Prompt, bleibe jetzt aber innerhalb der aktuellen
RLS-Architektur und ihrer Oberflächenannahmen.

## Produktkontext

Das Produkt unterstützt lokale Communities, Commons, reale Zusammenarbeit,
Veranstaltungen, Projekte, Ressourcen, Angebote, Bedürfnisse, Quests und
Vertrauensbeziehungen.

Es soll Menschen helfen, von digitaler Orientierung in echte Begegnung und
reales Handeln zu kommen. Die Software soll die Gemeinschaft unterstützen, ohne
selbst zum Mittelpunkt der Gemeinschaft zu werden.

## RLS-Architekturvorgaben

Nutze dieses Modell:

```text
UI-Module -> Hooks -> DataInterface -> Connector -> Datenquelle
```

Nimm an:

- UI-Module sind pure UI.
- Module nutzen Hooks, nicht direkt Connectoren.
- Daten werden als generische Items dargestellt.
- Eine Gruppe/ein Space ist die wichtigste Kontextgrenze.
- Dasselbe Item kann in mehreren Modulen erscheinen.
- Connector-Fähigkeiten bestimmen, welche Aktionen verfügbar sind.
- Das Toolkit stellt wiederverwendbare Layout-, Modul- und Item-Komponenten
  bereit.

## Bestehende Oberflächenvorgaben

Nimm eine RLS-App-Shell an mit:

- oberer Navigation,
- User-Menü,
- Space-/Workspace-Switcher,
- Modulnavigation,
- optionaler Sidebar,
- mobiler Bottom-Navigation,
- Content-Bereich, der nie hinter Navigationselementen liegt,
- AdaptivePanel-Verhalten für Detailansichten, Composer und sekundäre
  Arbeitsflüsse.

Nimm diese wiederkehrenden Module an:

- Feed
- Karte
- Kalender
- Kanban
- Profil
- Dashboard
- Quests
- Marktplatz
- Benachrichtigungen

Nimm diese wiederkehrenden Item-Oberflächen an:

- Item-Vorschau,
- Item-Detail,
- ContentComposer,
- Kommentare,
- Reaktionen,
- Veranstaltungsaktionen,
- Mitglieder-/Teilnehmerlisten,
- Mediengalerie,
- Standort- und Navigationsaktionen.

## Gewünschtes Ergebnis

Bitte erstelle:

1. Ein kompaktes RLS-konformes Oberflächenkonzept.
2. AppShell-Struktur und responsives Verhalten.
3. Space-Wechselmodell.
4. Eine Idee für Modul-Manifeste: Was deklariert jedes Modul?
5. Ein Item-View-Modell: Vorschau, Detail, Composer, Aktionen.
6. Darstellung von Vertrauen, Zustimmung und Human Gates.
7. Was in einem zukünftigen Surface Blueprint maschinenlesbar sein sollte.
8. Was designer-kontrolliert bleiben sollte.
9. Risiken, offene Fragen und Validierungsregeln.

Bevorzuge konkrete Interface-Struktur statt Marketing-Sprache. Erzeuge keine
Landing Page. Entwirf die tatsächliche nutzbare App-Erfahrung.
