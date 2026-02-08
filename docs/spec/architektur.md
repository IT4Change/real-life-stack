# Real Life Stack – Architektur-Spezifikation

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

  // Items (immer im Kontext der aktuellen Gruppe)
  getItems(filter?: ItemFilter): Promise<Item[]>
  getItem(id: string): Promise<Item | null>
  createItem(item: Omit<Item, 'id' | 'createdAt'>): Promise<Item>
  updateItem(id: string, updates: Partial<Item>): Promise<Item>
  deleteItem(id: string): Promise<void>

  // Nutzer
  getCurrentUser(): Promise<User | null>
  getUser(id: string): Promise<User | null>

  // Quellen (für Multi-Source)
  getSources(): Source[]
  getActiveSource(): Source
  setActiveSource(sourceId: string): void
}

interface Group {
  id: string
  name: string
  // Weitere Felder Connector-spezifisch (z.B. members, admins bei WoT)
}

interface ItemFilter {
  type?: string
  hasAttribute?: string[]
  createdBy?: string
  source?: string
}
```

### 3. Connector

Ein Connector implementiert die Daten-Schnittstelle für ein spezifisches Backend. Jeder Connector ist eigenständig und bringt alles mit:

- Authentifizierung / Identität
- Datenspeicherung
- Synchronisation
- Verschlüsselung (falls nötig)

**Wichtig:** Connectoren sind nicht komponierbar. Man wählt einen Connector oder kombiniert mehrere auf Daten-Ebene (Multi-Source).

---

## Das generische Item

Items sind die universelle Datenstruktur. Module interpretieren sie basierend auf Attributen.

```typescript
interface Item {
  // Pflichtfelder
  id: string
  title: string
  createdAt: Date
  createdBy: string      // User-ID (DID oder Server-ID)

  // Optional
  description?: string

  // Flexible Attribute
  attributes: Record<string, unknown>

  // Metadaten (nur lesen)
  _source?: string       // Woher kommt das Item?
}
```

### Attribut-basierte Modul-Zuordnung

Ein Item erscheint in Modulen basierend auf seinen Attributen:

```typescript
// Dieses Item erscheint in Kanban UND Kalender
const item: Item = {
  id: "abc123",
  title: "Team-Meeting vorbereiten",
  createdAt: new Date(),
  createdBy: "did:key:z6Mk...",
  attributes: {
    status: "doing",           // → Kanban zeigt es
    start: "2024-01-15T10:00", // → Kalender zeigt es
    end: "2024-01-15T11:00",
    tags: ["arbeit", "wichtig"]
  }
}
```

### Bekannte Attribute

Module definieren, welche Attribute sie verstehen:

| Attribut | Typ | Genutzt von |
|----------|-----|-------------|
| `status` | string | Kanban |
| `start` | ISO DateTime | Kalender |
| `end` | ISO DateTime | Kalender |
| `location` | GeoJSON | Karte |
| `address` | string | Karte |
| `tags` | string[] | Alle (Filter) |
| `type` | string | Routing/Filter |
| `visibility` | string | Berechtigungen |

**Validierung:** Module sind verantwortlich für die Validierung ihrer Attribute. Die Schnittstelle erzwingt keine Struktur.

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

---

## Weiterführend

- [Module im Detail](../modules/) – Spezifikationen der einzelnen UI-Module
- [Web of Trust Datenmodell](../../web-of-trust/docs/datenmodell/) – Entitäten im WoT
- [Connector-Implementierung](./connectors/) – Technische Details der Connectoren

---

*Diese Spezifikation ist ein lebendiges Dokument und wird basierend auf Implementierungserfahrungen aktualisiert.*
