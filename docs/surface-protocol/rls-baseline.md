# RLS-Bestandsaufnahme

Status: Inventar der heutigen Architektur, kein neuer Vorschlag.

Dieses Dokument hält fest, was der Real Life Stack heute bereits annimmt. Ein
zukünftiges Oberflächenprotokoll sollte auf diesen Annahmen aufbauen oder
explizit benennen, wo sie verändert werden sollen.

## Bestehende Architektur

Real Life Stack ist ein modularer App- und UI-Baukasten für lokale
Communities, Commons und dezentrale Zusammenarbeit.

Der zentrale Datenfluss lautet:

```text
UI-Module -> Hooks -> DataInterface -> Connector -> Datenquelle
```

Relevante bestehende Quellen:

- `AGENTS.md`
- `docs/agent-workspace.md`
- `docs/spec/architektur2.md`
- `docs/spec/reaktivitaet.md`
- `docs/modules/`
- `docs/concepts/`
- `packages/data-interface/`
- `packages/toolkit/`
- `apps/reference/`

## Bestehende Oberflächen-Annahmen

### App-Shell

Die aktuelle App-Shell enthält:

- obere Navigationsleiste,
- User-Menü,
- Workspace- oder Space-Switcher,
- Modulnavigation,
- optionale Sidebar,
- mobile Bottom-Navigation,
- Content-Bereich, der nie hinter Navigationselementen liegt.

### Spaces / Gruppen

RLS nutzt im DataInterface aktuell `Group` als Datenform. In der
Produktsprache entspricht das oft einem Space: einem Kontext für eine Gruppe,
Initiative, ein Projekt, einen lokalen Kreis, eine Veranstaltung oder eine
Community.

Relevante Eigenschaften, die bereits unterstützt oder erwartet werden:

- `id`
- `name`
- `members`
- `data.description`
- `data.imageUrl`
- `data.memberCount`
- `data.access`
- `data.modules`
- `data.roles`

### Items

Alles Nutzerseitige wird als `Item` modelliert:

```ts
interface Item {
  id: string
  type: string
  createdAt: string
  createdBy: string
  schema?: string
  schemaVersion?: number
  data: Record<string, unknown>
  relations?: Relation[]
  _source?: string
}
```

Der `type` bestimmt semantisches Rendering. Felder in `data` bestimmen, in
welchen Modulen ein Item erscheinen kann:

- `status` -> Kanban
- `start` / `end` -> Kalender
- `location` -> Karte
- `content` -> Feed

Ein Item kann gleichzeitig in mehreren Modulen erscheinen.

### Module

Bestehende und erwartete Module sind unter anderem:

- Feed
- Karte
- Kalender
- Kanban
- Profil
- Dashboard
- Quests
- Marktplatz
- Benachrichtigungen

Module sollen pure UI bleiben. Sie nutzen Hooks und dürfen nicht wissen,
welcher Connector oder welches Backend die Daten liefert.

### Hooks und Fähigkeiten

Hooks leben in `packages/toolkit` und sind dünne React-Adapter über
Connector-APIs. Connectoren stellen Fähigkeiten über Interfaces und
Feature-Items bereit.

Oberflächen-Generierung sollte diese Grenzen nicht umgehen:

- `ConnectorProvider`
- `useItems`
- `useItem`
- `useCreateItem`
- `useUpdateItem`
- `useRelatedItems`
- `useGroups`
- `useMembers`
- Fähigkeitsprüfungen und Feature-Items

### Item-Views

Die bestehenden Modul-Dokumente beschreiben bereits wiederkehrende
Oberflächenmuster für Items:

- Vorschaukarte,
- Detailansicht,
- ContentComposer,
- Kommentare,
- Reaktionen,
- AdaptivePanel,
- veranstaltungsspezifische Aktionen,
- Mitglieder- und Teilnehmerlisten,
- Mediengalerie,
- Standort- und Navigationsaktionen.

### Design-Entscheidungen

`packages/toolkit/docs/UI-REQUIREMENTS.md` hält aktuell atomare
Design-Entscheidungen fest, zum Beispiel Schatten, Fokus-Verhalten,
Navbar-Verhalten, Cards, Typografie, Farben, Dark Mode und Asset-Pfade.

Zukünftige Oberflächen-Spezifikationen sollten trennen zwischen:

- semantischer Oberflächenstruktur,
- Interaktionsmustern,
- visuellen Designentscheidungen,
- Theme-Tokens,
- konkreten Implementierungskomponenten.

## Aktuelle Spannung

RLS hat bereits starke Layout-Annahmen. Gleichzeitig möchte das Team offen
erkunden, ob andere Oberflächenmodelle bessere Ideen liefern. Der Arbeitsablauf
sollte deshalb zwei Stränge getrennt halten:

- freie Exploration ohne bestehende RLS-Layoutvorgaben,
- RLS-gebundene Protokollarbeit auf Basis des aktuellen Toolkits und
  Datenmodells.
