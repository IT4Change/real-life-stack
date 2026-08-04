import type {
  CreateItemInput,
  FullConnector,
  Item,
  ItemFilter,
  Group,
  User,
  Observable,
  AuthState,
  AuthMethod,
  ActivityEntry,
  ActivityLogCapable,
  ScopedActivityLogCapable,
  ScopedActivityEntry,
  NotificationState,
  NotificationStateCapable,
  NotificationStatePatch,
  RelatedItemsOptions,
  RelationRecord,
  RelationRecordFilter,
  RelationRecordInput,
  RelationRecordUpdate,
  Source,
} from "@real-life-stack/data-interface"
import { createObservable, createDefaultRelationStore, matchesFilter, findRelatedItems, applyPagination, deriveActivitySummary, itemDisplayTitle, moduleHintsFor, applyNotificationStatePatch, cloneNotificationState } from "@real-life-stack/data-interface"
import { get, set, del, createStore, update as updateStoredValue } from "idb-keyval"

// --- Types ---

/**
 * Bump this whenever the demo seed data changes in a way that existing
 * local stores should pick up (e.g. updated `users.json`, new demo
 * items). On the next load a persisted store stamped with an older
 * version is discarded and re-seeded, instead of silently keeping the
 * stale data. This is a demo-data refresh switch, not a data migration
 * — a re-seed throws away anything created locally, which is fine for
 * the local-only dev/test connector.
 */
export const SEED_VERSION = 2

interface StoredState {
  items: Item[]
  groups: Group[]
  users: User[]
  groupMembers: Record<string, string[]>
  groupItems: Record<string, string[]>
  currentUserId: string | null
  currentGroupId: string | null
  nextItemId: number
  /** Seed version the store was last seeded with (see SEED_VERSION). */
  seedVersion: number
  /** Additive: legacy states are read as an empty map. */
  activityByScope?: Record<string, Record<string, ActivityEntry>>
  /** Additive: old local stores start with an empty notification state. */
  notificationState?: NotificationState
}

interface BroadcastMessage {
  type: "items-changed" | "groups-changed" | "full-sync"
  senderId: string
}

function cloneGroupItems(groupItems: Record<string, string[]> | undefined): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(groupItems ?? {}).map(([groupId, itemIds]) => [groupId, [...itemIds]])
  )
}

function compareActivity(a: ActivityEntry, b: ActivityEntry): number {
  return b.ts.localeCompare(a.ts) || b.actor.localeCompare(a.actor) || b.id.localeCompare(a.id)
}

function appendActivity(
  activityByScope: Record<string, Record<string, ActivityEntry>>,
  scopeId: string,
  action: ActivityEntry["action"],
  item: Item,
  actor: string,
  lookupItem: (id: string) => Item | undefined,
): Record<string, Record<string, ActivityEntry>> {
  const next = Object.fromEntries(Object.entries(activityByScope).map(([scope, entries]) => [scope, { ...entries }]))
  const entries = next[scopeId] ?? {}
  const entry: ActivityEntry = {
    id: crypto.randomUUID(), ts: new Date().toISOString(), actor, action,
    targetId: item.id, targetType: item.type,
    summary: deriveActivitySummary(item, lookupItem),
  }
  entries[entry.id] = entry
  const overage = Object.values(entries).sort(compareActivity).slice(500)
  for (const oldest of overage) delete entries[oldest.id]
  next[scopeId] = entries
  return next
}

// --- LocalConnector ---

export class LocalConnector implements FullConnector, ActivityLogCapable, ScopedActivityLogCapable, NotificationStateCapable {
  private items: Item[] = []
  private notifyScheduled = false
  private groups: Group[] = []
  private users: User[] = []
  private groupMembers: Record<string, string[]> = {}
  private groupItems: Record<string, string[]> = {}
  private currentGroup: Group | null = null
  private currentUser: User | null = null
  private nextItemId = 100
  private activityByScope: Record<string, Record<string, ActivityEntry>> = {}
  private activityObservables = new Map<string, ReturnType<typeof createObservable<ActivityEntry[]>>>()
  private scopedActivityObservables = new Map<string, ReturnType<typeof createObservable<ScopedActivityEntry[]>>>()
  private notificationState: NotificationState = { readEntryKeys: {}, mutedGroupIds: {} }
  private notificationStateObs = createObservable<NotificationState>(this.notificationState)

  private authState = createObservable<AuthState>({ status: "loading" })
  private currentUserObs = createObservable<User | null>(null)
  private groupsObs = createObservable<Group[]>([])
  private currentGroupObs = createObservable<Group | null>(null)
  private memberObservables = new Map<string | null, ReturnType<typeof createObservable<User[]>>>()
  private itemObservables = new Map<string, ReturnType<typeof createObservable<Item[]>>>()
  private singleItemObservables = new Map<string, ReturnType<typeof createObservable<Item | null>>>()
  private relatedObservables = new Map<string, ReturnType<typeof createObservable<Item[]>>>()
  private relatedObservableParams = new Map<string, { itemId: string; predicate?: string; options?: RelatedItemsOptions }>()

  private channel: BroadcastChannel | null = null
  private readonly instanceId = crypto.randomUUID()
  private store = createStore("rls-local-connector", "state")
  private seedData: StoredState | null

  constructor(seed?: {
    items: Item[]
    groups: Group[]
    users: User[]
    groupMembers: Record<string, string[]>
    groupItems?: Record<string, string[]>
  }) {
    this.seedData = seed
      ? {
          items: seed.items.map(i => ({ ...i })),
          groups: seed.groups,
          users: seed.users,
          groupMembers: seed.groupMembers,
          groupItems: seed.groupItems ?? {},
          currentUserId: seed.users[0]?.id ?? null,
          currentGroupId: seed.groups[0]?.id ?? null,
          nextItemId: 100,
          seedVersion: SEED_VERSION,
        }
      : null
  }

  async init(): Promise<void> {
    // Load from IndexedDB, or (re)seed. We re-seed when there is no
    // stored state yet, or when the stored state was seeded with an
    // older (or pre-versioning) SEED_VERSION — that's how demo-data
    // changes (e.g. updated avatars) reach an existing local store
    // without a manual reset. A store stamped with a *newer* version
    // (e.g. after checking out an older branch) is left intact rather
    // than discarded.
    const stored = await get<StoredState>("state", this.store)
    const shouldSeed = this.seedData && (
      !stored ||
      stored.seedVersion === undefined ||
      stored.seedVersion < SEED_VERSION
    )

    if (shouldSeed) {
      this.items = this.seedData!.items.map(i => ({ ...i }))
      this.groups = [...this.seedData!.groups]
      this.users = [...this.seedData!.users]
      this.groupMembers = { ...this.seedData!.groupMembers }
      this.groupItems = { ...this.seedData!.groupItems }
      this.nextItemId = this.seedData!.nextItemId
      this.currentUser = this.seedData!.currentUserId
        ? this.users.find((u) => u.id === this.seedData!.currentUserId) ?? null
        : null
      this.currentGroup = this.seedData!.currentGroupId
        ? this.groups.find((g) => g.id === this.seedData!.currentGroupId) ?? null
        : null
      await this.persist({ replaceItemState: true })
    } else if (stored) {
      this.items = stored.items.map(i => ({ ...i }))
      this.groups = stored.groups
      this.users = stored.users
      this.groupMembers = stored.groupMembers
      this.groupItems = stored.groupItems ?? {}
      this.nextItemId = stored.nextItemId
      this.activityByScope = stored.activityByScope ?? {}
      this.notificationState = cloneNotificationState(stored.notificationState ?? {})
      this.notificationStateObs.set(cloneNotificationState(this.notificationState))
      this.currentUser = stored.currentUserId
        ? this.users.find((u) => u.id === stored.currentUserId) ?? null
        : null
      this.currentGroup = stored.currentGroupId
        ? this.groups.find((g) => g.id === stored.currentGroupId) ?? null
        : null
    }

    this.currentUserObs.set(this.currentUser)
    this.authState.set(
      this.currentUser
        ? { status: "authenticated", user: this.currentUser }
        : { status: "unauthenticated" }
    )
    this.groupsObs.set([...this.groups])
    this.currentGroupObs.set(this.currentGroup)

    // Set up cross-tab sync
    this.channel = new BroadcastChannel("rls-local-connector")
    this.channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      if (event.data.senderId === this.instanceId) return
      this.handleBroadcast(event.data)
    }
  }

  async dispose(): Promise<void> {
    this.channel?.close()
    this.channel = null
    for (const obs of this.itemObservables.values()) obs.destroy()
    for (const obs of this.singleItemObservables.values()) obs.destroy()
    for (const obs of this.relatedObservables.values()) obs.destroy()
    for (const obs of this.memberObservables.values()) obs.destroy()
    for (const obs of this.activityObservables.values()) obs.destroy()
    for (const obs of this.scopedActivityObservables.values()) obs.destroy()
    this.itemObservables.clear()
    this.singleItemObservables.clear()
    this.relatedObservables.clear()
    this.relatedObservableParams.clear()
    this.memberObservables.clear()
    this.activityObservables.clear()
    this.scopedActivityObservables.clear()
    this.notificationStateObs.destroy()
    this.authState.destroy()
    this.groupsObs.destroy()
    this.currentGroupObs.destroy()
  }

  // --- Groups ---

  async getGroups(): Promise<Group[]> {
    return this.groups
  }

  observeGroups(): Observable<Group[]> {
    return this.groupsObs
  }

  getCurrentGroup(): Group | null {
    return this.currentGroup
  }

  observeCurrentGroup(): Observable<Group | null> {
    return this.currentGroupObs
  }

  setCurrentGroup(id: string | null): void {
    if (id === null) {
      if (this.currentGroup === null) return
      this.currentGroup = null
      this.currentGroupObs.set(null)
      this.notifyObservers()
      this.notifyActivityObservers()
      return
    }
    if (this.currentGroup?.id === id) return
    const group = this.groups.find((g) => g.id === id)
    if (group) {
      this.currentGroup = group
      this.currentGroupObs.set(group)
      this.notifyObservers()
      this.notifyActivityObservers()
    }
  }

  async createGroup(name: string, data?: Record<string, unknown>): Promise<Group> {
    const group: Group = { id: `group-${Date.now()}`, name, data }
    this.groups.push(group)
    this.groupMembers[group.id] = this.currentUser ? [this.currentUser.id] : []
    this.notifyGroupObservers()
    await this.persist()
    this.broadcast({ type: "groups-changed" })
    return group
  }

  async updateGroup(id: string, updates: Partial<Group>): Promise<Group> {
    const group = this.groups.find((g) => g.id === id)
    if (!group) throw new Error(`Group not found: ${id}`)
    Object.assign(group, updates)
    this.notifyGroupObservers()
    await this.persist()
    this.broadcast({ type: "groups-changed" })
    return group
  }

  async deleteGroup(id: string): Promise<void> {
    this.groups = this.groups.filter((g) => g.id !== id)
    delete this.groupMembers[id]
    if (this.currentGroup?.id === id) {
      this.currentGroup = this.groups[0] ?? null
      this.currentGroupObs.set(this.currentGroup)
    }
    this.notifyGroupObservers()
    // Overview activity is the union of currently accessible spaces.
    this.notifyActivityObservers()
    await this.persist()
    this.broadcast({ type: "groups-changed" })
  }

  async getMembers(groupId: string | null): Promise<User[]> {
    if (groupId === null) return this.users
    const memberIds = this.groupMembers[groupId] ?? []
    return this.users.filter((u) => memberIds.includes(u.id))
  }

  observeMembers(groupId: string | null): Observable<User[]> {
    if (!this.memberObservables.has(groupId)) {
      const members = groupId === null
        ? this.users
        : this.users.filter((u) => (this.groupMembers[groupId] ?? []).includes(u.id))
      this.memberObservables.set(groupId, createObservable(members))
    }
    return this.memberObservables.get(groupId)!
  }

  private notifyMemberObservers(groupId: string): void {
    const obs = this.memberObservables.get(groupId)
    if (obs) {
      const memberIds = this.groupMembers[groupId] ?? []
      obs.set(this.users.filter((u) => memberIds.includes(u.id)))
    }
  }

  async inviteMember(groupId: string, userId: string): Promise<void> {
    if (!this.groupMembers[groupId]) this.groupMembers[groupId] = []
    if (!this.groupMembers[groupId].includes(userId)) {
      this.groupMembers[groupId].push(userId)
    }
    this.notifyMemberObservers(groupId)
    await this.persist()
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    if (this.groupMembers[groupId]) {
      this.groupMembers[groupId] = this.groupMembers[groupId].filter((id) => id !== userId)
    }
    this.notifyMemberObservers(groupId)
    await this.persist()
  }

  // --- Items ---

  private getScopedItems(): Item[] {
    const groupId = this.currentGroup?.id
    const scope = (this.currentGroup?.data?.scope as string) ?? "group"

    if (!groupId || scope === "aggregate") {
      return this.items
    }

    const itemIds = this.groupItems[groupId]
    if (!itemIds) return this.items.filter((i) => i.type === "feature")
    return this.items.filter((i) => itemIds.includes(i.id) || i.type === "feature")
  }

  async getItems(filter?: ItemFilter): Promise<Item[]> {
    const scoped = this.getScopedItems()
    if (!filter) return scoped
    const filtered = scoped.filter((item) => matchesFilter(item, filter))
    return applyPagination(filtered, filter.limit, filter.offset)
  }

  async getItem(id: string): Promise<Item | null> {
    return this.getScopedItems().find((item) => item.id === id) ?? null
  }

  observe(filter: ItemFilter): Observable<Item[]> {
    const key = JSON.stringify(filter)
    if (!this.itemObservables.has(key)) {
      const scoped = this.getScopedItems()
      const filtered = scoped.filter((item) => matchesFilter(item, filter))
      this.itemObservables.set(key, createObservable(applyPagination(filtered, filter.limit, filter.offset)))
    }
    return this.itemObservables.get(key)!
  }

  observeItem(id: string): Observable<Item | null> {
    if (!this.singleItemObservables.has(id)) {
      const item = this.getScopedItems().find((i) => i.id === id) ?? null
      this.singleItemObservables.set(id, createObservable(item))
    }
    return this.singleItemObservables.get(id)!
  }

  async createItem(item: CreateItemInput): Promise<Item> {
    const actor = this.requireCurrentUser().id
    const targetGroupId = this.currentGroup?.id ?? null
    let result: Item | undefined
    let committedState: StoredState | undefined
    let created = false

    await updateStoredValue<StoredState>("state", (stored) => {
      const current = stored ?? this.createStoredState()
      if (item.id !== undefined) {
        const existing = current.items.find((candidate) => candidate.id === item.id)
        if (existing) {
          result = existing
          committedState = current
          return current
        }
      }

      let nextItemId = current.nextItemId
      let id = item.id
      if (id === undefined) {
        do {
          id = `item-${nextItemId++}`
        } while (current.items.some((candidate) => candidate.id === id))
      }

      const newItem: Item = {
        ...item,
        id,
        createdAt: new Date().toISOString(),
      }
      const groupItems = cloneGroupItems(current.groupItems)
      if (targetGroupId) {
        const targetItems = groupItems[targetGroupId] ?? []
        if (!targetItems.includes(newItem.id)) targetItems.push(newItem.id)
        groupItems[targetGroupId] = targetItems
      }

      committedState = {
        ...current,
        items: [...current.items, newItem],
        groupItems,
        nextItemId,
        activityByScope: appendActivity(current.activityByScope ?? {}, this.activityScope(targetGroupId), "create", newItem, actor, (lookupId) => current.items.find((candidate) => candidate.id === lookupId)),
      }
      result = newItem
      created = true
      return committedState
    }, this.store)

    if (!result || !committedState) throw new Error("Item transaction did not produce a result")
    this.applyStoredItemState(committedState)
    this.notifyObservers()
    this.notifyActivityObservers()
    if (created) this.broadcast({ type: "items-changed" })
    return result
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    const actor = this.requireCurrentUser().id
    let result: Item | undefined
    let committedState: StoredState | undefined
    await updateStoredValue<StoredState>("state", (stored) => {
      const current = stored ?? this.createStoredState()
      const idx = current.items.findIndex((candidate) => candidate.id === id)
      if (idx === -1) throw new Error(`Item not found: ${id}`)
      if (this.currentGroup && !(current.groupItems[this.currentGroup.id] ?? []).includes(id)) {
        throw new Error(`Item not found: ${id}`)
      }
      result = { ...current.items[idx], ...updates, id }
      const items = [...current.items]
      items[idx] = result
      const ownerScope = Object.entries(current.groupItems).find(([, ids]) => ids.includes(id))?.[0] ?? null
      committedState = { ...current, items, activityByScope: appendActivity(current.activityByScope ?? {}, this.activityScope(ownerScope), "update", result, actor, (lookupId) => current.items.find((candidate) => candidate.id === lookupId)) }
      return committedState
    }, this.store)

    if (!result || !committedState) throw new Error("Item transaction did not produce a result")
    this.applyStoredItemState(committedState)
    this.notifyObservers()
    this.notifyActivityObservers()
    this.broadcast({ type: "items-changed" })
    return result
  }

  async deleteItem(id: string): Promise<void> {
    const actor = this.requireCurrentUser().id
    let committedState: StoredState | undefined
    await updateStoredValue<StoredState>("state", (stored) => {
      const current = stored ?? this.createStoredState()
      const item = current.items.find((candidate) => candidate.id === id)
      if (!item) { committedState = current; return current }
      if (this.currentGroup && !(current.groupItems[this.currentGroup.id] ?? []).includes(id)) throw new Error(`Item not found: ${id}`)
      const groupItems = cloneGroupItems(current.groupItems)
      for (const groupId of Object.keys(groupItems)) {
        groupItems[groupId] = groupItems[groupId].filter((itemId) => itemId !== id)
      }
      committedState = {
        ...current,
        items: current.items.filter((candidate) => candidate.id !== id),
        groupItems,
        activityByScope: appendActivity(current.activityByScope ?? {}, this.activityScope(Object.entries(current.groupItems).find(([, ids]) => ids.includes(id))?.[0] ?? null), "delete", item, actor, (lookupId) => current.items.find((candidate) => candidate.id === lookupId)),
      }
      return committedState
    }, this.store)

    if (!committedState) throw new Error("Item transaction did not produce a result")
    this.applyStoredItemState(committedState)
    this.notifyObservers()
    this.notifyActivityObservers()
    this.broadcast({ type: "items-changed" })
  }

  getItemGroupId(itemId: string): string | null {
    for (const [gid, itemIds] of Object.entries(this.groupItems)) {
      if (itemIds.includes(itemId)) return gid
    }
    return null
  }

  async moveItemToGroup(itemId: string, targetGroupId: string): Promise<void> {
    const actor = this.requireCurrentUser().id
    let committedState: StoredState | undefined
    await updateStoredValue<StoredState>("state", (stored) => {
      const current = stored ?? this.createStoredState()
      const item = current.items.find((candidate) => candidate.id === itemId)
      const sourceGroupId = Object.entries(current.groupItems).find(([, ids]) => ids.includes(itemId))?.[0] ?? null
      if (!item || !sourceGroupId) throw new Error(`Item not found: ${itemId}`)
      if (this.currentGroup && sourceGroupId !== this.currentGroup.id) throw new Error(`Item not found: ${itemId}`)
      if (sourceGroupId === targetGroupId) { committedState = current; return current }
      const groupItems = cloneGroupItems(current.groupItems)
      for (const groupId of Object.keys(groupItems)) {
        groupItems[groupId] = groupItems[groupId].filter((id) => id !== itemId)
      }
      const targetItems = groupItems[targetGroupId] ?? []
      if (!targetItems.includes(itemId)) targetItems.push(itemId)
      groupItems[targetGroupId] = targetItems
      committedState = {
        ...current, groupItems,
        activityByScope: appendActivity(
          appendActivity(current.activityByScope ?? {}, this.activityScope(sourceGroupId), "delete", item, actor, (lookupId) => current.items.find((candidate) => candidate.id === lookupId)),
          this.activityScope(targetGroupId), "create", item, actor,
          (lookupId) => current.items.find((candidate) => candidate.id === lookupId),
        ),
      }
      return committedState
    }, this.store)

    if (!committedState) throw new Error("Item transaction did not produce a result")
    this.applyStoredItemState(committedState)
    this.notifyObservers()
    this.notifyActivityObservers()
    this.broadcast({ type: "items-changed" })
  }

  async getActivity(options?: { limit?: number }): Promise<ActivityEntry[]> {
    return this.readActivity(options?.limit)
  }

  observeActivity(options?: { limit?: number }): Observable<ActivityEntry[]> {
    const key = `${options?.limit ?? ""}`
    let observable = this.activityObservables.get(key)
    if (!observable) {
      observable = createObservable(this.readActivity(options?.limit))
      this.activityObservables.set(key, observable)
    }
    return observable
  }

  async getScopedActivity(options?: { limit?: number }): Promise<ScopedActivityEntry[]> {
    return this.readScopedActivity(options?.limit)
  }

  observeScopedActivity(options?: { limit?: number }): Observable<ScopedActivityEntry[]> {
    const key = `${options?.limit ?? ""}`
    let observable = this.scopedActivityObservables.get(key)
    if (!observable) {
      observable = createObservable(this.readScopedActivity(options?.limit))
      this.scopedActivityObservables.set(key, observable)
    }
    return observable
  }

  async getNotificationState(): Promise<NotificationState> {
    return cloneNotificationState(this.notificationState)
  }

  observeNotificationState(): Observable<NotificationState> {
    return this.notificationStateObs
  }

  async updateNotificationState(patch: NotificationStatePatch): Promise<void> {
    let committed: StoredState | undefined
    await updateStoredValue<StoredState>("state", (stored) => {
      const base = stored ?? this.createStoredState()
      const notificationState = applyNotificationStatePatch(cloneNotificationState(base.notificationState ?? {}), patch)
      committed = { ...base, notificationState }
      return committed
    }, this.store)
    this.notificationState = cloneNotificationState(committed?.notificationState ?? {})
    this.notificationStateObs.set(cloneNotificationState(this.notificationState))
    this.broadcast({ type: "full-sync" })
  }

  // --- Relations ---

  async getRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Promise<Item[]> {
    return findRelatedItems(itemId, this.items, predicate, options)
  }

  observeRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Observable<Item[]> {
    const key = `${itemId}:${predicate ?? ""}:${JSON.stringify(options ?? {})}`
    if (!this.relatedObservables.has(key)) {
      const related = findRelatedItems(itemId, this.items, predicate, options)
      this.relatedObservables.set(key, createObservable(related))
      this.relatedObservableParams.set(key, { itemId, predicate, options })
    }
    return this.relatedObservables.get(key)!
  }

  // --- Relation records (auth-bound store) ---

  // Generic default facade (docs/spec/08-relation-records.md): createdBy from
  // the authenticated identity, canonical hash ids, authorship-checked
  // mutations. Lazy so alternative construction paths stay safe.
  private relationRecordStore: ReturnType<typeof createDefaultRelationStore> | null = null

  private relationStoreInstance(): ReturnType<typeof createDefaultRelationStore> {
    this.relationRecordStore ??= createDefaultRelationStore(this)
    return this.relationRecordStore
  }

  getRelationRecords(filter?: RelationRecordFilter): Promise<RelationRecord[]> {
    return this.relationStoreInstance().getRelationRecords(filter)
  }

  observeRelationRecords(filter?: RelationRecordFilter): Observable<RelationRecord[]> {
    return this.relationStoreInstance().observeRelationRecords(filter)
  }

  getRelationNeighbors(endpoint: string, predicate?: string): Promise<Item[]> {
    return this.relationStoreInstance().getRelationNeighbors(endpoint, predicate)
  }

  observeRelationNeighbors(endpoint: string, predicate?: string): Observable<Item[]> {
    return this.relationStoreInstance().observeRelationNeighbors(endpoint, predicate)
  }

  createRelationRecord(input: RelationRecordInput): Promise<RelationRecord> {
    return this.relationStoreInstance().createRelationRecord(input)
  }

  updateRelationRecord(id: string, updates: RelationRecordUpdate): Promise<RelationRecord> {
    return this.relationStoreInstance().updateRelationRecord(id, updates)
  }

  deleteRelationRecord(id: string): Promise<void> {
    return this.relationStoreInstance().deleteRelationRecord(id)
  }

  // --- Users ---

  async getCurrentUser(): Promise<User | null> {
    return this.currentUser
  }

  observeCurrentUser(): Observable<User | null> {
    return this.currentUserObs
  }

  async getUser(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null
  }

  // --- Auth ---

  getAuthState(): Observable<AuthState> {
    return this.authState
  }

  getAuthMethods(): AuthMethod[] {
    return [{ method: "local", label: "Local Login" }]
  }

  async authenticate(_method: string, _credentials: unknown): Promise<User> {
    const user = this.users[0]
    this.currentUser = user
    this.currentUserObs.set(user)
    this.authState.set({ status: "authenticated", user })
    await this.persist()
    return user
  }

  async logout(): Promise<void> {
    this.currentUser = null
    this.currentUserObs.set(null)
    this.authState.set({ status: "unauthenticated" })
    await this.persist()
  }

  // --- Sources ---

  getSources(): Source[] {
    return [{ id: "local", name: "Local (IndexedDB)", connector: this }]
  }

  getActiveSource(): Source {
    return { id: "local", name: "Local (IndexedDB)", connector: this }
  }

  setActiveSource(_sourceId: string): void {
    // Only one source
  }

  // --- Clear all data (useful for testing) ---

  async clear(): Promise<void> {
    await del("state", this.store)
    this.items = []
    this.groups = []
    this.users = []
    this.groupMembers = {}
    this.groupItems = {}
    this.currentUser = null
    this.currentUserObs.set(null)
    this.currentGroup = null
    this.currentGroupObs.set(null)
    this.nextItemId = 100
    // Deleting the store must also forget activity in-process — otherwise it
    // stays readable and a later persist() would resurrect the wiped entries.
    this.activityByScope = {}
    this.notificationState = { readEntryKeys: {}, mutedGroupIds: {} }
    this.notifyObservers()
    this.notifyGroupObservers()
    this.notifyActivityObservers()
    this.notificationStateObs.set(cloneNotificationState(this.notificationState))
    this.broadcast({ type: "full-sync" })
  }

  // --- Internal: Persistence ---

  private async persist(options: { replaceItemState?: boolean } = {}): Promise<void> {
    const localState = this.createStoredState()
    if (options.replaceItemState) {
      await set("state", localState, this.store)
      return
    }

    let committedState: StoredState | undefined
    await updateStoredValue<StoredState>("state", (stored) => {
      committedState = stored
        ? {
            ...localState,
            items: stored.items,
            groupItems: cloneGroupItems(stored.groupItems),
            nextItemId: stored.nextItemId,
            // Activity is item-state too: another tab may have committed
            // entries atomically — never write our stale in-memory copy over
            // the store's truth.
            activityByScope: stored.activityByScope ?? {},
            notificationState: cloneNotificationState(stored.notificationState),
          }
        : localState
      return committedState
    }, this.store)
    if (committedState) {
      this.applyStoredItemState(committedState)
      this.notifyObservers()
    }
  }

  private createStoredState(): StoredState {
    return {
      items: this.items.map(i => ({ ...i })),
      groups: this.groups,
      users: this.users,
      groupMembers: this.groupMembers,
      groupItems: cloneGroupItems(this.groupItems),
      currentUserId: this.currentUser?.id ?? null,
      currentGroupId: this.currentGroup?.id ?? null,
      nextItemId: this.nextItemId,
      seedVersion: SEED_VERSION,
      activityByScope: this.activityByScope,
      notificationState: this.notificationState,
    }
  }

  private applyStoredItemState(state: StoredState): void {
    this.items = state.items.map((item) => ({ ...item }))
    this.groupItems = cloneGroupItems(state.groupItems)
    this.nextItemId = state.nextItemId
    this.activityByScope = state.activityByScope ?? {}
    this.notificationState = cloneNotificationState(state.notificationState ?? {})
  }

  // --- Internal: Cross-Tab Sync ---

  private broadcast(msg: Omit<BroadcastMessage, "senderId">): void {
    this.channel?.postMessage({ ...msg, senderId: this.instanceId })
  }

  private async handleBroadcast(msg: BroadcastMessage): Promise<void> {
    // Reload from IndexedDB when another tab changes data
    const stored = await get<StoredState>("state", this.store)
    if (!stored) {
      // A peer may have deleted IndexedDB in clear(). A full sync is also the
      // reset signal, so retaining this tab's in-memory projection is unsafe.
      if (msg.type === "full-sync") {
        this.items = []
        this.groups = []
        this.users = []
        this.groupMembers = {}
        this.groupItems = {}
        this.currentUser = null
        this.currentGroup = null
        this.nextItemId = 100
        this.activityByScope = {}
        this.notificationState = { readEntryKeys: {}, mutedGroupIds: {} }
        this.currentUserObs.set(null)
        this.currentGroupObs.set(null)
        this.authState.set({ status: "unauthenticated" })
        this.notifyObservers()
        this.notifyGroupObservers()
        this.notifyActivityObservers()
        this.notificationStateObs.set(cloneNotificationState(this.notificationState))
      }
      return
    }

    if (msg.type === "items-changed" || msg.type === "full-sync") {
      this.items = stored.items.map(i => ({ ...i }))
      this.nextItemId = stored.nextItemId
      // groupItems holds the group-membership for each item. Without
      // reloading it here, getScopedItems() filters the freshly arrived
      // item out of the active group (its id isn't in the stale local
      // groupItems[groupId]), so observers see "no change" until reload.
      this.groupItems = stored.groupItems ?? {}
      this.activityByScope = stored.activityByScope ?? {}
      this.notificationState = cloneNotificationState(stored.notificationState ?? {})
      this.notificationStateObs.set(cloneNotificationState(this.notificationState))
      this.notifyObservers()
      this.notifyActivityObservers()
    }

    if (msg.type === "groups-changed" || msg.type === "full-sync") {
      this.groups = stored.groups
      this.users = stored.users
      this.groupMembers = stored.groupMembers
      this.notifyGroupObservers()
      // A changed space list changes the overview activity union even when
      // its stored entries themselves did not change.
      this.notifyActivityObservers()
    }
  }

  // --- Internal: Observable Notification ---

  private notifyGroupObservers(): void {
    this.groupsObs.set(this.groups.map((g) => ({ ...g })))
  }

  private notifyObservers(): void {
    if (this.notifyScheduled) return
    this.notifyScheduled = true
    queueMicrotask(() => {
      this.notifyScheduled = false
      this.notifyObserversNow()
    })
  }

  private notifyObserversNow(): void {
    const scoped = this.getScopedItems()
    for (const [key, observable] of this.itemObservables) {
      const filter: ItemFilter = JSON.parse(key)
      const filtered = scoped.filter((item) => matchesFilter(item, filter))
      observable.set(applyPagination(filtered, filter.limit, filter.offset))
    }
    for (const [id, observable] of this.singleItemObservables) {
      const item = scoped.find((i) => i.id === id) ?? null
      observable.set(item)
    }
    // Update related-items observables
    for (const [key, observable] of this.relatedObservables) {
      const params = this.relatedObservableParams.get(key)
      if (params) {
        const related = findRelatedItems(params.itemId, this.items, params.predicate, params.options)
        observable.set(related)
      }
    }
  }

  private requireCurrentUser(): User {
    if (!this.currentUser) throw new Error("Authentication required")
    return this.currentUser
  }

  private activityScope(groupId: string | null): string {
    return groupId ?? "__personal__"
  }

  private readActivity(limit?: number): ActivityEntry[] {
    const scopes = this.currentGroup
      ? [this.activityScope(this.currentGroup.id)]
      : [...this.groups.map((group) => this.activityScope(group.id)), "__personal__"]
    const entries = scopes.flatMap((scope) => Object.values(this.activityByScope[scope] ?? {}))
      .filter((entry) => entry.action === "create" || entry.action === "update" || entry.action === "delete")
      .sort(compareActivity)
    return limit === undefined ? entries : entries.slice(0, Math.max(0, limit))
  }

  private readScopedActivity(limit?: number): ScopedActivityEntry[] {
    const visibleScopes = new Set([...this.groups.map((group) => group.id), "__personal__"])
    const entries = Object.entries(this.activityByScope).flatMap(([groupId, byId]) =>
      !visibleScopes.has(groupId) ? [] : Object.values(byId)
        .filter((entry) => entry.action === "create" || entry.action === "update" || entry.action === "delete")
        .map((entry) => this.resolveScopedActivity(groupId, entry)),
    ).sort((a, b) => compareActivity(a.entry, b.entry))
    return limit === undefined ? entries : entries.slice(0, Math.max(0, limit))
  }

  private resolveScopedActivity(groupId: string, entry: ActivityEntry): ScopedActivityEntry {
    const target = this.items.find((item) => item.id === entry.targetId && (groupId === "__personal__" ? !Object.values(this.groupItems).some((ids) => ids.includes(item.id)) : this.groupItems[groupId]?.includes(item.id)))
    let subject: ScopedActivityEntry["subject"] = null
    if (entry.action === "delete") subject = { id: entry.targetId, type: entry.targetType, ...(entry.summary ? { title: entry.summary } : {}) }
    else if (target) {
      const parentId = target.type === "reaction" || target.type === "comment"
        ? target.relations?.find((relation) => relation.predicate === "reactsTo" || relation.predicate === "commentOn")?.target.replace(/^item:/, "")
        : undefined
      const resolved = parentId ? this.items.find((item) => item.id === parentId && (groupId === "__personal__"
        ? !Object.values(this.groupItems).some((ids) => ids.includes(item.id))
        : this.groupItems[groupId]?.includes(item.id))) : target
      if (resolved) subject = { id: resolved.id, type: resolved.type, createdBy: resolved.createdBy, ...(itemDisplayTitle(resolved) ? { title: itemDisplayTitle(resolved) } : {}), moduleHints: moduleHintsFor(resolved) }
    }
    const actor = groupId === "__personal__" || this.groupMembers[groupId]?.includes(entry.actor)
      ? (this.users.find((user) => user.id === entry.actor) ?? { id: entry.actor }) : null
    return { groupId, entry, targetExists: Boolean(target), subject, ...(groupId === "__personal__" ? { isPersonal: true } : {}), actor }
  }

  private notifyActivityObservers(): void {
    for (const [rawLimit, observable] of this.activityObservables) {
      observable.set(this.readActivity(rawLimit === "" ? undefined : Number(rawLimit)))
    }
    for (const [rawLimit, observable] of this.scopedActivityObservables) {
      observable.set(this.readScopedActivity(rawLimit === "" ? undefined : Number(rawLimit)))
    }
  }
}
