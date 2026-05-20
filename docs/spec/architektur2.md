# Real Life Stack – Architektur-Spezifikation (v2 — Zusammenführung)

> Modularer Frontend-Baukasten mit backend-agnostischer Connector-Architektur
>
> *Zusammenführung aus: architektur.md (Workshop 5. März) + architektur2.md (Sebastian)*

> **Historische Referenz:** Dieses Dokument ist nicht mehr der direkte normative Einstieg. Es bleibt als bisher beste Gesamtbeschreibung erhalten und wird schrittweise in kleinere Spec-Slices überführt. Aktuelle normative Einstiegspunkte sind [README.md](README.md) und [00-architecture.md](00-architecture.md).

---

## Übersicht

Real Life Stack ist ein modularer UI-Baukasten für lokale Vernetzung. Die Architektur trennt UI-Module strikt von der Datenquelle durch eine einheitliche Schnittstelle und austauschbare Connectoren.

```
┌─────────────────────────────────────────────────────────────┐
│                       UI-Module                             │
│           (Kanban, Kalender, Karte, Feed, ...)              │
├─────────────────────────────────────────────────────────────┤
│                    React Hooks                              │
│  useItems(), useItem(), useCreateItem(), useUpdateItem()    │
│  → Einheitliche API, liefert { data, isLoading, error }    │
├─────────────────────────────────────────────────────────────┤
│                    Daten-Schnittstelle                      │
│  DataInterface: getItems(), getItem(), observe(), ...       │
│  Optional: ItemWriter, GroupManager, Authenticatable, ...    │
├─────────────────────────────────────────────────────────────┤
│                      Connector(s)                           │
│       (implementiert Core + passende Capabilities)          │
│     Caching, Optimistic Updates, Reaktivität — alles intern │
├────────────────┬────────────────┬───────────────────────────┤
│ REST-Connector │ WoT-Connector  │   Weitere Connectoren     │
│                │                │                           │
│ - Server-Login │ - wot-core    │   - GraphQL               │
│ - REST API     │ - DID-basiert  │   - Local-only            │
│ - TanStack Q.  │ - Local-first  │   - ActivityPub           │
└────────────────┴────────────────┴───────────────────────────┘
```

### Kernprinzipien

1. **Module sind pure UI** – Sie wissen nicht, woher die Daten kommen
2. **Generische Items** – Ein Item kann in mehreren Modulen erscheinen
3. **Connector-Pattern** – Jeder Connector implementiert den read-only Kern und nur die Capabilities, die er unterstützt
4. **Daten-Mixing** – Daten aus verschiedenen Quellen können kombiniert werden
5. **Connector-Verantwortung** – Der Connector ist vollständig verantwortlich für Caching, Optimistic Updates und Reaktivität. Die Hooks sind dünn — sie konsumieren nur die Connector-API

---

## Schichten im Detail

### 1. UI-Module

Module sind reine Darstellungskomponenten. Sie:
- Rufen Daten über Hooks ab (`useItems`, `useItem`)
- Rendern Items basierend auf deren Daten-Feldern
- Senden Änderungen über Hooks zurück (`useCreateItem`, `useUpdateItem`)
- Kennen weder Backend noch Authentifizierung

**Verfügbare Module:**

| Modul | Zeigt Items die `data` enthält | Beschreibung |
|-------|-------------------------------|--------------|
| Kanban | `status` | Aufgaben in Spalten organisieren |
| Kalender | `start` (und optional `end`) | Termine zeitlich darstellen |
| Karte | `location` | Orte geografisch visualisieren |
| Feed | *(alle Items)* | Chronologischer Aktivitäts-Stream |
| Profil | *(via User-ID)* | Nutzerprofile anzeigen |

### 2. Daten-Schnittstelle

Die zentrale API, die von den Hooks konsumiert und von Connectoren implementiert wird. Der Kern ist bewusst read-only und abstrahiert:
- **Daten** – Items als Snapshots lesen
- **Reaktivität** – Observables für Live-Updates

Alles Weitere wird über Capability-Interfaces ergänzt. So kann ein einfacher Import-Connector nur lesen, während ein vollwertiger App-Connector zusätzlich schreiben, Gruppen verwalten, Nutzer authentifizieren oder Relations auflösen kann.

```typescript
interface DataInterface {
  // Lifecycle
  init(): Promise<void>       // Setup: Connections öffnen, CRDT laden, Sync starten
  dispose(): Promise<void>    // Cleanup: Connections schließen, Subscriptions aufräumen

  // Items — einmalig laden
  getItems(filter?: ItemFilter): Promise<Item[]>
  getItem(id: string): Promise<Item | null>

  // Items — reaktiv beobachten (bevorzugter Weg)
  observe(filter: ItemFilter): Observable<Item[]>
  observeItem(id: string): Observable<Item | null>
}

interface ItemWriter {
  createItem(item: Omit<Item, 'id' | 'createdAt'>): Promise<Item>
  updateItem(id: string, updates: Partial<Item>): Promise<Item>
  deleteItem(id: string): Promise<void>
}

interface RelationCapable {
  getRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Promise<Item[]>
}

interface GroupManager {
  getGroups(): Promise<Group[]>
  observeGroups(): Observable<Group[]>
  getCurrentGroup(): Group | null
  observeCurrentGroup(): Observable<Group | null>
  setCurrentGroup(id: string | null): void
  createGroup(name: string, data?: Record<string, unknown>): Promise<Group>
  updateGroup(id: string, updates: Partial<Group>): Promise<Group>
  deleteGroup(id: string): Promise<void>
  getMembers(groupId: string | null): Promise<User[]>
  inviteMember(groupId: string, userId: string): Promise<void>
  removeMember(groupId: string, userId: string): Promise<void>
}

interface Authenticatable {
  getCurrentUser(): Promise<User | null>
  observeCurrentUser(): Observable<User | null>
  getUser(id: string): Promise<User | null>
  getAuthState(): Observable<AuthState>
  getAuthMethods(): AuthMethod[]
  authenticate(method: string, credentials: unknown): Promise<User>
  logout(): Promise<void>
}

type AuthState =
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' }
  | { status: 'loading' }

interface AuthMethod {
  method: string        // "password", "did", "oauth-google", "passkey", ...
  label: string         // Anzeigename für die UI
}

interface Observable<T> {
  current: T                                  // Aktueller Wert (synchron)
  subscribe(callback: (value: T) => void): Unsubscribe  // Bei Änderungen benachrichtigen
}

type Unsubscribe = () => void

interface RelatedItemsOptions {
  direction?: "from" | "to" | "both"   // Default: "to"
  depth?: number                        // Verschachtelte Relations auflösen
  limit?: number                        // Max. Anzahl (für Paging)
  offset?: number                       // Überspringe die ersten N
}

interface Group {
  id: string
  name: string
  data?: Record<string, unknown>  // Beschreibung, Bild, Zugangsmodell, Module, ...
}

// Bekannte Felder in group.data:
// description?: string              — Beschreibung der Gruppe
// imageUrl?: string                 — Gruppenbild
// memberCount?: number              — Anzahl Mitglieder
// access?: "open" | "invite-member" | "invite-admin" | "closed"
// modules?: string[]                — Aktivierte Module (z.B. ["kanban", "calendar", "map"])
// roles?: string[]                  — Verfügbare Rollen (z.B. ["admin", "member", "viewer"])

interface ItemFilter {
  type?: string
  hasField?: string[]              // Items filtern die bestimmte Felder in data haben
  createdBy?: string
  source?: string
  limit?: number                   // Max. Anzahl (für Paging)
  offset?: number                  // Überspringe die ersten N
}
```

### 3. Hooks (dünne Schicht zwischen UI und Connector)

Die Hooks sind die einzige Schicht zwischen UI-Modulen und dem Connector. Sie sind bewusst **dünn** — ihre Aufgabe ist nur, die Connector-API in React-kompatible Hooks zu übersetzen. Caching, Optimistic Updates und Reaktivität liegen in der Verantwortung des Connectors.

```
┌─────────────┐       ┌──────────────────┐       ┌──────────────┐
│  UI-Modul   │──────►│     Hooks        │──────►│  Connector   │
│             │◄──────│                  │◄──────│              │
│ useItems()  │       │ Observable→State │       │ observe()    │
│ useCreate() │       │ Promise→mutate() │       │ createItem() │
└─────────────┘       └──────────────────┘       └──────────────┘
```

#### Lesen: Observable → React State

Der bevorzugte Weg, Daten zu lesen, ist `observe()` — es liefert ein lebendes Objekt zurück, das sich automatisch aktualisiert, wenn sich Daten ändern (lokal oder durch andere Nutzer).

```typescript
// Observable liefert immer den aktuellen Stand
const tasks = connector.observe({ type: "task", hasField: ["status"] })
tasks.current  // → [task1, task2, ...]  (synchroner Zugriff)

// Bei Änderungen benachrichtigt werden
const unsub = tasks.subscribe((updatedTasks) => {
  renderBoard(updatedTasks)
})
```

`getItems()` und `getItem()` existieren weiterhin für einmalige Abfragen (Snapshots), z.B. beim Export oder für Hintergrund-Operationen.

**React-Hook:**

```typescript
function useItems(filter?: ItemFilter) {
  const connector = useConnector()
  const observable = useMemo(() => connector.observe(filter), [filter])
  const [data, setData] = useState(observable.current)

  useEffect(() => observable.subscribe(setData), [observable])

  return { data, isLoading: !data, error: undefined }
}

// Nutzung — die UI ist automatisch reaktiv:
function KanbanBoard() {
  const { data: tasks, isLoading } = useItems({ type: "task", hasField: ["status"] })
  if (isLoading) return <Spinner />
  // Re-rendert automatisch wenn sich Items ändern
}
```

#### Schreiben: Einfache Mutations

Schreiboperationen sind direkte Aufrufe an den Connector. Der Connector gibt ein `Promise<Item>` zurück — die UI bekommt ein fertiges Item mit ID und kann sofort damit arbeiten.

```typescript
function useCreateItem() {
  const connector = useConnector()
  return {
    mutate: (item: Omit<Item, 'id' | 'createdAt'>) => connector.createItem(item)
  }
}

function useUpdateItem() {
  const connector = useConnector()
  return {
    mutate: (id: string, updates: Partial<Item>) => connector.updateItem(id, updates)
  }
}

// Nutzung:
function AddTaskButton() {
  const { mutate: createItem } = useCreateItem()

  const handleClick = async () => {
    const newItem = await createItem({
      type: "task",
      createdBy: userId,
      data: { title: "Neuer Task", status: "todo" }
    })
    // newItem hat id, createdAt — sofort nutzbar
  }
}
```

**Was darunter passiert, ist Connector-Sache:**

| Connector | Was passiert bei `createItem()` |
|---|---|
| WoT (Yjs/CRDT) | Sofort ins lokale CRDT geschrieben, Observable feuert automatisch, Sync im Hintergrund |
| REST | Request an Server, Response mit ID, Connector aktualisiert internen Cache, Observable feuert |
| REST (optimistisch) | Item sofort im Cache anzeigen, Request abschicken, bei Fehler rollback |

Die UI muss sich nicht um Caching, Optimistic Updates oder Rollback kümmern — der Connector handhabt das intern. Bei Local-First-Connectors mit CRDT existiert das Problem kaum: Writes sind instant, das Observable feuert sofort.

#### Connector-interne Hilfsmittel

Server-basierte Connectors können intern Libraries wie **TanStack Query** nutzen, um Caching, Retry-Logic und Optimistic Updates zu implementieren. Das ist ein Implementierungsdetail des Connectors — die Hooks und die UI wissen nichts davon.

```typescript
// Beispiel: RestConnector nutzt intern TanStack Query
class RestConnector implements DataInterface {
  private queryClient = new QueryClient()

  observe(filter: ItemFilter): Observable<Item[]> {
    // TanStack Query als internes Caching + Polling
    return {
      current: this.queryClient.getQueryData(['items', filter]) ?? [],
      subscribe: (cb) => {
        return this.queryClient.getQueryCache().subscribe(() => {
          cb(this.queryClient.getQueryData(['items', filter]) ?? [])
        })
      }
    }
  }

  async createItem(item): Promise<Item> {
    const created = await fetch(...)  // Server-Request
    this.queryClient.invalidateQueries({ queryKey: ['items'] })
    return created
  }
}
```

#### Reaktivität: Connector entscheidet den Mechanismus

Jeder Connector implementiert `observe()` — **wie** er das intern macht, ist seine Sache:

| Connector | Mechanismus | Latenz |
|-----------|-------------|--------|
| WoT (Yjs/CRDT) | CRDT-Events, alles lokal | Sofort |
| Local | IndexedDB + BroadcastChannel | Sofort |
| GraphQL | GraphQL Subscriptions | Sofort |
| REST + WebSocket | WS für Push, REST für Daten, lokaler Cache | Sofort |
| REST (minimal) | Polling-Fallback | Sekunden |

Die Observable-API ist für alle Backends gleich — nur der Mechanismus dahinter unterscheidet sich. Ein REST-Server ohne WebSocket funktioniert trotzdem, pollt aber statt zu pushen.

**Hinweis für Connector-Implementierungen:** CRDT-basierte Connectors feuern Events auf Dokument-Ebene, während `observe()` auf Query-Ebene arbeitet. Der Connector muss intern filtern und sollte Subscriber nur benachrichtigen, wenn sich das Query-Ergebnis tatsächlich geändert hat (z.B. via Shallow Comparison). Das vermeidet unnötige Re-Renders.

### 4. Connector

Ein Connector implementiert die Daten-Schnittstelle für ein spezifisches Backend. Es ist die Verantwortung des Connectors, die Schnittstelle korrekt zu bedienen — einschließlich ID-Vergabe, Pagination, und die Implementierung der Observables. Jeder Connector ist eigenständig und bringt alles mit:

- Authentifizierung / Identität
- Datenspeicherung
- Synchronisation
- Verschlüsselung (falls nötig)

**Wichtig:** Connectoren sind nicht komponierbar. Man wählt einen Connector oder kombiniert mehrere auf Daten-Ebene (Multi-Source).

---

## Das generische Item

Items sind die universelle Datenstruktur. Module interpretieren sie basierend auf ihren Daten-Feldern.

```typescript
interface Item {
  // Pflichtfelder
  id: string
  type: string             // Was IST das Item? ("task", "event", "post", "place", ...)
  createdAt: string          // ISO-Zeitstempel
  createdBy: string        // User-ID (DID oder Server-ID)

  // Schema-Versionierung
  schema?: string          // Schema-Bezeichner (z.B. "rls:task")
  schemaVersion?: number   // Version des Schemas

  // Typ-spezifische Daten (inkl. title, description, etc.)
  data: Record<string, unknown>

  // Beziehungen zu anderen Items/Usern
  relations?: Relation[]

  // Metadaten (nur lesen)
  _source?: string         // Woher kommt das Item?
}
```

**Hinweis:** `title` und `description` sind keine Pflichtfelder auf Item-Ebene, sondern leben in `data`. Nicht jeder Item-Typ hat einen Titel (z.B. ein GPS-Wegpunkt oder ein Sensor-Messwert). Module die einen Anzeigenamen brauchen, lesen `data.title` — ist keiner vorhanden, nutzen sie einen Fallback (z.B. den `type` oder `id`).

### Typ vs. Daten-Felder: Zwei Achsen

Items haben zwei orthogonale Eigenschaften:

- **`type`** bestimmt, **was** ein Item ist und **wie** es dargestellt wird (Rendering)
- **Daten-Felder** in `data` bestimmen, **wo** ein Item erscheint (Modul-Routing)

```typescript
// Dieses Item erscheint in Kanban UND Kalender UND Karte
const item: Item = {
  id: "abc123",
  type: "event",                      // → UI weiß: als Event rendern
  createdAt: new Date(),
  createdBy: "did:key:z6Mk...",
  data: {
    title: "Gartentreffen",
    description: "Gemeinsam ernten",
    status: "confirmed",               // → Kanban zeigt es
    start: "2026-03-10T10:00",         // → Kalender zeigt es
    end: "2026-03-10T12:00",
    location: { lat: 50.5, lng: 9.6 }, // → Karte zeigt es
    tags: ["garten", "gemeinschaft"]
  },
  relations: [
    { predicate: "assignedTo", target: "global:did:key:z6Mk..." }
  ]
}
```

Ein Modul prüft nicht den `type`, sondern die vorhandenen Daten-Felder. Der `type` wird vom Modul genutzt, um zu entscheiden **wie** das Item innerhalb des Moduls dargestellt wird — z.B. zeigt der Kalender ein Event anders als einen Task mit Deadline.

### Bekannte Daten-Felder

Module definieren, welche Felder in `data` sie verstehen:

| Feld | Typ | Genutzt von |
|------|-----|-------------|
| `title` | string | Alle (Anzeigename) |
| `description` | string | Alle (Detailansicht) |
| `status` | string | Kanban |
| `position` | number | Kanban (Sortierung innerhalb Spalte) |
| `start` | ISO DateTime | Kalender |
| `end` | ISO DateTime | Kalender |
| `location` | GeoJSON | Karte |
| `address` | string | Karte |
| `tags` | string[] | Alle (Filter) |
| `content` | string | Feed (Fließtext) |
| `visibility` | string | Berechtigungen |

**Validierung:** Module sind verantwortlich für die Validierung der Felder, die sie aus `data` lesen. Die Schnittstelle erzwingt keine Struktur — das ist bewusst so, damit verschiedene Connectoren unterschiedliche Datenmodelle bedienen können.

### Schema-Versionierung

Schemas entwickeln sich über die Zeit. Die optionalen Felder `schema` und `schemaVersion` ermöglichen Connectoren, Daten bei Bedarf zu migrieren oder der UI anzuzeigen, dass ein Item in einem älteren Format vorliegt.

```typescript
{
  type: "task",
  schema: "rls:task",
  schemaVersion: 2,      // Version 2 hat "priority" als Feld hinzugefügt
  data: {
    title: "Build Pipeline",
    status: "doing",
    priority: "high"      // Neu in Schema v2
  }
}
```

Connectoren können bei Bedarf ältere Versionen on-the-fly migrieren.

---

## Relations

Items können Beziehungen zu anderen Items und Usern haben. Relations folgen dem RDF-Tripel-Modell (Subject → Predicate → Object) und sind damit kompatibel mit Linked Data / JSON-LD.

### Struktur

```typescript
interface Relation {
  predicate: string                 // Was für eine Beziehung? ("childOf", "assignedTo", ...)
  target: string                    // Wohin? Scope-Prefix + ID (siehe unten)
  meta?: Record<string, unknown>    // Optionale Metadaten (z.B. { role: "reviewer" })
}
```

Das Item selbst ist das Subject — zusammen mit `predicate` und `target` ergibt sich ein vollständiges RDF-Tripel.

### Scope-Prefixes

Jede Referenz in `target` trägt einen Scope-Prefix, der klar macht, **wo** das Ziel lebt:

| Prefix | Bedeutung | Beispiel |
| ------ | --------- | ------- |
| `global:` | User-ID (DID oder Server-ID) — immer auflösbar | `global:did:key:z6Mk...` |
| `space:{id}/` | Item in einem bestimmten Space/Gruppe | `space:garten/item:plan3` |
| `item:` | Item im selben Space (Kurzform) | `item:task-100` |

**Regeln:**

- `item:` ohne Space-Prefix = selber Space wie das Subject-Item (häufigster Fall)
- `space:{id}/item:` = explizite Cross-Space-Referenz
- `global:` = User-IDs, immer connector-übergreifend auflösbar

**Beispiele:**

```
item:task-123  →  assignedTo  →  global:did:key:z6Mk...          (User, global)
item:task-123  →  childOf     →  item:task-100                    (Item, selber Space)
item:task-123  →  references  →  space:wiki/item:doc-42           (Item, anderer Space)
item:post-abc  →  commentOn   →  item:post-xyz                    (Item, selber Space)
```

### Warum Scope-Prefixes?

Cross-Space-Kooperation ist ein Kernziel von RLS. Menschen arbeiten in verschiedenen Kontexten (Garten-Projekt, Nachbarschaftshilfe, Transition-Town) und brauchen Verbindungen zwischen diesen Welten:

- Ein Task im Garten-Projekt referenziert ein Dokument im Wiki-Space
- Eine Veranstaltung in der Transition-Town verweist auf einen Ort im Karten-Space
- Eine Attestation referenziert eine Person global per DID

Ohne Scope-Prefixes wären solche Querverbindungen nicht darstellbar. Die Prefixes machen explizit, was zusammengehört und was Grenzen überschreitet — der Connector kann bei fehlenden Zugriffsrechten einen "dangling reference"-Hinweis anzeigen statt stillschweigend zu ignorieren.

### Einbetten vs. eigenes Item

Nicht alle zusammengehörigen Daten müssen eigene Items mit Relations sein. Die Faustregel:

| Einbetten (in `data`) | Eigenes Item (mit Relation) |
| --- | --- |
| Gehört fest zum Item | Ist eigenständig |
| Wenige, begrenzte Einträge | Kann unbegrenzt wachsen |
| Kein eigener Lifecycle | Eigener Lifecycle (editierbar, löschbar) |
| Von einem User erstellt | Von verschiedenen Usern |

**Beispiel Post:**
- Bilder → **einbetten** (gehören zum Post, ändern sich nicht)
- Likes → **einbetten** (einfache Liste von User-IDs)
- Kommentare → **eigene Items** (eigener Text, eigener Autor, editierbar, können Replies haben)

### Prädikat-Katalog

Prädikate sind definierte Strings, kein Freitext. Der Katalog wächst mit den Anforderungen:

| Prädikat | Bedeutung | Beispiel |
| --- | --- | --- |
| `childOf` | Untergeordnet / Sub-Item | Sub-Task → Task |
| `assignedTo` | Zugewiesen an Person | Task → User |
| `commentOn` | Kommentar zu Item | Comment → Post |
| `likedBy` | Gefällt einer Person | Post → User |
| `blocks` | Blockiert anderes Item | Task → Task |
| `relatedTo` | Allgemeine Verknüpfung | Item → Item |
| `locatedAt` | Verortung | Event → Place |

### Relations abfragen

Relations werden über `RelationCapable` aufgelöst, nicht über eingebettete `_included`-Daten am Item:

```typescript
// Alle Kommentare zu einem Post
const comments = await connector.getRelatedItems("post-abc", "commentOn")

// Alle Sub-Tasks (auch verschachtelt)
const subtasks = await connector.getRelatedItems("task-100", "childOf", { depth: 2 })
```

In React-Komponenten wird dafür `useRelatedItems()` genutzt. So bleiben Relations reaktiv, ohne dass Connectoren Items mit abgeleiteten `_included`-Feldern anreichern müssen.

### Backend-Umsetzung

Wie ein Connector Relations intern auflöst, ist ihm überlassen:

| Connector | Umsetzung |
| --- | --- |
| REST | `GET /items/post-abc/relations?predicate=commentOn` |
| GraphQL | `query { item(id: "post-abc") { comments { ... } } }` |
| WoT (Yjs/CRDT) | Space-Dokument oder Cross-Group-Index lesen → referenzierte Items laden |

Die Schnittstelle ist identisch — nur die Implementierung unterscheidet sich.

### JSON-LD Kompatibilität

Die Item-Struktur ist so gestaltet, dass sie mit minimalem Aufwand als JSON-LD exportiert werden kann:

```typescript
// Internes Item:
{
  id: "task-123", type: "task",
  data: { title: "Build Pipeline", status: "doing" },
  relations: [{ predicate: "childOf", target: "item:task-100" }]
}

// Als JSON-LD Export:
{
  "@context": "https://reallifestack.org/context.json",
  "@id": "item:task-123",
  "@type": "rls:Task",
  "rls:title": "Build Pipeline",
  "rls:status": "doing",
  "rls:childOf": { "@id": "item:task-100" }
}
```

Die Konvertierung erfordert keine Änderung an der Datenstruktur — nur das Hinzufügen eines `@context`.

---

## Connectoren

Jeder Connector implementiert den read-only Kern des `DataInterface` und die passenden Capability-Interfaces. Für die Fähigkeiten, die er unterstützt, ist er verantwortlich für:
- **ID-Vergabe** bei `createItem()` — wenn `ItemWriter` unterstützt wird, erzeugt der Connector die ID und liefert sie im zurückgegebenen Item mit
- **Pagination** — der Connector entscheidet, ob `totalCount` in Collections geliefert wird
- **Observable-Implementierung** — der Connector entscheidet, wie er Observables intern umsetzt (CRDT-Events, WebSocket, Polling)
- **Caching** — der Connector verwaltet seinen eigenen Cache (z.B. via TanStack Query, eigener Store, oder CRDT-State)
- **Optimistic Updates** — bei Server-basierten Connectors optional: Item sofort im Cache anzeigen, bei Fehler rollback. Bei Local-First-Connectors unnötig (Writes sind instant)
- **Datenstruktur** — der Connector bestimmt, welche Felder in `item.data` enthalten sind

### REST-Connector

Klassische Server-Anbindung mit Session-basierter Authentifizierung.

```typescript
class RestConnector implements DataInterface, ItemWriter, Authenticatable {
  constructor(config: {
    baseUrl: string
  })

  // Login/Logout
  login(credentials: { email: string; password: string }): Promise<User>
  logout(): Promise<void>

  // Implementiert DataInterface...
  // observe() intern via WebSocket + Cache oder Polling-Fallback
}
```

**Eigenschaften:**
- Server speichert Daten und vergibt IDs
- Session-basierte Auth (JWT, Cookies)
- `observe()` intern via WebSocket (wenn verfügbar) oder Polling-Fallback
- Kann intern **TanStack Query** nutzen für Caching, Retry, Optimistic Updates
- `totalCount` in Collections typischerweise verfügbar (SQL COUNT)
- Klassisches Rechte-Management

### WoT-Connector

Dezentrale Anbindung via [Web of Trust](https://github.com/real-life-org/web-of-trust).

```typescript
class WotConnector implements DataInterface, ItemWriter, GroupManager, Authenticatable {
  constructor(config: {
    relayUrl: string
    profilesUrl: string
    vaultUrl?: string
  })

  // Keine separates Login — DID ist die Identität
  // Identity wird beim ersten Start generiert oder wiederhergestellt

  // Implementiert DataInterface inkl. observe()
  // Observables nativ über CRDT-Events / Live Queries
}
```

**Eigenschaften:**
- Nutzt `wot-core` und den Yjs-Adapter für DID, Kryptografie, Signaturen und CRDT-Spaces
- Local-first: ID-Vergabe lokal (z.B. UUID), Sync im Hintergrund
- `observe()` nativ über CRDT-Events und lokale Indizes
- `totalCount` ggf. nicht effizient ermittelbar (dezentrale Daten)
- E2E-verschlüsselt
- Vertrauen durch persönliche Verifizierung

**Integration:**

```
┌─────────────────────────────────────────┐
│            WoT-Connector                │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐    ┌────────────────┐  │
│  │  wot-core   │    │  WotStorage    │  │
│  │             │    │                │  │
│  │ - Identity  │    │ - Evolu        │  │
│  │ - Crypto    │    │ - LocalStorage │  │
│  │ - Signing   │    │ - IndexedDB    │  │
│  │ - Verify    │    │                │  │
│  └─────────────┘    └────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

`wot-core` ist ein separates npm-Paket aus dem Web-of-Trust-Repository, das die kryptografischen Grundlagen bereitstellt.

---

## Feature-Erkennung (Capabilities als Items)

Nicht jeder Connector unterstützt dieselben Features. Die UI muss **vorher** wissen, welche Funktionen verfügbar sind — ohne Daten erst abfragen und auf Fehler reagieren zu müssen.

### Feature-Item

Der Connector liefert ein Item vom Typ `"feature"` mit einem verschachtelten Objektbaum in `data`. Jedes Feld das truthy ist, wird unterstützt. Jedes Feld das falsy oder nicht vorhanden ist, wird nicht unterstützt.

```typescript
// Der Connector liefert bei Initialisierung:
{
  id: "capabilities",
  type: "feature",
  createdAt: new Date(),
  createdBy: "system",
  data: {
    feed: {
      filter: true,
      sort: true,
      sortOptions: ["date", "relevance"]
    },
    kanban: {
      dragDrop: true,
      customColumns: true
    },
    calendar: {
      recurring: false
    },
    map: true,
    offline: true,
    realtime: true,
    friends: {
      suggestions: false
    }
  }
}
```

**Regel:** Truthy = unterstützt, falsy = nicht unterstützt. Die UI muss keine komplexen Untersuchungen vornehmen.

### Hook

```typescript
function useFeatures() {
  const { data } = useItems({ type: "feature" })
  return data?.[0]?.data ?? {}
}

// Convenience-Hook für einzelne Feature-Prüfungen
function useFeature(path: string): boolean {
  const features = useFeatures()
  return path.split('.').reduce((obj, key) => obj?.[key], features) ? true : false
}
```

### Adaptive UI

Module passen sich dynamisch an den Feature-Baum an:

```typescript
function FeedToolbar() {
  const features = useFeatures()

  return (
    <div>
      {features.feed?.filter && <FilterButton />}
      {features.feed?.sort && (
        <SortDropdown options={features.feed.sortOptions} />
      )}
    </div>
  )
}

function AppNavigation() {
  const features = useFeatures()

  return (
    <nav>
      <Link to="/kanban">Kanban</Link>
      <Link to="/feed">Feed</Link>
      {features.calendar && <Link to="/calendar">Kalender</Link>}
      {features.map && <Link to="/map">Karte</Link>}
    </nav>
  )
}

function FriendsSection() {
  const features = useFeatures()

  if (!features.friends) return null

  return (
    <div>
      <FriendsList />
      {features.friends?.suggestions && <SuggestionsList />}
    </div>
  )
}
```

### Feature-Vergleich pro Connector

| Feature | REST-Connector | WoT-Connector |
|---|---|---|
| `feed.filter` | true | true |
| `feed.sort` | true | false |
| `kanban.dragDrop` | true | true |
| `kanban.customColumns` | true | false |
| `calendar.recurring` | true | false |
| `map` | true | true |
| `offline` | false | true |
| `realtime` | true | true |
| `friends.suggestions` | true | false |

### Warum kein separates FeatureInterface

Alles läuft über dasselbe `DataInterface` — Features sind Items wie alles andere. Kein zweites Interface, kein `isSupported()`, kein `getDocument()`. Ein Connector muss nur **ein** Interface implementieren. Die UI nutzt für Features dieselben Hooks wie für Tasks, Events oder Profile.

---

## Multi-Source

Die Architektur erlaubt das Kombinieren von Daten aus mehreren Quellen. Der `SourceAggregator` implementiert selbst das `DataInterface` und delegiert an die einzelnen Connectoren.

```typescript
const sources = [
  new WotConnector({ storage: evoluStorage }),
  new GoogleCalendarConnector({ apiKey: "..." })
]

const aggregator = new SourceAggregator(sources)
```

### Sync und Speichern

- **Lesen:** Items aus allen Quellen werden zusammengeführt. Jedes Item trägt `_source` für die Herkunft.
- **Schreiben:** Mutations gehen an die aktive Quelle. Der Connector vergibt die ID.
- **Sync:** Jede Quelle synchronisiert sich selbst.
- **Observables:** Der Aggregator kombiniert die Observables aller Quellen zu einem gemeinsamen Stream.
- **Ladezustand:** Der Aggregator kombiniert den Zustand aller Quellen.

```
┌──────────────────────────────────────────────┐
│              SourceAggregator                │
│          (implementiert DataInterface)        │
├──────────────────────────────────────────────┤
│                                              │
│  observe() ────► Merge Observables           │
│                  aus allen Quellen            │
│                                              │
│  createItem() ──► Mutation an aktive Quelle  │
│                   (Connector vergibt ID)     │
│                                              │
│  Sync: Jede Quelle managed sich selbst       │
│                                              │
└──────────────────────────────────────────────┘
```

---

## Gruppen

Gruppen sind der zentrale Kontext, in dem Items geteilt werden. Eine Gruppe ist eine Gemeinschaft von Menschen, die zusammenarbeiten.

```
┌─────────────────────────────────────────┐
│  Gruppe "Gemeinschaftsgarten"           │
│                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Kalender│ │  Karte  │ │ Kanban  │   │
│  └─────────┘ └─────────┘ └─────────┘   │
│                                         │
│  Items: Gießplan, Erntefest, Beet 3... │
│  (nur für Mitglieder sichtbar)          │
└─────────────────────────────────────────┘
```

### Gruppen-Konfiguration

Gruppen tragen ihre Einstellungen im `data`-Feld:

```typescript
{
  id: "garten-123",
  name: "Gemeinschaftsgarten",
  data: {
    description: "Gemeinsam gärtnern im Stadtteil",
    imageUrl: "https://...",
    memberCount: 12,
    access: "invite-member",
    modules: ["kanban", "calendar", "map"],
    roles: ["admin", "member"]
  }
}
```

**Zugangsmodelle:**

| `access` | Wer kann beitreten? |
| -------- | ------------------- |
| `open` | Jeder, der will |
| `invite-member` | Einladung durch jedes Mitglied |
| `invite-admin` | Nur Admin kann einladen |
| `closed` | Geschlossen, keine neuen Mitglieder |

**Aktivierte Module:** Das `modules`-Array bestimmt, welche UI-Module in der Gruppe verfügbar sind. Der Lesekreis hat nur `["feed"]`, der Gemeinschaftsgarten hat `["kanban", "calendar", "map"]`. Die UI blendet nicht-aktivierte Module aus.

Welche dieser Einstellungen ein Connector unterstützt, wird über das Feature-Item gesteuert:

```typescript
// Feature-Item des Connectors
{
  type: "feature",
  data: {
    groups: {
      create: true,
      delete: true,
      accessModes: ["open", "invite-member", "invite-admin"],
      moduleSelection: true,
      roles: true
    }
  }
}
```

### Gruppen als Scopes

Gruppen sind **Scopes** — sie bestimmen, welche Items `getItems()` liefert. Der Connector entscheidet intern, wie die Zuordnung funktioniert. Die UI weiß nur: "aktuelle Gruppe" → "diese Items".

**Warum kein `groupId` auf Items?** Verschiedene Backends organisieren die Zuordnung fundamental verschieden:

| Backend | Wie Items zur Gruppe gehören |
|---------|-------------------------------|
| WoT/Automerge | Items leben *in* einem verschlüsselten CRDT-Space. Es gibt keine ID — das Dokument *ist* die Gruppe |
| GraphQL/REST | Server filtert serverseitig nach Gruppen-Zugehörigkeit |
| Mock/Local | Client-seitiges Mapping (`groupItems: Record<groupId, itemId[]>`) |

Ein `groupId`-Feld auf Item-Ebene würde ein flaches Datenmodell erzwingen, das zu verschlüsselten Spaces nicht passt.

#### Scopes: Alles + Gruppen

Der WorkspaceSwitcher zeigt nur zwei Arten von Einträgen:

```typescript
getGroups() → [
  { id: "all",       name: "Alles",       data: { scope: "aggregate", modules: ["feed", "kanban", "calendar", "map"] } },
  { id: "utopia",    name: "Utopia",      data: { scope: "group", modules: ["feed", "kanban", "calendar", "map"] } },
  { id: "it4change", name: "IT4Change",   data: { scope: "group", modules: ["feed", "kanban"] } },
]
```

| Scope | Bedeutung |
|-------|-----------|
| `aggregate` | Alle Items aus allen Quellen aggregiert (persönliche, von Freunden, aus Gruppen) |
| `group` | Echte Gruppe (Group Space mit Mitgliedern) |

Persönliche Items und von Freunden geteilte Items erscheinen im "Alles"-Scope — sie brauchen keine eigenen Einträge im Switcher. Der Connector kann intern unterscheiden, woher Items kommen, aber die UI muss das nicht wissen.

**Vorteil:** Einfache UX — Nutzer sehen nur "Alles" und ihre Gruppen. Kein Erklärungsbedarf für abstrakte Konzepte wie "Persönlich" oder "Freunde".

#### Gruppen-Wechsel

```typescript
// UI wechselt den Scope
connector.setCurrentGroup("utopia")
// getItems() liefert jetzt nur Items aus dem Utopia-Space

connector.setCurrentGroup("all")
// getItems() aggregiert über alle Scopes (persönlich + Freunde + alle Gruppen)
```

#### Mapping zu WoT-Sharing-Patterns

Die Scopes mappen direkt auf die drei Sharing-Patterns aus dem Web of Trust:

- **`personal`** → Persönlicher Automerge-Space (eigenes CRDT)
- **`friends`** → Selective Sharing (Item-Keys, 1:1 Delivery)
- **`group`** → Group Spaces (verschlüsselte CRDTs mit Mitgliederverwaltung)
- **`aggregate`** → SourceAggregator über alle obigen

#### Module pro Gruppe

Jede Gruppe definiert über `data.modules`, welche UI-Module verfügbar sind. Der WorkspaceSwitcher passt die ModuleTabs beim Gruppenwechsel dynamisch an.

```json
{ "id": "utopia", "name": "Utopia", "data": { "scope": "group", "modules": ["feed", "kanban", "calendar", "map"] } }
{ "id": "it4change", "name": "IT4Change", "data": { "scope": "group", "modules": ["feed", "kanban"] } }
```

### Simple Apps

Für einfache Apps ohne Gruppen-Wechsel gibt es einen impliziten Default-Kontext. `getGroups()` liefert dann nur eine Gruppe, und kein Gruppen-Switcher ist nötig.

---

## Identität und Nutzer

### User

Ein User ist eine Identität — nicht mehr:

```typescript
interface User {
  id: string              // Connector-spezifisch (DID oder Server-ID)
  displayName?: string    // Convenience: gecacht aus dem öffentlichen Profil-Item
  avatarUrl?: string      // Convenience: gecacht aus dem öffentlichen Profil-Item
}
```

`displayName` und `avatarUrl` sind **Read-Caches** aus dem Profil-Item, keine eigene Datenquelle. Man ändert den Namen über das Profil-Item, nicht über den User.

**Hinweis:** Ein User ist kein Item. Die Identität ist fundamental anders als Inhalte. Profile hingegen sind Items (siehe unten).

### Profil

Ein Profil ist ein generisches Item (`type: "profile"`), das öffentliche oder private Daten über einen User enthält. Es gibt zwei Stufen:

```typescript
// Öffentliches Profil — jeder sieht es
{
  type: "profile",
  createdBy: "did:key:z6Mk...",
  data: { displayName: "Anton", bio: "Gärtner", avatarUrl: "..." },
  visibility: "public"
}

// Privates Profil — nur für Kontakte (Auto-Gruppe)
{
  type: "profile",
  createdBy: "did:key:z6Mk...",
  data: { phone: "+49...", address: "...", skills: ["garten"] },
  visibility: "contacts"
}
```

Der Connector befüllt `User.displayName` und `User.avatarUrl` aus dem öffentlichen Profil-Item und hält sie gecacht, damit die UI sofort einen Namen hat, ohne für jedes `createdBy` einen separaten Profil-Lookup zu machen.

### Identitätsmodelle

Je nach Connector unterschiedlich:

| Connector | Identität      | Auth                   |
|-----------|----------------|------------------------|
| REST      | Server-Account | E-Mail/Passwort, OAuth |
| WoT       | DID (did:key)  | Keypair (Ed25519)      |

### Authentifizierung

Die Auth-Architektur trennt strikt zwischen **Connector** (Daten) und **Frontend** (UI-Komponenten). Der Connector liefert über `getAuthMethods()` nur Daten darüber, welche Authentifizierungsverfahren er unterstützt — die zugehörigen UI-Komponenten leben im Frontend.

```
┌─────────────────────────────────────────────────────────────┐
│  App Shell                                                  │
│                                                             │
│  authState.status === 'authenticated'?                      │
│    → App anzeigen (mit User-Menü)                           │
│    → Auth-Screen anzeigen                                   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Auth-Screen                                          │  │
│  │                                                       │  │
│  │  connector.getAuthMethods()                           │  │
│  │  → ["password", "did"]                                │  │
│  │                                                       │  │
│  │  authComponentRegistry["password"] → PasswordForm     │  │
│  │  authComponentRegistry["did"]      → DIDAuthScreen    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Connector** — liefert nur Daten:

```typescript
// REST-Connector
getAuthMethods(): AuthMethod[] {
  return [
    { method: 'password', label: 'E-Mail & Passwort' },
    { method: 'oauth-google', label: 'Mit Google anmelden' },
  ]
}

// WoT-Connector
getAuthMethods(): AuthMethod[] {
  return [
    { method: 'did', label: 'Web of Trust (DID)' },
  ]
}
```

**Frontend** — Auth-Komponenten-Registry:

```typescript
// Im Frontend: Zuordnung Auth-Methode → UI-Komponente
const authComponentRegistry: Record<string, ComponentType> = {
  'password': PasswordLoginForm,
  'did': DIDAuthScreen,
  'oauth-google': GoogleOAuthButton,
  'passkey': PasskeyAuth,
}

// App Shell
function AppShell() {
  const connector = useConnector()
  const authState = useObservable(connector.getAuthState())

  if (authState.status === 'authenticated') {
    return (
      <Layout>
        <UserMenu user={authState.user} onLogout={() => connector.logout()} />
        <Outlet />
      </Layout>
    )
  }

  const methods = connector.getAuthMethods()
  return <AuthScreen methods={methods} />
}

function AuthScreen({ methods }: { methods: AuthMethod[] }) {
  return (
    <div>
      {methods.map(m => {
        const Component = authComponentRegistry[m.method]
        return Component ? <Component key={m.method} /> : null
      })}
    </div>
  )
}
```

**Prinzipien:**

1. **Connector liefert nur Daten** — `getAuthMethods()` gibt Strings zurück, keine Komponenten
2. **Frontend besitzt die UI** — Auth-Komponenten leben in einer Registry im Frontend
3. **Neuer Connector = neue Auth-Komponente** — wird im Frontend registriert, nicht im Connector
4. **Plattformbetreiber kann einschränken** — über Connector-Konfiguration (`allowedAuthMethods`)
5. **AuthState als Observable** — App reagiert reaktiv auf Login/Logout

**Plattformbetreiber-Konfiguration:**

```typescript
const connector = new RestConnector({
  baseUrl: 'https://api.example.org',
  allowedAuthMethods: ['password']  // Kein OAuth — nur Passwort erlaubt
})
// getAuthMethods() liefert dann nur "password"
```

---

## Offene Fragen

Diese Aspekte werden in der Implementierung geklärt:

1. **Migration** – Kann man von einem Connector zu einem anderen wechseln?
2. **Hybrid-Szenarien** – Können verschiedene Connector-Typen sinnvoll kombiniert werden?
3. **Feature-Katalog** – Welcher Feature-Baum ist verbindlich? Ein initialer Katalog muss definiert werden, sobald die ersten Connectoren implementiert werden.
4. **Typisierung** – Wie wird TypeScript-Typsicherheit für `item.data` und den Feature-Baum hergestellt? (z.B. über typisierte Item-Varianten oder eine generische Registry)
5. **Prädikat-Katalog erweitern** – Der initiale Katalog deckt Kanban und Feed ab. Weitere Prädikate werden ergänzt, sobald neue Module entstehen.
6. ~~**Group-Interface erweitern?**~~ → Entschieden, siehe unten.

### Entschiedene Fragen

- **Reaktivität** → Observable-Pattern: `observe()` liefert ein lebendes Objekt mit `current` und `subscribe()`. Connector-intern umgesetzt via CRDT-Events, WebSocket, GraphQL Subscriptions oder Polling-Fallback. *(Entschieden: 5. März 2026)*
- **title in data vs. top-level** → `title` lebt in `data`, nicht als Pflichtfeld. Nicht jeder Item-Typ hat einen Titel. Module nutzen Fallbacks. *(Entschieden: 5. März 2026)*
- **Item-Typ** → `type` ist Pflichtfeld auf Item-Ebene. Bestimmt Rendering (wie dargestellt), während Daten-Felder das Modul-Routing bestimmen (wo dargestellt). *(Entschieden: 5. März 2026)*
- **Relations** → RDF-kompatibles Tripel-Modell, eingebettet am Item als `relations[]`. Abfrage via `getRelatedItems()` / `observeRelatedItems()` aus `RelationCapable`. *(Entschieden: 5. März 2026; Capability-Zuschnitt aktualisiert)*
- **Relations-Scope** → Scope-Prefixes für Relation-Targets: `item:` (selber Space), `space:{id}/item:` (Cross-Space), `global:` (User-IDs). Cross-Space-Referenzen sind ein Kernziel — Menschen kooperieren über Kontextgrenzen hinweg. Connector zeigt bei fehlenden Zugriffsrechten einen Hinweis statt stillschweigend zu ignorieren. *(Entschieden: 7. März 2026)*
- **Schema-Versionierung** → Optionale Felder `schema` und `schemaVersion` am Item. *(Entschieden: 5. März 2026)*
- **Kein separater Data Layer** → Der Connector ist vollständig verantwortlich für Caching, Optimistic Updates und Reaktivität. Die Hooks sind dünn — sie übersetzen nur Observable → React State und Mutations → `Promise<Item>`. Server-Connectors können intern TanStack Query nutzen. Bei Local-First ist Caching/Optimistic Update unnötig, da Writes instant sind. *(Entschieden: 6. März 2026)*
- **Mutations-Vertrag** → Wenn ein Connector `ItemWriter` unterstützt, geben `createItem()` und `updateItem()` `Promise<Item>` zurück — ein vollständiges Item mit ID und allen Feldern, sofort nutzbar. Der Connector garantiert die Zustände. *(Entschieden: 6. März 2026; Capability-Zuschnitt aktualisiert)*
- **User vs. Profil** → User = Identität (nur ID, mit gecachtem displayName/avatarUrl aus dem Profil-Item). Profil = Item (`type: "profile"`) mit zwei Sichtbarkeitsstufen: öffentlich (jeder) und privat (nur Kontakte). User ist kein Item, Profil ist ein Item. *(Entschieden: 7. März 2026)*
- **Auth-Abstraktion** → Connector liefert nur Daten (`getAuthMethods()` → Strings), Frontend besitzt die Auth-UI-Komponenten in einer Registry. `AuthState` als Observable. Plattformbetreiber kann Auth-Methoden über Connector-Konfiguration einschränken. *(Entschieden: 6. März 2026)*
- **FeatureInterface gestrichen** → Kein separates Interface. Feature-Erkennung über ein generisches Item (`type: "feature"`) mit verschachteltem Objektbaum in `data`. Truthy = unterstützt, falsy = nicht unterstützt. Alles läuft über das DataInterface. *(Entschieden: 6. März 2026)*
- **Lifecycle** → `init()` und `dispose()` im DataInterface. App ruft `init()` beim Start, `dispose()` beim Unmount. Connector nutzt `init()` für Setup (Connections, CRDT laden, Sync starten) und `dispose()` für Cleanup. *(Entschieden: 7. März 2026)*
- **Group-Interface** → `Group` bekommt ein `data`-Feld (analog zu Item) für Beschreibung, Bild, Zugangsmodell, aktivierte Module, Rollen. Management-Methoden (`createGroup`, `updateGroup`, `deleteGroup`, `getMembers`, `inviteMember`, `removeMember`) liegen in `GroupManager`, nicht im read-only `DataInterface`. Feature-Item steuert, welche Gruppen-Funktionen der Connector unterstützt. Das Interface ist bewusst additiv erweiterbar — zukünftige Funktionen (Einladungs-Annahme, demokratische Abstimmungen, neue Zugangsmodelle) können als neue Methoden und `data`-Felder hinzugefügt werden, ohne bestehenden Code zu brechen. *(Entschieden: 7. März 2026, mit Sebastian; Capability-Zuschnitt aktualisiert)*
- **Hooks + ConnectorProvider im Toolkit** → Hooks (`useItems`, `useItem`, `useGroups`, `useCurrentUser`, `useCreateItem`, `useUpdateItem`) und der `ConnectorProvider` (React Context) leben im Toolkit-Package — nicht in der App. Jede App übergibt ihren Connector via `<ConnectorProvider connector={...}>`. *(Entschieden: 7. März 2026, mit Sebastian)*
- **Kanban-Spalten konfigurierbar** → Kanban-Spalten sind nicht hardcoded (Todo/Doing/Done), sondern konfigurierbar. Das Feature-Item meldet `kanban.customColumns: true`. *(Entschieden: 7. März 2026, mit Sebastian)*
- **BaseConnector** → Abstrakte Convenience-Klasse mit sinnvollen Default-Implementierungen für optionale Capabilities (Groups, Auth, Sources). Ein einfacher Connector kann direkt nur `DataInterface` implementieren; wer von `BaseConnector` erbt, bekommt FullConnector-Komfort und implementiert die Item-Methoden. Die BaseConnector-Klasse ist Convenience, kein Zwang. *(Entschieden: 7. März 2026, mit Sebastian und Ulf; Capability-Zuschnitt aktualisiert)*
- **Gruppen als Scopes / Item-Zuordnung** → Items haben kein `groupId`-Feld. `setCurrentGroup()` setzt den Scope, `getItems()` liefert nur Items dieses Scopes. Der Connector entscheidet intern über die Zuordnung. "Persönlich", "Freunde" und "Alles" werden als spezielle Gruppen modelliert (`data.scope: "personal" | "friends" | "aggregate"`). Das Interface ändert sich nicht. **Begründung:** Bei WoT leben Items *in* verschlüsselten CRDT-Spaces — sie haben kein `groupId`, weil sie außerhalb des Space nicht existieren. Ein flaches Datenmodell mit `groupId` auf Item-Ebene würde zu diesem Backend nicht passen. *(Entschieden: 10. März 2026)*

---

## Weiterführend

- [Module im Detail](../modules/) – Spezifikationen der einzelnen UI-Module
- [Web of Trust Datenmodell](../../web-of-trust/docs/datenmodell/) – Entitäten im WoT
- [Connector-Implementierung](./connectors/) – Technische Details der Connectoren

---

*Diese Spezifikation ist ein lebendiges Dokument und wird basierend auf Implementierungserfahrungen aktualisiert.*
