import type {
  FullConnector,
  Item,
  ItemFilter,
  Group,
  User,
  Observable,
  Unsubscribe,
  AuthState,
  AuthMethod,
  RelatedItemsOptions,
  Source,
  ContactInfo,
  RelayState,
  VerificationDirection,
  ConfirmationIssueInput,
  ConfirmationView,
  EncounterPeerInfo,
  VerificationChallenge,
  PublicProfileData,
  IncomingEvent,
} from "./index.js"

// --- Shared Helpers for Connector implementations ---

export type ReactiveObservable<T> = Observable<T> & {
  set(value: T): void
  /** Mark the first fetch as settled (loaded), notifying subscribers even if the
   *  value is unchanged — so an async source resolving to an *empty* result still
   *  flips `loaded` and re-renders. No-op once already loaded. */
  markLoaded(): void
  destroy(): void
}

/**
 * Shallow equality check for Observable values.
 * - Primitives + null/undefined: strict equality
 * - Arrays: same length + every element === (reference equality)
 * - Objects: always false (new objects from notifyObservers are intentional updates)
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }
  return false
}

/**
 * Create a reactive observable. `loaded` defaults to `true` for synchronous
 * sources whose initial value is already authoritative; pass `false` for an
 * async source that resolves its first value later and call `markLoaded()` once
 * it settles (see {@link ReactiveObservable.markLoaded}).
 */
export function createObservable<T>(initial: T, loaded = true): ReactiveObservable<T> {
  let current = initial
  let isLoaded = loaded
  const subscribers = new Set<(value: T) => void>()

  return {
    get current() {
      return current
    },
    get loaded() {
      return isLoaded
    },
    subscribe(callback: (value: T) => void): Unsubscribe {
      subscribers.add(callback)
      return () => subscribers.delete(callback)
    },
    set(value: T) {
      if (shallowEqual(current, value)) return
      current = value
      subscribers.forEach((cb) => cb(value))
    },
    markLoaded() {
      if (isLoaded) return
      isLoaded = true
      subscribers.forEach((cb) => cb(current))
    },
    destroy() {
      subscribers.clear()
    },
  }
}

/**
 * Apply limit/offset pagination to a sorted array.
 */
export function applyPagination<T>(items: T[], limit?: number, offset?: number): T[] {
  const start = offset ?? 0
  if (limit != null) return items.slice(start, start + limit)
  if (start > 0) return items.slice(start)
  return items
}

/**
 * First `[lng, lat]` pair found in an arbitrarily nested GeoJSON `coordinates`
 * value (Point → the pair itself; LineString/Polygon/Multi* → first vertex).
 * Returns null if no numeric pair is reachable.
 */
function firstLngLat(coordinates: unknown): [number, number] | null {
  if (!Array.isArray(coordinates)) return null
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    return [coordinates[0], coordinates[1]]
  }
  for (const part of coordinates) {
    const found = firstLngLat(part)
    if (found) return found
  }
  return null
}

/**
 * Whether an item's `data.position` falls inside `bbox` (`[west, south, east,
 * north]`). A box with `west > east` wraps across the ±180° antimeridian.
 * Items without a parsable position never match a bbox filter.
 */
function positionInBbox(item: Item, bbox: [number, number, number, number]): boolean {
  const position = (item.data as { position?: { coordinates?: unknown } }).position
  const lngLat = position ? firstLngLat(position.coordinates) : null
  if (!lngLat) return false
  const [lng, lat] = lngLat
  const [west, south, east, north] = bbox
  if (lat < south || lat > north) return false
  return west <= east ? lng >= west && lng <= east : lng >= west || lng <= east
}

export function matchesFilter(item: Item, filter: ItemFilter): boolean {
  if (filter.type && item.type !== filter.type) return false
  if (filter.createdBy && item.createdBy !== filter.createdBy) return false
  if (filter.hasField) {
    for (const field of filter.hasField) {
      if (!(field in item.data)) return false
    }
  }
  if (filter.hasTag && filter.hasTag.length > 0) {
    const itemTags = item.tags ?? []
    for (const tag of filter.hasTag) {
      if (!itemTags.includes(tag)) return false
    }
  }
  if (filter.bbox && !positionInBbox(item, filter.bbox)) return false
  return true
}

/**
 * Find related items with support for forward, reverse, and bidirectional lookups.
 *
 * - "from" (default): item has relation → find targets
 * - "to": find items whose relations point TO this item (reverse/incoming)
 * - "both": union of "from" and "to"
 */
export function findRelatedItems(
  itemId: string,
  allItems: Item[],
  predicate?: string,
  options?: RelatedItemsOptions
): Item[] {
  const direction = options?.direction ?? "from"
  const results: Item[] = []
  const seen = new Set<string>()

  // Forward: item's own relations → find targets
  if (direction === "from" || direction === "both") {
    const item = allItems.find((i) => i.id === itemId)
    if (item?.relations) {
      const matching = predicate
        ? item.relations.filter((r) => r.predicate === predicate)
        : item.relations
      const targetIds = matching
        .map((r) => r.target.replace(/^(item:|global:)/, ""))
        .filter((t) => !t.startsWith("space:"))
      for (const target of allItems) {
        if (targetIds.includes(target.id) && !seen.has(target.id)) {
          results.push(target)
          seen.add(target.id)
        }
      }
    }
  }

  // Reverse: find items whose relations point to itemId
  if (direction === "to" || direction === "both") {
    for (const candidate of allItems) {
      if (seen.has(candidate.id)) continue
      if (!candidate.relations) continue
      const matching = predicate
        ? candidate.relations.filter((r) => r.predicate === predicate)
        : candidate.relations
      const pointsToMe = matching.some((r) => {
        const targetId = r.target.replace(/^(item:|global:)/, "")
        return targetId === itemId
      })
      if (pointsToMe) {
        results.push(candidate)
        seen.add(candidate.id)
      }
    }
  }

  return applyPagination(results, options?.limit, options?.offset)
}

const DEFAULT_GROUP: Group = { id: "default", name: "Default" }

/**
 * Abstrakte Basisklasse fuer Connectoren.
 *
 * Implementiert alle optionalen Methoden mit sinnvollen Defaults.
 * Ein einfacher Connector muss nur die abstrakten Methoden implementieren:
 * - getItems, getItem, createItem, updateItem, deleteItem
 *
 * Alles andere (Groups, Auth, Sources, Observables) hat Default-Verhalten.
 */
export abstract class BaseConnector implements FullConnector {
  // --- Lifecycle (override bei Bedarf) ---

  async init(): Promise<void> {}
  async dispose(): Promise<void> {}

  // --- Items (MUSS implementiert werden) ---

  abstract getItems(filter?: ItemFilter): Promise<Item[]>
  abstract getItem(id: string): Promise<Item | null>
  abstract createItem(item: Omit<Item, "id" | "createdAt">): Promise<Item>
  abstract updateItem(id: string, updates: Partial<Item>): Promise<Item>
  abstract deleteItem(id: string): Promise<void>

  // --- Observables (Default: kein Live-Update) ---

  observe(filter: ItemFilter): Observable<Item[]> {
    // Async default: starts unloaded and markLoaded() once the first fetch
    // settles (even when empty), so consumers can tell "loading" from "loaded,
    // empty". `.finally` also covers errors so it never sticks on loading.
    const observable = createObservable<Item[]>([], false)
    this.getItems(filter)
      .then((items) => observable.set(items))
      .catch((err) => console.error("[BaseConnector] observe initial load failed", err))
      .finally(() => observable.markLoaded())
    return observable
  }

  observeItem(id: string): Observable<Item | null> {
    const observable = createObservable<Item | null>(null, false)
    this.getItem(id)
      .then((item) => observable.set(item))
      .catch((err) => console.error("[BaseConnector] observeItem initial load failed", err))
      .finally(() => observable.markLoaded())
    return observable
  }

  // --- Relations (Default: forward + reverse lookup via shared helper) ---

  async getRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Promise<Item[]> {
    const allItems = await this.getItems()
    return findRelatedItems(itemId, allItems, predicate, options)
  }

  observeRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Observable<Item[]> {
    const observable = createObservable<Item[]>([], false)
    this.getRelatedItems(itemId, predicate, options)
      .then((items) => observable.set(items))
      .catch((err) => console.error("[BaseConnector] observeRelatedItems initial load failed", err))
      .finally(() => observable.markLoaded())
    return observable
  }

  // --- Groups (Default: eine Default-Gruppe) ---

  protected groupsObservable: ReactiveObservable<Group[]> = createObservable<Group[]>([DEFAULT_GROUP])
  protected currentGroupObservable: ReactiveObservable<Group | null> = createObservable<Group | null>(DEFAULT_GROUP)

  async getGroups(): Promise<Group[]> {
    return this.groupsObservable.current
  }

  observeGroups(): Observable<Group[]> {
    return this.groupsObservable
  }

  getCurrentGroup(): Group | null {
    return this.currentGroupObservable.current
  }

  observeCurrentGroup(): Observable<Group | null> {
    return this.currentGroupObservable
  }

  setCurrentGroup(_id: string | null): void {}

  async createGroup(_name: string, _data?: Record<string, unknown>): Promise<Group> {
    throw new Error("createGroup not supported")
  }

  async updateGroup(_id: string, _updates: Partial<Group>): Promise<Group> {
    throw new Error("updateGroup not supported")
  }

  async deleteGroup(_id: string): Promise<void> {
    throw new Error("deleteGroup not supported")
  }

  async getMembers(_groupId: string | null): Promise<User[]> {
    return []
  }

  observeMembers(_groupId: string | null): Observable<User[]> {
    return createObservable<User[]>([])
  }

  async inviteMember(_groupId: string, _userId: string): Promise<void> {
    throw new Error("inviteMember not supported")
  }

  async removeMember(_groupId: string, _userId: string): Promise<void> {
    throw new Error("removeMember not supported")
  }

  // --- Users (Default: kein User) ---

  async getCurrentUser(): Promise<User | null> {
    return null
  }

  observeCurrentUser(): Observable<User | null> {
    return createObservable<User | null>(null)
  }

  async getUser(_id: string): Promise<User | null> {
    return null
  }

  // --- Auth (Default: unauthenticated) ---

  getAuthState(): Observable<AuthState> {
    return createObservable<AuthState>({ status: "unauthenticated" })
  }

  getAuthMethods(): AuthMethod[] {
    return []
  }

  async authenticate(_method: string, _credentials: unknown): Promise<User> {
    throw new Error("authenticate not supported")
  }

  async logout(): Promise<void> {}

  // --- Sources (Default: single source) ---

  getSources(): Source[] {
    return [{ id: "default", name: "Default", connector: this }]
  }

  getActiveSource(): Source {
    return { id: "default", name: "Default", connector: this }
  }

  setActiveSource(_sourceId: string): void {}

  // --- Contacts (Default: not supported) ---

  async getContacts(): Promise<ContactInfo[]> {
    return []
  }

  observeContacts(): Observable<ContactInfo[]> {
    return createObservable<ContactInfo[]>([])
  }

  async addContact(_id: string, _name?: string): Promise<ContactInfo> {
    throw new Error("addContact not supported")
  }

  async activateContact(_id: string): Promise<void> {
    throw new Error("activateContact not supported")
  }

  async updateContactName(_id: string, _name: string): Promise<void> {
    throw new Error("updateContactName not supported")
  }

  async removeContact(_id: string): Promise<void> {
    throw new Error("removeContact not supported")
  }

  // --- Messaging (Default: disconnected) ---

  getRelayState(): Observable<RelayState> {
    return createObservable<RelayState>("disconnected")
  }

  getOutboxPendingCount(): Observable<number> {
    return createObservable<number>(0)
  }

  // --- Encounter Verification (Default: not supported) ---

  async createVerificationChallenge(): Promise<VerificationChallenge> {
    throw new Error("createVerificationChallenge not supported")
  }

  async prepareVerificationResponse(_challengeCode: string): Promise<EncounterPeerInfo> {
    throw new Error("prepareVerificationResponse not supported")
  }

  async confirmVerificationResponse(_challengeCode: string): Promise<void> {
    throw new Error("confirmVerificationResponse not supported")
  }

  async counterVerify(_targetId: string): Promise<void> {
    throw new Error("counterVerify not supported")
  }

  getVerificationStatus(_contactId: string): VerificationDirection {
    return "none"
  }

  // --- Confirmations (Default: empty; hasConfirmations() stays false until overridden) ---

  async getConfirmations(): Promise<ConfirmationView[]> {
    return []
  }

  observeConfirmations(): Observable<ConfirmationView[]> {
    return createObservable<ConfirmationView[]>([])
  }

  async issueConfirmation(_input: ConfirmationIssueInput): Promise<ConfirmationView> {
    throw new Error("issueConfirmation not supported")
  }

  async setConfirmationAccepted(_id: string, _accepted: boolean): Promise<void> {
    throw new Error("setConfirmationAccepted not supported")
  }

  // --- Profile (Default: not supported) ---

  async getMyProfile(): Promise<Item | null> {
    return null
  }

  observeMyProfile(): Observable<Item | null> {
    return createObservable<Item | null>(null)
  }

  async updateMyProfile(_updates: Partial<Record<string, unknown>>): Promise<Item> {
    throw new Error("updateMyProfile not supported")
  }

  async setFieldVisibility(_field: string, _isPublic: boolean): Promise<void> {
    throw new Error("setFieldVisibility not supported")
  }

  async getPublicProfile(_id: string): Promise<PublicProfileData | null> {
    return null
  }

  async syncProfile(): Promise<void> {}

  isSyncPending(): Observable<boolean> {
    return createObservable<boolean>(false)
  }

  // --- Event Listener (Default: no-op) ---

  onIncomingEvent(_callback: (event: IncomingEvent) => void): () => void {
    return () => {}
  }

  // --- Item-Group Assignment (Default: not supported) ---

  getItemGroupId(_itemId: string): string | null {
    return null
  }

  moveItemToGroup(_itemId: string, _targetGroupId: string): void {
    throw new Error("moveItemToGroup not supported")
  }
}
