# Reaktivität im Real Life Stack — Spezifikation & AI-Instruktionen

> Verbindliche Referenz für alle Entwickler und AI-Assistenten.
> Gilt für: data-interface, local-connector, wot-connector, toolkit (Hooks), App Shell und Space Modules.

---

## 1. Datenfluss — Die Schichten

```
┌─────────────────────────────────────────────────────────┐
│  wot-core          Subscribable<T>                       │
│  (YjsStorageAdapter, YjsReplicationAdapter)              │
│  → watchContacts(), watchSpaces(), onRemoteUpdate()      │
├─────────────────────────────────────────────────────────┤
│  Connector          Observable<T>                        │
│  (WotConnector, LocalConnector)                          │
│  → observe(), observeItem(), observeRelatedItems()       │
│  → notifyAllObservers() bei jeder Mutation               │
├─────────────────────────────────────────────────────────┤
│  Hooks              React State                          │
│  (useItems, useItem, useRelatedItems, useGroups)         │
│  → useState + useEffect + subscribe                      │
├─────────────────────────────────────────────────────────┤
│  UI-Flächen         Reine Darstellung                    │
│  (Feed, Kanban, Kalender, Karte)                         │
│  → Empfangen Daten via Hooks, kein eigener State         │
└─────────────────────────────────────────────────────────┘
```

**Jede Schicht hat genau eine Verantwortung. Keine Schicht wird übersprungen.**

| Schicht | Verantwortung | Darf NICHT |
|---------|--------------|-----------|
| **wot-core** | CRDT-Events, Subscribable bereitstellen | UI kennen, React importieren |
| **Connector** | Subscribable → Observable übersetzen, Filter anwenden | Direkt React State setzen |
| **Hooks** | Observable → React State, Capability-Checks | Eigene Datenhaltung, Business-Logik |
| **UI-Flächen** | Rendern, User-Interaktion | Connector direkt ansprechen, Daten fetchen |

---

## 2. Item-Typ — createdAt ist ein ISO-String

```typescript
interface Item {
  id: string
  type: string
  createdAt: string    // ISO-8601 (z.B. "2026-03-17T14:30:00.000Z")
  createdBy: string
  data: Record<string, unknown>
  relations?: Relation[]
  _source?: string
}
```

**`createdAt` ist ein String, KEIN Date-Objekt.** Das vermeidet Serialisierungs-Overhead (kein `new Date()` bei jedem Lesen). Wenn die UI ein Date braucht: `new Date(item.createdAt)`.

ISO-8601 Strings sortieren lexikographisch korrekt: `"2026-01-01" < "2026-01-02"`.

---

## 3. Observable-Vertrag

### Erstellen und Nutzen

```typescript
import { createObservable } from "@real-life-stack/data-interface"

const obs = createObservable<Item[]>([])  // Startwert
obs.set(newItems)                          // Feuert alle Subscriber
obs.current                                // Synchroner Zugriff auf aktuellen Wert
obs.destroy()                              // Alle Subscriber entfernen (in dispose())
```

### Im Hook: Subscribe

```typescript
function useItems(filter?: ItemFilter) {
  const connector = useConnector()
  const observable = useMemo(() => connector.observe(filter ?? {}), [connector, filterKey])
  const [data, setData] = useState<Item[]>(observable.current)

  useEffect(() => {
    setData(observable.current)
    return observable.subscribe(setData)
  }, [observable])

  return { data }
}
```

### Regeln

- `observe(filter)` gibt eine **stabile Referenz** zurück (gecached per `JSON.stringify(filter)`)
- Der Connector ruft `notifyAllObservers()` bei **jeder** Mutation (create, update, delete)
- Hooks nutzen `useState` + `useEffect` mit `subscribe` — **NICHT** `useSyncExternalStore`
- Observables werden in `dispose()` via `destroy()` aufgeräumt

---

## 4. Relations

### Grundprinzip: Forward vs. Reverse

Alle Relations leben in `item.relations[]` — niemals in `data`. Es gibt zwei Perspektiven:

**Forward-Relations** — das Item **hat** die Relation. Kommt beim Laden des Items automatisch mit. Kein extra Laden nötig.

```typescript
// Task hat 2 Assignees → Forward-Relations im Task selbst
{
  id: "task-1",
  type: "task",
  data: { title: "Feature bauen", status: "doing" },
  relations: [
    { predicate: "assignedTo", target: "global:did:key:z6Mk..." },
    { predicate: "assignedTo", target: "global:did:key:z6Mn..." }
  ]
}
```

**Reverse-Relations** — ein **anderes Item** zeigt auf dieses Item. Muss aktiv gesucht werden per `useRelatedItems`. Das Item selbst weiß nichts davon.

```typescript
// Kommentar zeigt auf den Task → Reverse-Relation
{
  id: "comment-1",
  type: "comment",
  data: { content: "Sieht gut aus!" },
  relations: [{ predicate: "commentOn", target: "item:task-1" }]
}
// task-1 hat KEINE Referenz auf comment-1 — man muss aktiv fragen:
// "Welche Items zeigen mit commentOn auf task-1?"
```

### Wann Forward, wann Reverse?

| | Forward (im Item) | Reverse (eigenes Item) |
|---|---|---|
| **Wann** | Gehört fest zum Item, wenige Einträge | Eigenständig, kann unbegrenzt wachsen |
| **Beispiele** | Assignees, Tags, Verortung | Kommentare, Reaktionen, Sub-Tasks |
| **Lifecycle** | Stirbt mit dem Item | Eigener Autor, editierbar, löschbar |
| **Laden** | Gratis — kommt mit dem Item | Muss per `useRelatedItems` geladen werden |

### Direction-Semantik

```
Forward:  Task ──assignedTo──► User     direction: "from" (Default)
Reverse:  Task ◄──commentOn── Comment   direction: "to"
```

| Direction | Frage | Beispiel |
|-----------|-------|---------|
| `"from"` (Default) | "Worauf zeigt dieses Item?" | Task → assignedTo → User |
| `"to"` | "Welche Items zeigen auf mich?" | Task ← commentOn ← Comments |
| `"both"` | "Alle Verbindungen" | Beides zusammen |

### Scope-Prefixe für Targets

| Prefix | Bedeutung | Beispiel |
|--------|-----------|---------|
| `item:` | Item im selben Space | `item:task-1` |
| `global:` | User-ID (DID), kein Item | `global:did:key:z6Mk...` |
| `space:{id}/item:` | Item in anderem Space | Cross-Space-Referenz |

**Wichtig:** `global:` Targets sind User-IDs, keine Items. Sie werden über die Members-Liste (`useMembers`) aufgelöst, nicht per Item-Lookup. Das `global:` Prefix wird in der UI entfernt: `target.replace(/^global:/, "")`.

### Kommentar erstellen (Reverse-Relation)

```typescript
await connector.createItem({
  type: "comment",
  createdBy: currentUser.id,
  data: { content: "Mein Kommentar" },
  relations: [{ predicate: "commentOn", target: "item:post-abc" }]
})
```

### Reverse-Relations reaktiv laden — useRelatedItems

Jede Komponente die Reverse-Relations anzeigt, nutzt `useRelatedItems` **in der Kind-Komponente**:

```typescript
// Feed.tsx — lädt nur Posts
function Feed() {
  const { data: posts } = useItems({ type: "post" })
  return posts.map(post => <PostCard key={post.id} post={post} />)
}

// PostCard.tsx — lädt eigene Kommentare (Reverse-Lookup)
function PostCard({ post }: { post: Item }) {
  const { data: comments } = useRelatedItems(post.id, "commentOn", { direction: "to" })
  return (
    <div>
      <h2>{post.data.title}</h2>
      {comments.map(c => <Comment key={c.id} comment={c} />)}
    </div>
  )
}
```

**Warum in der Kind-Komponente?** Wenn ein Kommentar zu Post 5 kommt, re-rendert nur PostCard 5 — nicht der ganze Feed.

### Forward-Relations auflösen (Assignees)

Forward-Relations kommen mit dem Item. In der UI werden sie gegen bekannte Daten aufgelöst:

```typescript
// KanbanCard — Assignees aus item.relations lesen
function KanbanCard({ item, users }) {
  const assigneeIds = (item.relations ?? [])
    .filter(r => r.predicate === "assignedTo")
    .map(r => r.target.replace(/^global:/, ""))

  // Gegen Members-Liste matchen (kein useRelatedItems nötig)
  const assignees = assigneeIds.map(id => users.find(u => u.id === id)).filter(Boolean)

  return <div>{assignees.map(u => <Avatar key={u.id} user={u} />)}</div>
}
```

### Prädikat-Katalog

| Prädikat | Bedeutung | Typische Richtung | Typ |
|----------|-----------|-------------------|-----|
| `assignedTo` | Zugewiesen an Person | Forward (Task → User) | `global:` |
| `commentOn` | Kommentar zu Item | Reverse (Comment → Post) | `item:` |
| `childOf` | Sub-Item / Sub-Task | Reverse (SubTask → Task) | `item:` |
| `likedBy` | Gefällt einer Person | Forward (Post → User) | `global:` |
| `blocks` | Blockiert anderes Item | Forward (Task → Task) | `item:` |
| `relatedTo` | Allgemeine Verknüpfung | Forward | `item:` |
| `locatedAt` | Verortung | Forward (Event → Place) | `item:` |

### Shared Helper (data-interface)

Alle Connectors nutzen denselben Helper — **keine eigene Implementierung in Connectors!**

```typescript
import { findRelatedItems } from "@real-life-stack/data-interface"

// Connector-intern (in getRelatedItems + notifyObservers):
findRelatedItems(itemId, allItems, predicate?, options?)
```

---

## 5. Gruppen-Kontext

- Items leben in der **aktuellen Gruppe/Space**
- `setCurrentGroup(id)` wechselt den Kontext → `notifyAllObservers()` mit neuem Doc
- `observeCurrentGroup()` ist reaktiv — feuert bei Gruppenwechsel und Metadaten-Änderungen
- Feature-Items (`type: "feature"`) sind gruppenübergreifend sichtbar

---

## 6. Capability-Checks

Hooks und UI **müssen** Capabilities prüfen, bevor sie Features nutzen:

```typescript
import { isWritable, hasRelations, hasGroups, hasContacts } from "@real-life-stack/data-interface"

if (isWritable(connector)) {
  await connector.createItem(...)
}

if (hasRelations(connector)) {
  const obs = connector.observeRelatedItems(itemId, "commentOn", { direction: "to" })
}
```

**Nie annehmen, dass ein Connector alles kann.**

---

## 7. Anti-Patterns — Was AI NICHT tun darf

### ❌ Direkte wot-core Imports in UI

```typescript
// FALSCH
import { getYjsPersonalDoc } from "@real-life/wot-core"

// RICHTIG
const { data } = useItems({ type: "contact" })
```

### ❌ Polling / setTimeout als Reaktivitäts-Ersatz

```typescript
// FALSCH
useEffect(() => {
  const interval = setInterval(async () => {
    const items = await connector.getItems(filter)
    setData(items)
  }, 1000)
  return () => clearInterval(interval)
}, [])

// RICHTIG
useEffect(() => {
  return observable.subscribe(setData)
}, [observable])
```

### ❌ Relations in data einbetten

```typescript
// FALSCH
await connector.updateItem("post-1", {
  data: { ...post.data, comments: [...post.data.comments, newComment] }
})

// RICHTIG
await connector.createItem({
  type: "comment",
  createdBy: user.id,
  data: { content: "..." },
  relations: [{ predicate: "commentOn", target: "item:post-1" }]
})
```

### ❌ Manueller Reverse-Lookup in der UI

```typescript
// FALSCH — alle Kommentare laden und manuell filtern
const { data: allComments } = useItems({ type: "comment" })
const commentsForPost = allComments.filter(c =>
  c.relations?.some(r => r.target === `item:${post.id}`)
)

// RICHTIG — useRelatedItems in der Kind-Komponente
function PostCard({ post }) {
  const { data: comments } = useRelatedItems(post.id, "commentOn", { direction: "to" })
}
```

### ❌ createdAt als Date behandeln

```typescript
// FALSCH
item.createdAt.toLocaleDateString("de-DE")

// RICHTIG
new Date(item.createdAt).toLocaleDateString("de-DE")
```

---

## 8. Pagination (limit)

### Warum Limit statt Cursor?

Im CRDT-Fall (Yjs) liegen **alle Items lokal im Speicher**. Es gibt keinen Server-Roundtrip zwischen Seiten. Paging ist eine **UI-Optimierung** (weniger rendern), keine Netzwerk-Optimierung.

Cursor-basiertes Paging löst Probleme von serverseitigen Datenbanken (verschobene Offsets bei gleichzeitigen Schreibern). Im CRDT-Fall gibt es dieses Problem nicht — bei jeder Änderung feuert `notifyAllObservers()` und die UI bekommt den kompletten aktuellen State neu.

### Interface-Erweiterungen

```typescript
interface ItemFilter {
  type?: string
  hasField?: string[]
  createdBy?: string
  source?: string
  limit?: number    // Max. Anzahl Items
  offset?: number   // Überspringe die ersten N
}

interface RelatedItemsOptions {
  direction?: "from" | "to" | "both"
  limit?: number
  offset?: number
}
```

### Pattern: Infinite Scroll mit wachsendem Limit

Kein klassischer Paginator mit Seiten. Stattdessen wächst das `limit`:

```typescript
function Feed() {
  const [visibleCount, setVisibleCount] = useState(20)
  const { data: posts } = useItems({ type: "post", limit: visibleCount })

  return (
    <div>
      {posts.map(post => <PostCard key={post.id} post={post} />)}
      <button onClick={() => setVisibleCount(v => v + 20)}>Mehr laden</button>
    </div>
  )
}
```

Bei CRDT-Sync kommt ein neuer Post rein → `notifyAllObservers()` feuert → die UI bekommt die neuesten `visibleCount` Items. Kein Item wird übersprungen, keins doppelt.

### Connector-intern: Filter → Sort → Slice

```typescript
// So implementiert jeder Connector limit/offset:
const filtered = allItems.filter(item => matchesFilter(item, filter))
const sorted = filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
return sorted.slice(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? Infinity))
```

### Skalierungsgrenzen im CRDT-Fall

`limit` reduziert **Render-Last**, nicht Speicher oder Netzwerk. Das Y.Doc enthält immer alle Items. Für echte Skalierung (100k+ Items pro Space) gibt es langfristig:
- **Space-Splitting** — alte Items in Archiv-Space verschieben
- **Lazy Spaces** — Space erst öffnen wenn der User reinnavigiert (ist heute schon so)

Für den POC mit hunderten Items pro Space ist `limit` ausreichend.

---

## 9. Subscription-Cleanup

Jeder Connector **muss** in `dispose()` alle Subscriptions aufräumen:

```typescript
async dispose(): Promise<void> {
  this.spacesSubscriptionUnsub?.()
  this.personalDocUnsub?.()
  this.contactsUnsub?.()
  this.verificationsUnsub?.()
  this.attestationsUnsub?.()
  this.profileUnsub?.()

  await this.replication?.stop()
  await this.wsAdapter?.disconnect()

  for (const obs of this.itemObservables.values()) obs.destroy()
  for (const obs of this.relatedObservables.values()) obs.destroy()
  for (const obs of this.memberObservables.values()) obs.destroy()
  this.itemObservables.clear()
  this.relatedObservables.clear()
  this.memberObservables.clear()
}
```

---

## 9. Checkliste für neue Features

Wenn du ein neues reaktives Feature baust (z.B. Kommentare, Reaktionen, Benachrichtigungen):

- [ ] Daten als **eigene Items** mit Relations modelliert (nicht eingebettet)?
- [ ] `useRelatedItems()` in der Kind-Komponente statt manuellem Lookup?
- [ ] `getRelatedItems()` mit korrekter `direction` genutzt?
- [ ] `createdAt` als ISO-String behandelt (kein `new Date()` beim Erstellen)?
- [ ] Nur über Connector + Hooks auf Daten zugegriffen (kein wot-core Bypass)?
- [ ] Capability-Check (`isWritable`, `hasRelations`, etc.) vor Nutzung?
- [ ] Subscription-Cleanup in `dispose()`?
- [ ] Kein Polling, kein setTimeout, kein forceUpdate?
- [ ] Bei potenziell vielen Items: `limit` in `useItems()` oder `useRelatedItems()` gesetzt?
