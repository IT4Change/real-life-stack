# DataInterface Core

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt den kleinsten gemeinsamen RLS-Vertrag zwischen UI, Hooks und Connectoren. Der Core ist bewusst klein und read-only. Alles, was schreibt, authentifiziert, Gruppen verwaltet, Relations auflöst oder Trust-Daten bereitstellt, liegt in separaten Capabilities.

Code-Referenz: `packages/data-interface/src/index.ts`

## Zweck

`DataInterface` macht RLS backend-agnostisch:

```text
UI modules -> hooks -> DataInterface -> connector -> data source
```

Ein UI-Modul darf gegen diesen Vertrag arbeiten, ohne zu wissen, ob die Daten aus Mock-Daten, IndexedDB, GraphQL, Supabase, WoT/Yjs oder einer anderen Quelle kommen.

## Core Types

### Item

Ein `Item` ist die generische Datenstruktur des RLS.

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

Regeln:

1. `createdAt` ist ein ISO-8601-String, kein `Date`-Objekt.
2. Fachliche Felder liegen in `data`, nicht top-level.
3. `type` ist offen. RLS kennt Beispiele wie `task`, `event`, `post`, `place`, `profile`, `comment` oder `reaction`, aber Connectoren dürfen weitere Typen liefern.
4. `schema` und `schemaVersion` können maschinenlesbare Schemata anzeigen, sind aber nicht erforderlich.
5. `_source` ist ein optionaler Hinweis auf die Datenquelle; UI darf daraus keine Trust-Aussage ableiten.

### Relation

```ts
interface Relation {
  predicate: string
  target: string
  meta?: Record<string, unknown>
}
```

Relations verbinden Items mit anderen Items, Personen, Spaces oder externen Zielen. Details stehen in [03-items-relations-groups-spaces.md](03-items-relations-groups-spaces.md).

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

`Group` ist der technische RLS-Begriff. In WoT- und RLNP-Kontexten entspricht das häufig einem Space. Details stehen in [03-items-relations-groups-spaces.md](03-items-relations-groups-spaces.md).

## Observable

```ts
interface Observable<T> {
  current: T
  subscribe(callback: (value: T) => void): Unsubscribe
}
```

Regeln:

1. `current` liefert synchron den letzten bekannten Wert.
2. `subscribe()` registriert Änderungen und gibt eine Unsubscribe-Funktion zurück.
3. Hooks übersetzen Observables in React State.
4. UI-Module sprechen den Connector nicht direkt an, wenn ein Hook existiert.
5. Reaktive Detailregeln stehen in [reaktivitaet.md](reaktivitaet.md).

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
  createdBy?: string
  source?: string
  limit?: number
  offset?: number
}
```

Mindestbedeutung:

| Feld | Bedeutung |
|---|---|
| `type` | Nur Items mit diesem `type` |
| `hasField` | Nur Items, deren `data` alle genannten Felder enthält |
| `createdBy` | Nur Items dieser Autor-ID |
| `source` | Optionaler Quellenfilter, wenn ein Connector mehrere Quellen unterscheidet |
| `limit` / `offset` | UI-Paginierung über eine bereits geladene oder beobachtbare Menge |

`limit` und `offset` sind UI-Optimierungen. Sie ersetzen keine Trust-, Sichtbarkeits- oder Berechtigungslogik.

## Nicht-Ziele

`DataInterface` definiert bewusst nicht:

- das soziale Modell von RLNP,
- Spielregeln des Real Life Game,
- WoT-Kryptografie oder Attestation-Formate,
- Auth- und Account-Lebenszyklen,
- Schreib-, Sync-, Delivery- oder Retry-Status.

Diese Fähigkeiten werden über Capabilities, Connectoren oder andere Repositories beschrieben.

