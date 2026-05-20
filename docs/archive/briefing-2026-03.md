# Briefing: Real Life Stack Entwicklung

> **Archiviert:** Dieses Dokument ist ein historisches Entwicklungsbriefing aus März 2026. Es ist nicht mehr normativ. Aktuelle Einstiegspunkte sind [../spec/README.md](../spec/README.md), [../spec/00-architecture.md](../spec/00-architecture.md) und [../agent-workspace.md](../agent-workspace.md).

> Dieses Dokument ist ein ausfuehrlicher Einstieg fuer Entwickler (und ihre AI-Assistenten),
> die am Real Life Stack mitarbeiten. Es erklaert das Gesamtbild, die bestehende Codebasis,
> die Architektur, und die konkreten naechsten Schritte.

**Stand:** 7. Maerz 2026

---

## 1. Was ist Real Life Stack?

Real Life Stack (RLS) ist ein modulares Framework fuer Community-Apps. Lokale Initiativen
(Gemeinschaftsgaerten, Repair-Cafes, Nachbarschaftshilfe) bekommen einen digitalen Werkzeugkasten,
der echte Begegnungen foerdert statt ersetzt.

**Kernprinzip:** Die UI-Module (Kanban, Kalender, Karte, Feed) arbeiten gegen ein einheitliches
`DataInterface`. Verschiedene Connectoren implementieren dieses Interface. Die UI weiss nicht,
woher die Daten kommen.

```text
UI-Module → Hooks → DataInterface → Connector → Datenquelle
```

---

## 2. Monorepo-Struktur

```text
real-life-stack/
├── packages/
│   ├── data-interface/      # TypeScript-Typen (DataInterface, Item, Group, ...)
│   ├── mock-connector/      # In-Memory-Implementierung mit Demo-Daten
│   └── toolkit/             # UI-Komponenten (shadcn/ui + Tailwind CSS v4)
├── apps/
│   ├── reference/           # Showcase-App (alle Module mit MockConnector)
│   ├── landing/             # Landing Page (real-life-stack.de)
│   └── prototype/           # Experimentelle UI-Konzepte
└── docs/
    ├── spec/README.md       # Normativer Spec-Einstieg
    ├── spec/00-architecture.md # Architekturanker
    ├── spec/architektur2.md # Historische Architektur-Referenz
    └── concepts/poc-plan.md # Implementierungsplan
```

**Package Manager:** pnpm 9+
**Build:** Turborepo
**Node:** 20+

```bash
pnpm install              # Dependencies
pnpm dev:reference        # Reference App (Vite, http://localhost:5173)
pnpm storybook            # Storybook (http://localhost:6006)
pnpm build                # Alles bauen
```

---

## 3. Die drei Packages

### 3.1 `@real-life-stack/data-interface`

Reine TypeScript-Typen, keine Runtime-Dependencies. Das ist der **Vertrag** zwischen UI und Backend.

**Wichtigste Typen:**

```typescript
interface Item {
  id: string
  type: string                    // "task", "event", "post", "place", "profile"
  createdAt: Date
  createdBy: string               // User-ID
  data: Record<string, unknown>   // Typ-spezifische Daten (title, status, ...)
  relations?: Relation[]          // Beziehungen zu anderen Items/Usern
  schema?: string                 // Optional: Schema-Bezeichner
  schemaVersion?: number
  _source?: string                // Nur lesen: Woher kommt das Item?
  _included?: Record<string, Item[]>  // Aufgeloeste Relations
}

interface Group {
  id: string
  name: string
  data?: Record<string, unknown>  // description, access, modules, roles, ...
}

interface User {
  id: string
  displayName?: string            // Cache aus Profil-Item
  avatarUrl?: string              // Cache aus Profil-Item
}

interface Observable<T> {
  current: T
  subscribe(callback: (value: T) => void): Unsubscribe
}
```

**DataInterface** — die zentrale API:

```typescript
interface DataInterface {
  // Lifecycle
  init(): Promise<void>
  dispose(): Promise<void>

  // Gruppen
  getGroups(): Promise<Group[]>
  getCurrentGroup(): Group | null
  setCurrentGroup(id: string): void
  createGroup(name: string, data?: Record<string, unknown>): Promise<Group>
  updateGroup(id: string, updates: Partial<Group>): Promise<Group>
  deleteGroup(id: string): Promise<void>
  getMembers(groupId: string): Promise<User[]>
  inviteMember(groupId: string, userId: string): Promise<void>
  removeMember(groupId: string, userId: string): Promise<void>

  // Items
  getItems(filter?: ItemFilter): Promise<Item[]>
  getItem(id: string): Promise<Item | null>
  observe(filter: ItemFilter): Observable<Item[]>
  observeItem(id: string): Observable<Item | null>
  createItem(item: Omit<Item, "id" | "createdAt">): Promise<Item>
  updateItem(id: string, updates: Partial<Item>): Promise<Item>
  deleteItem(id: string): Promise<void>

  // Relations
  getRelatedItems(itemId: string, predicate?: string, options?: RelatedItemsOptions): Promise<Item[]>

  // Auth
  getCurrentUser(): Promise<User | null>
  getAuthState(): Observable<AuthState>
  authenticate(method: string, credentials: unknown): Promise<User>
  logout(): Promise<void>
}
```

**Aendern nur nach Absprache mit dem Team.**

### 3.2 `@real-life-stack/mock-connector`

In-Memory-Implementierung des DataInterface. Fuer Entwicklung und Tests — kein Backend noetig.

```typescript
import { MockConnector } from "@real-life-stack/mock-connector"

const connector = new MockConnector()
await connector.init()

// Items laden
const tasks = await connector.getItems({ type: "task" })

// Reaktiv beobachten (fuer React-Hooks)
const obs = connector.observe({ type: "task" })
obs.subscribe((tasks) => { /* UI updaten */ })

// Item erstellen
const newTask = await connector.createItem({
  type: "task",
  createdBy: "user-1",
  data: { title: "Neuer Task", status: "todo", position: 0 }
})
```

**Enthaltene Demo-Daten:**

| Typ | Anzahl | Beispiele |
|-----|--------|-----------|
| task | 5 | "Beete vorbereiten", "Samen bestellen", ... |
| event | 2 | "Pflanzaktion", "Gartenplanung" |
| post | 3 | "Spaziergang im Park", "Hilfe beim Umzug", ... |
| place | 2 | "Gemeinschaftsgarten", "Cafe Nachbar" |
| feature | 1 | Feature-Item (Connector-Capabilities) |

Plus 3 Gruppen, 4 User, Gruppen-Mitgliedschaften.

Die Demo-Daten liegen in `packages/mock-connector/src/demo-data.ts` und koennen
erweitert werden.

### 3.3 `@real-life-stack/toolkit`

UI-Komponenten basierend auf shadcn/ui (Radix Primitives + Tailwind CSS v4).

**Layout-Komponenten** (schon fertig):

| Komponente | Beschreibung |
|------------|-------------|
| `AppShell` / `AppShellMain` | Aeusserer Container mit Navbar + Content-Bereich |
| `Navbar` / `NavbarStart` / `NavbarCenter` / `NavbarEnd` | Dreiteilige Navigation |
| `WorkspaceSwitcher` | Gruppen-/Workspace-Wechsel (Dropdown mit Avataren) |
| `ModuleTabs` | Modul-Navigation (Tabs mit Icons) |
| `BottomNav` | Mobile Bottom-Navigation |
| `UserMenu` | User-Avatar mit Dropdown (Profil, Settings, Logout) |

**Content-Komponenten** (schon fertig):

| Komponente | Beschreibung |
|------------|-------------|
| `PostCard` | Feed-Beitrag mit Autor, Text, Like/Comment/Share |
| `StatCard` | Statistik-Kachel (Icon + Zahl + Label) |
| `ActionCard` | Aktions-Button (Icon + Label + Beschreibung) |
| `SimplePostWidget` | Eingabe-Widget fuer neue Posts |

**UI-Primitives** (von shadcn/ui):

Button, Card, Dialog, Input, Textarea, Avatar, Tabs, DropdownMenu, Sheet,
Separator, Label, Tooltip, Skeleton, Sidebar

**Storybook:** Alle Komponenten haben Stories (`*.stories.tsx` Dateien).
Starten mit `pnpm storybook`.

**Neue Komponenten hinzufuegen:**

1. Komponente in `packages/toolkit/src/components/` erstellen
2. In `packages/toolkit/src/components/index.ts` exportieren
3. Story-Datei daneben erstellen
4. Design-Entscheidungen in `packages/toolkit/docs/UI-REQUIREMENTS.md` dokumentieren

**shadcn/ui Komponenten hinzufuegen:** Nutze den MCP-Server `shadcn` (falls verfuegbar)
oder kopiere Komponenten manuell aus der shadcn/ui Registry nach
`packages/toolkit/src/components/ui/`.

---

## 4. Reference App

Die Reference App (`apps/reference/`) ist die Showcase-App. Hier werden alle Module
zusammen gezeigt. Aktuell hat sie:

- AppShell + Navbar mit WorkspaceSwitcher (3 Demo-Workspaces)
- ModuleTabs: Feed, Karte, Kalender
- FeedView mit Stats, Actions, Posts
- MapView mit Platzhalter-Karte
- CalendarView mit Demo-Kalender

**Was fehlt:** Das Kanban-Modul und die Anbindung an den MockConnector.
Aktuell nutzt die App hardcoded Demo-Daten in `App.tsx`.

**Naechster Schritt:** Die Reference App mit dem MockConnector verbinden und das
Kanban-Board als neues Modul einbauen.

---

## 5. Item-Modell: Wie Module Items nutzen

Das zentrale Konzept: **Alles sind Items.** Ein Item kann in mehreren Modulen
gleichzeitig erscheinen. Nicht der `type` bestimmt wo, sondern die **Daten-Felder**
in `data`:

| Feld | Modul | Beschreibung |
|------|-------|-------------|
| `status` | Kanban | Status-Spalte ("todo", "doing", "done") |
| `position` | Kanban | Sortierung innerhalb der Spalte |
| `start` / `end` | Kalender | Zeitraum |
| `location` | Karte | GeoJSON-Koordinaten |
| `content` | Feed | Fliesstext |
| `title` | Alle | Anzeigename |
| `description` | Alle | Detailbeschreibung |
| `tags` | Alle | Kategorien / Filter |

**Beispiel:** Ein Event mit `status`, `start` und `location` erscheint
gleichzeitig im Kanban, Kalender UND auf der Karte.

```typescript
const item: Item = {
  id: "abc123",
  type: "event",
  createdAt: new Date(),
  createdBy: "user-1",
  data: {
    title: "Pflanzaktion",
    status: "confirmed",          // → Kanban
    start: "2026-03-15T10:00",    // → Kalender
    location: { lat: 50.1, lng: 8.7 },  // → Karte
    tags: ["garten"]
  }
}
```

---

## 6. Kanban-Board: Anforderungen

Das Kanban-Board ist das erste UI-Modul, das gegen das DataInterface gebaut wird.

### Muss-Features (POC)

| Feature | Beschreibung | Daten-Feld |
|---------|-------------|-----------|
| **Spalten** | Mindestens: Todo, Doing, Done | `data.status` |
| **Karten** | Titel, Beschreibung, Assignee-Avatar | `data.title`, `data.description`, `relations[assignedTo]` |
| **Drag & Drop** | Karten zwischen Spalten verschieben | `data.status` + `data.position` aendern |
| **Avatare** | Profilbilder der zugewiesenen Personen | User aus `getUser()` oder `getMembers()` |
| **Zuweisung** | Aufgaben an Personen zuordnen | `relations: [{ predicate: "assignedTo", target: "global:user-id" }]` |
| **Deadlines** | Faelligkeitsdaten anzeigen | `data.deadline` (ISO DateTime) |
| **Tags/Labels** | Kategorisierung | `data.tags: string[]` |

### Soll-Features (spaeter)

- Erinnerungen per Mail/Telegram
- Custom Columns (eigene Status-Werte definieren)
- Filter nach Tags, Assignee, Deadline

### Datenfluss

```typescript
// Tasks laden (alle Items mit status-Feld)
const tasks = await connector.getItems({ type: "task", hasField: ["status"] })

// Oder reaktiv:
const obs = connector.observe({ type: "task", hasField: ["status"] })

// Task verschieben (Drag & Drop)
await connector.updateItem(taskId, {
  data: { ...task.data, status: "doing", position: newPosition }
})

// Neuen Task erstellen
await connector.createItem({
  type: "task",
  createdBy: currentUser.id,
  data: { title: "Neuer Task", status: "todo", position: 0, tags: [] }
})
```

### Motivation

"Viel quatschen, wenig passiert" — Das Kanban-Board schafft Verbindlichkeit
durch klare Zustaendigkeiten und Deadlines. Es ist das Werkzeug, damit
Gemeinschaften nicht nur reden, sondern auch umsetzen.

---

## 7. Hooks (noch zu bauen)

Die Hooks sind die duenne Schicht zwischen UI und Connector. Sie uebersetzen
die Observable-API in React State. Konzept:

```typescript
// Hook fuer Items
function useItems(filter: ItemFilter) {
  const connector = useConnector()  // aus Context
  const [data, setData] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const obs = connector.observe(filter)
    setData(obs.current)
    setIsLoading(false)
    return obs.subscribe(setData)
  }, [connector, JSON.stringify(filter)])

  return { data, isLoading }
}

// Nutzung im Kanban-Board:
function KanbanBoard() {
  const { data: tasks, isLoading } = useItems({ type: "task", hasField: ["status"] })
  if (isLoading) return <Spinner />
  // ... Kanban rendern
}
```

---

## 8. Design-System & Konventionen

### Tailwind CSS v4

- OKLCH-Farben (nicht RGB/HSL)
- Primary: Blau (`oklch(0.55 0.21 264)`)
- Secondary: Gruen (`oklch(0.72 0.19 142)`)
- Font: Inter (Sans), Merriweather (Serif), Source Code Pro (Mono)

### shadcn/ui Pattern

Komponenten liegen **im Repo** (nicht als npm-Dependency). Neue UI-Primitives
werden aus der shadcn/ui Registry kopiert und angepasst.

### Deutsche Demo-Texte

Die Reference App verwendet deutsche Texte fuer Demo-Daten.
Komponenten-Labels bleiben englisch (i18n-freundlich).

### UI-Requirements dokumentieren

Jede Design-Entscheidung wird in `packages/toolkit/docs/UI-REQUIREMENTS.md`
als atomare Checkbox dokumentiert. Beispiel:

```markdown
- [x] **card-rounded-xl**: Cards mit `rounded-xl`
- [x] **navbar-glass**: Navbar mit Glasmorphism
```

---

## 9. Feature-Items: Connector-Capabilities

Jeder Connector beschreibt seine Faehigkeiten ueber ein spezielles Item
(`type: "feature"`). Die UI kann darauf reagieren und Features
ein-/ausblenden:

```typescript
const features = await connector.getItem("feature-mock")
// features.data.kanban.dragDrop === true
// features.data.kanban.customColumns === false
// features.data.groups.create === true
```

---

## 10. Gruppen

Gruppen sind der Kontext, in dem Items geteilt werden. Jede Gruppe hat:

- `name` — Anzeigename
- `data.access` — Zugangsmodell: "open", "invite-member", "invite-admin", "closed"
- `data.modules` — Aktivierte Module: `["kanban", "calendar", "map", "feed"]`
- `data.roles` — Verfuegbare Rollen: `["admin", "member", "viewer"]`

Die UI zeigt nur die Module an, die in `data.modules` der aktuellen Gruppe stehen.

---

## 11. Team & Workflow

| Person | Fokus |
|--------|-------|
| **Anton** | Architektur, DataInterface, WoT-Connector (Automerge + E2EE) |
| **Sebastian** | UI-Module (Kanban, Kalender), Toolkit-Komponenten, Reference App |
| **Mathias** | QA, Testing, Dokumentation |
| **Eli** | AI-Assistent (Claude Code) |

### Zusammenarbeit

- Sebastian baut UI-Module gegen den **MockConnector** — kein Backend noetig
- Anton baut den **WoT-Connector** (Automerge + verschluesselte Spaces)
- Das **DataInterface** ist der gemeinsame Vertrag — Aenderungen nur nach Absprache
- Neue UI-Komponenten ins **Toolkit**, Stories dazu, in Reference App integrieren

---

## 12. Wichtige Dateien

| Datei | Beschreibung |
|-------|-------------|
| `docs/spec/README.md` | Normativer Spec-Einstieg |
| `docs/spec/00-architecture.md` | Architekturanker |
| `docs/spec/architektur2.md` | Historische Architektur-Referenz |
| `docs/concepts/poc-plan.md` | POC-Plan mit Fortschritt |
| `packages/data-interface/src/index.ts` | Alle TypeScript-Typen |
| `packages/mock-connector/src/demo-data.ts` | Demo-Daten |
| `packages/mock-connector/src/mock-connector.ts` | MockConnector-Implementierung |
| `packages/toolkit/docs/UI-REQUIREMENTS.md` | UI/UX Design-Entscheidungen |
| `packages/toolkit/src/styles/globals.css` | Theme & CSS-Variablen |
| `apps/reference/src/App.tsx` | Reference App |
| `CLAUDE.md` | Kurzanleitung fuer AI-Assistenten |

---

## 13. Naechste Schritte

1. **Kanban-Board als Toolkit-Komponente** — `KanbanBoard`, `KanbanColumn`, `KanbanCard`
   in `packages/toolkit/src/components/` mit Stories
2. **Hooks bauen** — `useItems`, `useConnector`, etc. (koennen im Toolkit oder
   in der Reference App leben)
3. **Reference App umbauen** — MockConnector anbinden, Kanban als Modul hinzufuegen,
   hardcoded Daten durch Connector-Calls ersetzen
4. **Kalender-Modul** — Zweites Modul, aehnliches Pattern wie Kanban
