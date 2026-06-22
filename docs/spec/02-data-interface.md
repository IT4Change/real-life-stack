# DataInterface Core

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt den kleinsten gemeinsamen RLS-Vertrag zwischen UI, Hooks und Connectoren. Der Core ist bewusst klein und read-only. Alles, was schreibt, authentifiziert, Gruppen verwaltet, Relations auflöst oder Trust-Daten bereitstellt, liegt in separaten Capabilities.

Code-Referenz: `packages/data-interface/src/index.ts`

## Zweck

`DataInterface` macht RLS backend-agnostisch:

```text
App Shell / Space Modules -> hooks -> DataInterface -> connector -> data source
```

Eine UI-Fläche darf gegen diesen Vertrag arbeiten, ohne zu wissen, ob die Daten aus Mock-Daten, IndexedDB, GraphQL, Supabase, WoT/Yjs oder einer anderen Quelle kommen.

## Core Types

### Item

Ein `Item` ist die generische Datenstruktur des RLS.

```ts
interface Item {
  id: string
  type: string
  createdAt: string
  createdBy: string
  "@context"?: string[]
  schema?: string
  schemaVersion?: number
  data: Record<string, unknown>
  relations?: Relation[]
  tags?: string[]
  _source?: string
}
```

Regeln:

1. `createdAt` ist ein ISO-8601-String, kein `Date`-Objekt.
2. Fachliche Felder liegen in `data`, nicht top-level. Ausnahmen: `@context`, `tags`, `relations` — orthogonale Achsen, nicht Inhalt.
3. `tags` ist eine top-level Liste von String- oder URN-Identifiern. Siehe [07-tags.md](07-tags.md).
4. `type` ist offen. RLS kennt Beispiele wie `task`, `event`, `post`, `place`, `profile`, `comment` oder `reaction`, aber Connectoren dürfen weitere Typen liefern.
5. `@context` deklariert die aktiven Vocabularies. Siehe [06-schema-composition.md](06-schema-composition.md).
6. `schema` und `schemaVersion` können maschinenlesbare Schemata anzeigen, sind aber nicht erforderlich.
7. `_source` ist ein optionaler Hinweis auf die Datenquelle; UI darf daraus keine Trust-Aussage ableiten.

### Relation

```ts
interface Relation {
  predicate: string
  target: string
  meta?: Record<string, unknown>
}
```

Relations verbinden Items mit anderen Items, Personen, Spaces oder externen Zielen. Details stehen in [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md).

### Group und User

```ts
interface Group {
  id: string
  name: string
  members?: string[]
  data?: Record<string, unknown>
}

interface User {
  id: string
  displayName?: string
  avatarUrl?: string
}
```

`Group` ist der technische RLS-Begriff. In WoT- und RLNP-Kontexten entspricht das häufig einem Space. Details stehen in [04-items-relations-groups-spaces.md](04-items-relations-groups-spaces.md).

## Observable

```ts
interface Observable<T> {
  current: T
  subscribe(callback: (value: T) => void): Unsubscribe
  loaded?: boolean
}
```

Regeln:

1. `current` liefert synchron den letzten bekannten Wert.
2. `subscribe()` registriert Änderungen und gibt eine Unsubscribe-Funktion zurück.
3. `loaded` zeigt, ob der **initiale lokale Bestand gelesen** ist. Synchrone Quellen sind ab Erzeugung geladen; eine async Quelle (netz-/persistenzgestütztes `observe`) ist `false`, bis ihr erster Read settled — auch wenn das Ergebnis leer ist. Optional und „loaded by default": `false` heißt lädt-noch, alles andere geladen. So lässt sich **leer-weil-lädt** von **leer-weil-wirklich-leer** unterscheiden (Skeleton vs. Empty-State). Ein async Connector MUSS `loaded` nach Abschluss des ersten Reads setzen (auch bei leerem Resultat).
4. Hooks übersetzen Observables in React State; `isLoading` leitet sich aus `loaded` ab, nicht aus „Liste leer".
5. UI-Flächen sprechen den Connector nicht direkt an, wenn ein Hook existiert.
6. Reaktive Detailregeln stehen in [reaktivitaet.md](reaktivitaet.md).

### Readiness vs. Sync

`loaded` betrifft nur die **lokale Lese-Ebene** („ist der Bestand des Scopes gelesen?"), nicht die Netzwerk-Konvergenz. Bei local-first ist lokal die Wahrheit; das CRDT konvergiert, wann es kann. Drei komplementäre, nicht überlappende Signale:

| Signal | Ebene | Frage |
|---|---|---|
| `Observable.loaded` | Lesen | Initialer lokaler Bestand gelesen? → Skeleton vs. Empty-State |
| `getOutboxPendingCount()` | Schreiben | Wie viele eigene Änderungen warten aufs Netz? → Pending-Badge |
| `isProfileSyncPending()` | Schreiben (Profil) | Läuft gerade ein Profil-Publish? |

Die vierte denkbare Frage — „bin ich gegenüber dem Netz aktuell?" — beantwortet bei local-first bewusst niemand.

## Core Methods

```ts
interface DataInterface {
  init(): Promise<void>
  dispose(): Promise<void>
  getItems(filter?: ItemFilter): Promise<Item[]>
  getItem(id: string): Promise<Item | null>
  observe(filter: ItemFilter): Observable<Item[]>
  observeItem(id: string): Observable<Item | null>
}
```

Regeln:

1. `init()` bereitet den Connector vor. Hooks und Apps dürfen erst danach stabile Daten erwarten.
2. `dispose()` gibt lokale Ressourcen, Subscriptions oder Verbindungen frei.
3. `getItems()` und `getItem()` laden einmalig.
4. `observe()` und `observeItem()` liefern reaktive Sichten.
5. Der Core schreibt nie. Schreiben liegt in `ItemWriter`.
6. Der Core verwaltet keine Auth, Groups, Relations, Contacts, Profile, Messaging oder Confirmations.

## Filter

```ts
interface ItemFilter {
  type?: string
  hasField?: string[]
  hasTag?: string[]
  createdBy?: string
  source?: string
  bbox?: [number, number, number, number]
  limit?: number
  offset?: number
}
```

Mindestbedeutung:

| Feld | Bedeutung |
|---|---|
| `type` | Nur Items mit diesem `type` |
| `hasField` | Nur Items, deren `data` alle genannten Felder enthält |
| `hasTag` | Nur Items, deren top-level `tags` alle genannten Strings enthält (AND, leeres Array matched alle) — siehe [07-tags.md](07-tags.md) |
| `createdBy` | Nur Items dieser Autor-ID |
| `source` | Optionaler Quellenfilter, wenn ein Connector mehrere Quellen unterscheidet |
| `bbox` | Nur Items mit Position innerhalb der Bounding-Box `[west, south, east, north]` (GeoJSON-Längen-/Breitengrade). Viewport-begrenzte Abfrage (v.a. Karte); ein Connector ohne Geo-Index DARF clientseitig filtern, ein backend-gestützter Connector SOLL serverseitig einschränken. |
| `limit` / `offset` | UI-Paginierung über eine bereits geladene oder beobachtbare Menge |

`limit` und `offset` sind UI-Optimierungen. Sie ersetzen keine Trust-, Sichtbarkeits- oder Berechtigungslogik.

`bbox` ist der Daten-Seam für skalierende Karten: dieselbe Abfrage liefert lokal (voller Satz, clientseitig gefiltert) wie später backend-gestützt (z.B. GraphQL, serverseitig eingeschränkt) nur die Items im sichtbaren Ausschnitt. Serverseitiges **Clustering** bei sehr großen Mengen (Rückgabe aggregierter Cluster statt Einzel-Items) ist eine **zukünftige, separate Query** und nicht Teil von `ItemFilter` (der `Item[]` zurückgibt) — siehe [modules/map.md](modules/map.md) → Datenquelle.

## Nicht-Ziele

`DataInterface` definiert bewusst nicht:

- das soziale Modell von RLNP,
- Spielregeln des Real Life Game,
- WoT-Kryptografie oder Attestation-Formate,
- Auth- und Account-Lebenszyklen,
- Schreib-, Sync-, Delivery- oder Retry-Status.

Diese Fähigkeiten werden über Capabilities, Connectoren oder andere Repositories beschrieben.
