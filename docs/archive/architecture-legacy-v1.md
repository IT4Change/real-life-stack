# Real Life Stack – Architektur-Spezifikation

> **Archiviert:** Dieses Dokument ist die erste Architektur-Spezifikation vor dem heutigen Capability- und Spec-Zuschnitt. Es ist nicht mehr normativ. Aktuelle Einstiegspunkte sind [../spec/README.md](../spec/README.md) und [../spec/00-architecture.md](../spec/00-architecture.md).

> Modularer Frontend-Baukasten mit backend-agnostischer Connector-Architektur

---

## Übersicht

Real Life Stack ist ein modularer UI-Baukasten für lokale Vernetzung. Die Architektur trennt UI-Module strikt von der Datenquelle durch eine einheitliche Schnittstelle und austauschbare Connectoren.

```
┌─────────────────────────────────────────────────────────────┐
│                       UI-Module                             │
│           (Kanban, Kalender, Karte, Feed, ...)              │
├─────────────────────────────────────────────────────────────┤
│                    Daten-Schnittstelle                      │
│  DataInterface: getItems(), createItem(), getUser(), ...    │
│  FeatureInterface: getDocument(), getCollection(), ...      │
├─────────────────────────────────────────────────────────────┤
│                      Connector(s)                           │
│               (implementiert die Schnittstelle)             │
├────────────────┬────────────────┬───────────────────────────┤
│ REST-Connector │ WoT-Connector  │   Weitere Connectoren     │
│                │                │                           │
│ - Server-Login │ - wot-core    │   - GraphQL               │
│ - REST API     │ - DID-basiert  │   - Local-only            │
│ - Sessions     │ - Local-first  │   - ActivityPub           │
└────────────────┴────────────────┴───────────────────────────┘
```

### Kernprinzipien

1. **Module sind pure UI** – Sie wissen nicht, woher die Daten kommen
2. **Generische Items** – Ein Item kann in mehreren Modulen erscheinen
3. **Connector-Pattern** – Jeder Connector implementiert die komplette Schnittstelle
4. **Daten-Mixing** – Daten aus verschiedenen Quellen können kombiniert werden

---

## Schichten im Detail

### 1. UI-Module

Module sind reine Darstellungskomponenten. Sie:
- Rufen Daten über die Schnittstelle ab
- Rendern Items basierend auf deren Attributen
- Senden Änderungen zurück über die Schnittstelle
- Kennen weder Backend noch Authentifizierung

**Verfügbare Module:**

| Modul | Zeigt Items mit | Beschreibung |
|-------|-----------------|--------------|
| Kanban | `status` | Aufgaben in Spalten organisieren |
| Kalender | `start`, `end` | Termine zeitlich darstellen |
| Karte | `location` | Orte geografisch visualisieren |
| Feed | `createdAt` | Chronologischer Aktivitäts-Stream |
| Profil | `type: "profile"` | Nutzerprofile anzeigen |

### 2. Daten-Schnittstelle

Die zentrale API, die alle Module nutzen. Sie abstrahiert:
- **Daten** – Items, Profile, Gruppen
- **Identität** – Aktueller Nutzer, Authentifizierung
- **Quellen** – Woher Daten kommen (für Anzeige)

```typescript
interface DataInterface {
  // Gruppen
  getGroups(): Promise<Group[]>
  getCurrentGroup(): Group | null
  setCurrentGroup(id: string): void

  // Items — einmalig laden
  getItems(filter?: ItemFilter): Promise<Item[]>
  getItem(id: string): Promise<Item | null>

  // Items — reaktiv beobachten (bevorzugter Weg)
  observe(filter: ItemFilter): Observable<Item[]>
  observeItem(id: string): Observable<Item | null>

  // Items — schreiben
  createItem(item: Omit<Item, 'id' | 'createdAt'>): Promise<Item>
  updateItem(id: string, updates: Partial<Item>): Promise<Item>
  deleteItem(id: string): Promise<void>

  // Relations
  getRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Promise<Item[]>

  // Nutzer
  getCurrentUser(): Promise<User | null>
  getUser(id: string): Promise<User | null>

  // Quellen (für Multi-Source)
  getSources(): Source[]
  getActiveSource(): Source
  setActiveSource(sourceId: string): void
}

interface Observable<T> {
  current: T                                  // Aktueller Wert (synchron)
  subscribe(callback: (value: T) => void): Unsubscribe  // Bei Änderungen benachrichtigen
}

type Unsubscribe = () => void

interface RelatedItemsOptions {
  direction?: "from" | "to" | "both"   // Default: "to"
  depth?: number                        // Verschachtelte Relations auflösen
}

interface Group {
  id: string
  name: string
  // Weitere Felder Connector-spezifisch (z.B. members, admins bei WoT)
}

interface ItemFilter {
  type?: string
  hasField?: string[]              // Items filtern die bestimmte Felder in data haben
  createdBy?: string
  source?: string
  include?: IncludeDirective[]     // Relations inline mitladen
}

interface IncludeDirective {
  predicate: string                // Welche Relation auflösen?
  as: string                       // Feld-Name in _included
  limit?: number                   // Max. Anzahl
}
```

### Reaktivität

Die Schnittstelle ist reaktiv. Der bevorzugte Weg, Daten zu lesen, ist `observe()` — es liefert ein lebendes Objekt zurück, das sich automatisch aktualisiert, wenn sich Daten ändern (lokal oder durch andere Nutzer).

```typescript
// Observable liefert immer den aktuellen Stand
const tasks = connector.observe({ type: "task", hasField: ["status"] })
tasks.current  // → [task1, task2, ...]  (synchroner Zugriff)

// Bei Änderungen benachrichtigt werden
const unsub = tasks.subscribe((updatedTasks) => {
  renderBoard(updatedTasks)
})
```

`getItems()` und `getItem()` existieren weiterhin für einmalige Abfragen, z.B. beim Export oder für Hintergrund-Operationen.

**React-Hook:**

```typescript
function useObserve(filter: ItemFilter): Item[] {
  const connector = useConnector()
  const observable = useMemo(() => connector.observe(filter), [filter])
  const [items, setItems] = useState(observable.current)

  useEffect(() => observable.subscribe(setItems), [observable])

  return items
}

// Nutzung — die UI ist automatisch reaktiv:
function KanbanBoard() {
  const tasks = useObserve({ type: "task", hasField: ["status"] })
  // Re-rendert automatisch wenn sich Items ändern
}
```

**Backend-Umsetzung — der Connector entscheidet, wie Reaktivität intern funktioniert:**

| Connector | Mechanismus | Latenz |
|-----------|-------------|--------|
| WoT (Automerge) | CRDT-Events, alles lokal | Sofort |
| WoT (Evolu) | SQLite Live-Queries | Sofort |
| GraphQL | GraphQL Subscriptions | Sofort |
| REST + WebSocket | WS für Push, REST für Daten, lokaler Cache | Sofort |
| REST (minimal) | Polling-Fallback | Sekunden |

Die Observable-API ist für alle Backends gleich — nur der Mechanismus dahinter unterscheidet sich. Ein REST-Server ohne WebSocket funktioniert trotzdem, pollt aber statt zu pushen.

### 3. Connector

Ein Connector implementiert die Daten-Schnittstelle für ein spezifisches Backend. Jeder Connector ist eigenständig und bringt alles mit:

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
  createdAt: Date
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
  _included?: Record<string, Item[]>  // Aufgelöste Relations (bei include-Abfragen)
}
```

**Hinweis:** `title` und `description` sind keine Pflichtfelder auf Item-Ebene, sondern leben in `data`. Nicht jeder Item-Typ hat einen Titel (z.B. ein GPS-Wegpunkt oder ein Sensor-Messwert). Module die einen Anzeigenamen brauchen, lesen `data.title` — ist keiner vorhanden, nutzen sie einen Fallback (z.B. den `type` oder `id`).

### Typ vs. Attribute: Zwei Achsen

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
    { predicate: "assignedTo", target: "did:key:z6Mk..." }
  ]
}
```

Ein Modul prüft nicht den `type`, sondern die vorhandenen Daten-Felder:

| Modul | Zeigt Items die `data` enthält | Beschreibung |
|-------|-------------------------------|--------------|
| Kanban | `status` | Aufgaben in Spalten organisieren |
| Kalender | `start` (und optional `end`) | Termine zeitlich darstellen |
| Karte | `location` | Orte geografisch visualisieren |
| Feed | *(alle Items)* | Chronologischer Aktivitäts-Stream |
| Profil | *(via User-ID)* | Nutzerprofile anzeigen |

Der `type` wird vom Modul genutzt, um zu entscheiden **wie** das Item innerhalb des Moduls dargestellt wird — z.B. zeigt der Kalender ein Event anders als einen Task mit Deadline.

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
| `visibility` | string | Berechtigungen |
| `content` | string | Feed (Fließtext) |

**Validierung:** Module sind verantwortlich für die Validierung ihrer Daten-Felder. Die Schnittstelle erzwingt keine Struktur — das Schema dient der Dokumentation und optionalen Validierung durch den Connector.

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
  target: string                    // Wohin? (Item-ID, User-ID, externe URI)
  meta?: Record<string, unknown>    // Optionale Metadaten (z.B. { role: "reviewer" })
}
```

Das Item selbst ist das Subject — zusammen mit `predicate` und `target` ergibt sich ein vollständiges RDF-Tripel:

```
item:task-123  →  assignedTo  →  did:key:z6Mk...
item:task-123  →  childOf     →  item:task-100
item:post-abc  →  commentOn   →  item:post-xyz   (umgekehrt: Kommentar zeigt auf Post)
```

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

Das DataInterface bietet zwei Wege, Relations aufzulösen:

**1. Explizit — verwandte Items laden:**

```typescript
interface DataInterface {
  // ... bestehende Methoden ...

  getRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Promise<Item[]>
}

interface RelatedItemsOptions {
  direction?: "from" | "to" | "both"   // Default: "to" — Items die auf dieses zeigen
  depth?: number                        // Verschachtelte Relations auflösen
}
```

```typescript
// Alle Kommentare zu einem Post
const comments = await connector.getRelatedItems("post-abc", "commentOn")

// Alle Sub-Tasks (auch verschachtelt)
const subtasks = await connector.getRelatedItems("task-100", "childOf", { depth: 2 })
```

**2. Inline — beim Laden von Items Relations mitauflösen:**

```typescript
interface IncludeDirective {
  predicate: string       // Welche Relation?
  as: string              // Feld-Name im Ergebnis (_included)
  limit?: number          // Max. Anzahl
}
```

```typescript
// Feed laden mit Kommentaren und Likes in einem Aufruf
const posts = await connector.getItems({
  type: "post",
  include: [
    { predicate: "commentOn", as: "comments", limit: 3 },
    { predicate: "likedBy", as: "likes" }
  ]
})

// Ergebnis: Jeder Post hat _included.comments und _included.likes
posts[0]._included?.comments  // → [{ id: "comment-1", ... }, ...]
posts[0]._included?.likes     // → [{ id: "did:key:...", ... }, ...]
```

### Backend-Umsetzung

Wie ein Connector Relations intern auflöst, ist ihm überlassen:

| Connector | Umsetzung |
| --- | --- |
| REST | `GET /items/post-abc/relations?predicate=commentOn` |
| GraphQL | `query { item(id: "post-abc") { comments { ... } } }` |
| WoT (Automerge) | Index-Dokument lesen → referenzierte Dokumente laden |

Die Schnittstelle ist identisch — nur die Implementierung unterscheidet sich.

### JSON-LD Kompatibilität

Die Item-Struktur ist so gestaltet, dass sie mit minimalem Aufwand als JSON-LD exportiert werden kann:

```typescript
// Internes Item:
{
  id: "task-123", type: "task",
  data: { title: "Build Pipeline", status: "doing" },
  relations: [{ predicate: "childOf", target: "task-100" }]
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

### REST-Connector

Klassische Server-Anbindung mit Session-basierter Authentifizierung.

```typescript
class RestConnector implements DataInterface {
  constructor(config: {
    baseUrl: string
    // Optional: Auth-Strategie
  })

  // Login/Logout
  login(credentials: { email: string; password: string }): Promise<User>
  logout(): Promise<void>

  // Implementiert DataInterface...
}
```

**Eigenschaften:**
- Server speichert Daten
- Session-basierte Auth (JWT, Cookies)
- Echtzeit via WebSockets optional
- Klassisches Rechte-Management

### WoT-Connector

Dezentrale Anbindung via [Web of Trust](https://github.com/IT4Change/web-of-trust).

```typescript
class WotConnector implements DataInterface {
  constructor(config: {
    storage: WotStorage  // z.B. Evolu, LocalStorage
  })

  // Keine separates Login - DID ist die Identität
  // Identity wird beim ersten Start generiert oder wiederhergestellt

  // Implementiert DataInterface...
}
```

**Eigenschaften:**
- Nutzt `wot-core` für DID, Kryptografie, Signaturen
- Local-first mit Sync
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

## Generisches Feature-Interface

Das `DataInterface` (Abschnitt 2) deckt die Kern-Entitäten Items, Gruppen und Nutzer ab. Darüber hinaus gibt es Features, die nicht in dieses Schema passen – z.B. ein personalisierter Feed, Freundschaftsvorschläge oder Statistiken. Gleichzeitig muss nicht jedes Backend den vollen Funktionsumfang unterstützen.

Das generische Feature-Interface löst beide Probleme: Es bietet eine einheitliche Schnittstelle für beliebige Features und ermöglicht es der UI, sich dynamisch an den Funktionsumfang des verbundenen Backends anzupassen.

### Schnittstelle

```typescript
interface FeatureInterface {
  // Lesen
  getDocument(featureKey: string, request?: object): Promise<Document>
  getCollection(featureKey: string, request?: object, options?: CollectionOptions): Promise<Collection>

  // Schreiben
  setDocument(featureKey: string, request: object): Promise<Document>
  addDocument(featureKey: string, request: object): Promise<Document>
  removeDocument(featureKey: string, request: object): Promise<void>

  // Feature-Erkennung
  isSupported(...featureKeys: string[]): Record<string, boolean>
}

interface CollectionOptions {
  pagination?: {
    cursor?: string
    limit?: number
  }
  resolve?: {
    relations?: boolean
    depth?: number          // Wie tief Relationen aufgelöst werden
  }
}

interface Collection {
  items: Document[]
  nextCursor?: string       // Für Pagination
  total?: number            // Falls vom Backend bekannt
}

type Document = Record<string, unknown>
```

### Feature-Keys

Feature-Keys sind hierarchisch durch Punkte gegliedert. Sie benennen das Feature, nicht die Datenstruktur.

```
user.feed                    // Persönlicher Feed
user.friends                 // Freundesliste
user.friends.suggestions     // Freundschaftsvorschläge
group.stats                  // Gruppenstatistiken
group.activity               // Aktivitäts-Log einer Gruppe
moderation.reports           // Gemeldete Inhalte
```

Die Punkt-Hierarchie dient der Namensorganisation – übergeordnete Keys implizieren **nicht** automatisch die Unterstützung untergeordneter Keys. `isSupported("user.friends")` kann `true` sein, während `isSupported("user.friends.suggestions")` `false` ist.

### Lese-Operationen

**`getDocument`** gibt ein einzelnes Objekt zurück. Das `request`-Objekt enthält feature-spezifische Parameter.

```typescript
// Profil eines Nutzers abrufen
const profile = await connector.getDocument("user.profile", { userId: "did:key:z6Mk..." })

// Gruppenstatistiken
const stats = await connector.getDocument("group.stats", { groupId: "garten" })
```

**`getCollection`** gibt eine Liste zurück, mit optionalem Paging und Relationsauflösung.

```typescript
// Feed mit Pagination
const feed = await connector.getCollection("user.feed", {}, {
  pagination: { limit: 20 }
})

// Nächste Seite
const nextPage = await connector.getCollection("user.feed", {}, {
  pagination: { cursor: feed.nextCursor, limit: 20 }
})

// Freundschaftsvorschläge mit aufgelösten Profil-Relationen
const suggestions = await connector.getCollection("user.friends.suggestions", {}, {
  resolve: { relations: true, depth: 1 }
})
```

### Schreib-Operationen

Analog zu den Lese-Operationen gibt es drei Schreib-Methoden:

**`setDocument`** erstellt oder aktualisiert ein Dokument.

```typescript
// Profilbild aktualisieren
await connector.setDocument("user.profile", {
  userId: "did:key:z6Mk...",
  avatarUrl: "https://..."
})
```

**`addDocument`** fügt ein neues Dokument zu einer Collection hinzu.

```typescript
// Freundschaftsanfrage senden
await connector.addDocument("user.friends.requests", {
  targetUserId: "did:key:z6Mk..."
})

// Inhalt melden
await connector.addDocument("moderation.reports", {
  itemId: "abc123",
  reason: "spam"
})
```

**`removeDocument`** entfernt ein Dokument.

```typescript
// Freundschaft entfernen
await connector.removeDocument("user.friends", {
  friendId: "did:key:z6Mk..."
})
```

### Feature-Erkennung und adaptive UI

`isSupported` ermöglicht der UI, sich dynamisch an das Backend anzupassen. Mehrere Feature-Keys können in einem Aufruf geprüft werden.

```typescript
const support = connector.isSupported(
  "user.feed",
  "user.friends",
  "user.friends.suggestions",
  "moderation.reports"
)
// → { "user.feed": true, "user.friends": true,
//     "user.friends.suggestions": false, "moderation.reports": false }
```

**UI-Konsequenz:** Für jedes Feature muss definiert werden, ob es **obligatorisch** oder **optional** ist. Die UI reagiert darauf:

| Kategorie | Verhalten | Beispiel |
|-----------|-----------|----------|
| **Obligatorisch** | Feature muss vorhanden sein, Connector ist ohne es nicht nutzbar | Items, Gruppen, Nutzer-Identität |
| **Optional** | UI blendet Bereich aus oder zeigt Fallback | Freundschaftsvorschläge, Statistiken |

```typescript
// Beispiel: Bedingte UI-Darstellung
function FriendsSection() {
  const support = useFeatureSupport("user.friends", "user.friends.suggestions")

  if (!support["user.friends"]) return null  // Ganz ausblenden

  return (
    <div>
      <FriendsList />
      {support["user.friends.suggestions"] && <SuggestionsList />}
    </div>
  )
}
```

---

## Multi-Source

Die Architektur erlaubt das Kombinieren von Daten aus mehreren Quellen.

```typescript
// Beispiel: Daten aus WoT + Google Calendar
const sources = [
  new WotConnector({ storage: evoluStorage }),
  new GoogleCalendarConnector({ apiKey: "..." })
]

const aggregator = new SourceAggregator(sources)

// Items aus allen Quellen
const items = await aggregator.getItems()
// Jedes Item hat _source für Anzeige
```

### Sync und Speichern

- **Lesen:** Items aus allen Quellen werden zusammengeführt
- **Schreiben:** Nutzer wählt, wo neue Items gespeichert werden
- **Sync:** Jede Quelle synchronisiert sich selbst

```
┌──────────────────────────────────────────────┐
│              SourceAggregator                │
├──────────────────────────────────────────────┤
│                                              │
│  getItems() ───► Merge aus allen Quellen     │
│                                              │
│  createItem() ──► An aktive Quelle senden    │
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

### Gruppen-Wechsel

Ein Nutzer kann Mitglied mehrerer Gruppen sein und zwischen ihnen wechseln:

```typescript
// Gruppen des Nutzers
const groups = await connector.getGroups()
// → [{ id: "garten", name: "Gemeinschaftsgarten" },
//    { id: "repair", name: "Repair-Café" }]

// Aktuelle Gruppe wechseln
connector.setCurrentGroup("repair")

// Items sind jetzt aus dem Repair-Café Kontext
const items = await connector.getItems()
```

### Simple Apps

Für einfache Apps ohne Gruppen-Wechsel gibt es einen impliziten Default-Kontext. `getGroups()` liefert dann nur eine Gruppe, und kein Gruppen-Switcher ist nötig.

---

## Identität und Nutzer

### User

Ein User ist eine Identität mit Profil:

```typescript
interface User {
  id: string              // Connector-spezifisch (DID oder Server-ID)
  profile: UserProfile
}

interface UserProfile {
  displayName: string
  avatarUrl?: string
}
```

**Hinweis:** Ein User ist kein Item. Die Identität ist fundamental anders als Inhalte.

### Identitätsmodelle

Je nach Connector unterschiedlich:

| Connector | Identität      | Auth                   |
|-----------|----------------|------------------------|
| REST      | Server-Account | E-Mail/Passwort, OAuth |
| WoT       | DID (did:key)  | Keypair (Ed25519)      |

---

## Offene Fragen

Diese Aspekte werden in der Implementierung geklärt:

1. **Auth-Abstraktion** – Wie abstrahieren wir Keypair-Auth (WoT) und Server-Auth (REST) so, dass Module davon nichts wissen müssen?
2. **User-Profil als Item?** – Ist ein Nutzerprofil ein Item oder eine eigene Entität? (Hinweis: Über das FeatureInterface wäre ein Profil ein Document unter `"user.profile"` – unabhängig von der Item-Frage.)
3. **Migration** – Kann man von einem Connector zu einem anderen wechseln?
4. **Hybrid-Szenarien** – Können verschiedene Connector-Typen sinnvoll kombiniert werden?
5. **Feature-Katalog** – Welche Feature-Keys sind obligatorisch, welche optional? Ein verbindlicher Katalog muss definiert werden, sobald die ersten Connectoren implementiert werden.
6. **Typisierung** – Wie wird TypeScript-Typsicherheit für feature-spezifische Request/Response-Strukturen hergestellt? (z.B. über eine generische Registry `FeatureKey → RequestType, ResponseType`)
7. **Prädikat-Katalog erweitern** – Der initiale Katalog deckt Kanban und Feed ab. Weitere Prädikate werden ergänzt, sobald neue Module entstehen.

### Entschiedene Fragen

- **Reaktivität** → Observable-Pattern: `observe()` liefert ein lebendes Objekt mit `current` und `subscribe()`. Connector-intern umgesetzt via CRDT-Events, WebSocket, GraphQL Subscriptions oder Polling-Fallback. *(Entschieden: 5. März 2026)*
- **title in data vs. top-level** → `title` lebt in `data`, nicht als Pflichtfeld. Nicht jeder Item-Typ hat einen Titel. Module nutzen Fallbacks. *(Entschieden: 5. März 2026)*
- **Item-Typ** → `type` ist Pflichtfeld auf Item-Ebene. Bestimmt Rendering (wie dargestellt), während Daten-Felder das Modul-Routing bestimmen (wo dargestellt). *(Entschieden: 5. März 2026)*
- **Relations** → RDF-kompatibles Tripel-Modell, eingebettet am Item als `relations[]`. Abfrage via `getRelatedItems()` und `include`-Direktive. *(Entschieden: 5. März 2026)*
- **Schema-Versionierung** → Optionale Felder `schema` und `schemaVersion` am Item. *(Entschieden: 5. März 2026)*

---

## Weiterführend

- [Module im Detail](../modules/) – Spezifikationen der einzelnen UI-Module
- [Web of Trust Datenmodell](../../web-of-trust/docs/datenmodell/) – Entitäten im WoT
- [Connector-Implementierung](./connectors/) – Technische Details der Connectoren

---

*Diese Spezifikation ist ein lebendiges Dokument und wird basierend auf Implementierungserfahrungen aktualisiert.*
