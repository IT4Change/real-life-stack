import type {
  CreateItemInput,
  DefaultRelationStoreOptions,
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
  RelationRecordCapable,
  RelationRecordFilter,
  RelationRecordInput,
  RelationRecordUpdate,
  RelationRecordWriterCapable,
  Source,
} from "@real-life-stack/data-interface"
import {
  applyGroupDataPatch,
  withEditStamp,
  applyPagination,
  createDefaultRelationStore,
  createObservable,
  deriveActivitySummary,
  itemDisplayTitle,
  moduleHintsFor,
  applyNotificationStatePatch,
  cloneNotificationState,
  findRelatedItems,
  matchesFilter,
} from "@real-life-stack/data-interface"
import { demoItems, demoGroups, demoUsers, demoGroupMembers, demoGroupItems } from "@real-life-stack/data-interface/demo-data"

export interface MockConnectorSeed {
  items: Item[]
  groups: Group[]
  users: User[]
  groupMembers: Record<string, string[]>
  groupItems?: Record<string, string[]>
}

export interface MockConnectorOptions {
  symmetricRelationPredicates?: DefaultRelationStoreOptions["symmetricPredicates"]
  /**
   * FIXTURE PATH (spec 08 exception, marked and dev-only): keep
   * caller-supplied createdBy for simulating multi-user states in tests,
   * stories and demos. Disables the authoritative claim verdict.
   */
  allowFixtureAuthors?: boolean
}

function deduplicateItems(items: readonly Item[]): Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function copyGroupItems(groupItems: Record<string, string[]> | undefined): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(groupItems ?? {}).map(([groupId, itemIds]) => [groupId, [...new Set(itemIds)]])
  )
}

function compareActivity(a: ActivityEntry, b: ActivityEntry): number {
  return b.ts.localeCompare(a.ts) || b.actor.localeCompare(a.actor) || b.id.localeCompare(a.id)
}

export class MockConnector implements FullConnector, ActivityLogCapable, ScopedActivityLogCapable, NotificationStateCapable, RelationRecordCapable, RelationRecordWriterCapable {
  private itemsByScope = new Map<string | null, Map<string, Item>>()
  private itemOrder: Array<{ scopeId: string | null; id: string }> = []
  private notifyScheduled = false
  private groups: Group[]
  private users: User[]
  private groupMembers: Record<string, string[]>
  private groupItems: Record<string, string[]>
  private currentGroup: Group | null
  private currentUser: User | null
  private currentUserObs: ReturnType<typeof createObservable<User | null>>
  private authState: ReturnType<typeof createObservable<AuthState>>
  private groupsObs: ReturnType<typeof createObservable<Group[]>>
  private currentGroupObs: ReturnType<typeof createObservable<Group | null>>
  private itemObservables = new Map<string, ReturnType<typeof createObservable<Item[]>>>()
  private singleItemObservables = new Map<string, ReturnType<typeof createObservable<Item | null>>>()
  private relatedObservables = new Map<string, ReturnType<typeof createObservable<Item[]>>>()
  private relatedObservableParams = new Map<string, { itemId: string; predicate?: string; options?: RelatedItemsOptions }>()
  private relationStore: RelationRecordCapable & RelationRecordWriterCapable
  private nextItemId = 100
  private activityByScope = new Map<string, Map<string, ActivityEntry>>()
  private activityObservables = new Map<string, ReturnType<typeof createObservable<ActivityEntry[]>>>()
  private scopedActivityObservables = new Map<string, ReturnType<typeof createObservable<ScopedActivityEntry[]>>>()
  private notificationState: NotificationState = { readEntryKeys: {}, mutedGroupIds: {} }
  private notificationStateObs = createObservable<NotificationState>(this.notificationState)

  /** SignedClaims verdict (spec 08): authoritative — trusted — unless the
      fixture mode disables the binding and with it the capability. */
  verifyRecordClaim?: (record: RelationRecord) => Promise<"trusted">
  private allowFixtureAuthors = false

  constructor(seed?: MockConnectorSeed, options: MockConnectorOptions = {}) {
    this.allowFixtureAuthors = options.allowFixtureAuthors === true
    if (!this.allowFixtureAuthors) {
      this.verifyRecordClaim = async () => "trusted"
    }
    const data = seed ?? {
      items: demoItems,
      groups: demoGroups,
      users: demoUsers,
      groupMembers: demoGroupMembers,
      groupItems: demoGroupItems,
    }

    this.groups = data.groups.filter((g) => (g.data?.scope as string) !== "aggregate")
    this.users = [...data.users]
    this.groupMembers = { ...data.groupMembers }
    this.groupItems = copyGroupItems(data.groupItems)
    for (const item of deduplicateItems(data.items)) {
      if (item.type === "feature") {
        this.storeItem(null, item)
        continue
      }

      const scopeIds = Object.entries(this.groupItems)
        .filter(([, itemIds]) => itemIds.includes(item.id))
        .map(([groupId]) => groupId)
      if (scopeIds.length === 0) {
        this.storeItem(null, item)
      } else {
        for (const scopeId of scopeIds) this.storeItem(scopeId, { ...item })
      }
    }
    this.currentGroup = null
    // The in-memory connector always starts with an authenticated demo identity;
    // callers that need unauthenticated behaviour use logout(). This also keeps
    // fixture-only seeds (which intentionally omit users) writable through the
    // same authenticated writer path.
    this.currentUser = this.users[0] ?? { id: "user-1", displayName: "Demo user" }
    this.currentUserObs = createObservable<User | null>(this.currentUser)
    this.authState = createObservable<AuthState>(
      this.currentUser
        ? { status: "authenticated", user: this.currentUser }
        : { status: "unauthenticated" }
    )
    this.groupsObs = createObservable<Group[]>([...this.groups])
    this.currentGroupObs = createObservable<Group | null>(this.currentGroup)
    this.relationStore = createDefaultRelationStore(
      this,
      options.symmetricRelationPredicates === undefined
        ? undefined
        : { symmetricPredicates: options.symmetricRelationPredicates },
    )
  }

  async init(): Promise<void> {
    // Mock: nothing to initialize
  }

  async dispose(): Promise<void> {
    for (const obs of this.itemObservables.values()) obs.destroy()
    for (const obs of this.singleItemObservables.values()) obs.destroy()
    for (const obs of this.activityObservables.values()) obs.destroy()
    for (const obs of this.scopedActivityObservables.values()) obs.destroy()
    for (const obs of this.relatedObservables.values()) obs.destroy()
    for (const obs of this.memberObservables.values()) obs.destroy()
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
    return group
  }

  async updateGroup(id: string, updates: Partial<Group>): Promise<Group> {
    const group = this.groups.find((g) => g.id === id)
    if (!group) throw new Error(`Group not found: ${id}`)
    // `data` is a shallow PATCH (null removes), never a replacement — see the
    // GroupManager contract (rls#234).
    const { data, ...rest } = updates
    Object.assign(group, rest)
    if (data) group.data = applyGroupDataPatch(group.data, data)
    this.notifyGroupObservers()
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
    this.notifyActivityObservers()
  }

  async getMembers(groupId: string | null): Promise<User[]> {
    if (groupId === null) return this.users
    const memberIds = this.groupMembers[groupId] ?? []
    return this.users.filter((u) => memberIds.includes(u.id))
  }

  private memberObservables = new Map<string | null, ReturnType<typeof createObservable<User[]>>>()

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
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    if (this.groupMembers[groupId]) {
      this.groupMembers[groupId] = this.groupMembers[groupId].filter((id) => id !== userId)
    }
    this.notifyMemberObservers(groupId)
  }

  // --- Items ---

  private getScopedItems(): Item[] {
    const groupId = this.currentGroup?.id
    const scope = (this.currentGroup?.data?.scope as string) ?? "group"

    if (!groupId || scope === "aggregate") {
      const idCounts = new Map<string, number>()
      for (const { id } of this.itemOrder) idCounts.set(id, (idCounts.get(id) ?? 0) + 1)
      return this.itemOrder.flatMap(({ scopeId, id }) => {
        if (idCounts.get(id) !== 1) return []
        const item = this.itemsByScope.get(scopeId)?.get(id)
        return item ? [item] : []
      })
    }

    const scopedItems = [...(this.itemsByScope.get(groupId)?.values() ?? [])]
    const globalFeatures = [...(this.itemsByScope.get(null)?.values() ?? [])]
      .filter((item) => item.type === "feature")
    return [...scopedItems, ...globalFeatures]
  }

  async getItems(filter?: ItemFilter): Promise<Item[]> {
    const scoped = this.getScopedItems()
    if (!filter) return scoped
    const filtered = scoped.filter((item) => matchesFilter(item, filter))
    return applyPagination(filtered, filter.limit, filter.offset)
  }

  async getItem(id: string): Promise<Item | null> {
    return this.findVisibleItem(id) ?? null
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
      const item = this.findVisibleItem(id) ?? null
      this.singleItemObservables.set(id, createObservable(item))
    }
    return this.singleItemObservables.get(id)!
  }

  async createItem(item: CreateItemInput): Promise<Item> {
    const sessionUser = this.requireCurrentUser()
    // Authoritative ingress binding (spec 08): createdBy comes from the
    // session, never the caller — except in the marked fixture mode.
    if (!this.allowFixtureAuthors) item = { ...item, createdBy: sessionUser.id }
    const scopeId = item.type === "feature" ? null : this.currentGroup?.id ?? null
    const scopeItems = this.getScopeItems(scopeId, true)
    if (item.id !== undefined) {
      const existing = scopeItems.get(item.id)
      if (existing) return existing
      this.assertNoGlobalScopeCollision(scopeId, item.id, item.type)
    }

    const id = item.id ?? this.allocateItemId(scopeId, item.type)
    const newItem: Item = {
      ...item,
      id,
      createdAt: new Date().toISOString(),
    }
    this.storeItem(scopeId, newItem)
    this.appendActivity(this.activityScopeFor(scopeId), "create", newItem)

    // Register item in current group's scope
    if (scopeId) this.registerItemInGroup(newItem.id, scopeId)

    this.notifyObservers()
    this.notifyActivityObservers()
    return newItem
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    const actor = this.requireCurrentUser()
    // Authoritative ingress binding also on UPDATE: createdBy is immutable
    // through the regular path (spec 08); fixture mode keeps old behaviour.
    if (!this.allowFixtureAuthors && "createdBy" in updates) {
      const { createdBy: _ignored, ...rest } = updates
      updates = rest
    }
    // Session-bound, like createdBy — see the Item contract.
    updates = withEditStamp(updates, actor.id)
    const location = this.findVisibleItemLocation(id)
    if (!location) throw new Error(`Item not found: ${id}`)
    const updated = { ...location.item, ...updates, id }
    if (location.item.type !== "feature" && updated.type === "feature") {
      this.assertNoItemOutsideScope(location.scopeId, id)
    }
    this.appendActivity(this.activityScopeFor(location.scopeId), "update", updated)
    if (updated.type === "feature" && location.scopeId !== null) {
      const globalItems = this.getScopeItems(null, true)
      location.items.delete(id)
      globalItems.set(id, updated)
      const orderEntry = this.itemOrder.find(
        (entry) => entry.scopeId === location.scopeId && entry.id === id
      )
      if (orderEntry) orderEntry.scopeId = null
      this.groupItems[location.scopeId] = (this.groupItems[location.scopeId] ?? [])
        .filter((itemId) => itemId !== id)
    } else {
      location.items.set(id, updated)
    }
    this.notifyObservers()
    this.notifyActivityObservers()
    return updated
  }

  async deleteItem(id: string): Promise<void> {
    this.requireCurrentUser()
    const location = this.findVisibleItemLocation(id)
    if (!location) return
    this.appendActivity(this.activityScopeFor(location.scopeId), "delete", location.item)
    location.items.delete(id)
    this.removeItemOrder(location.scopeId, id)
    if (location.scopeId === null) {
      for (const groupId of Object.keys(this.groupItems)) {
        this.groupItems[groupId] = this.groupItems[groupId].filter((itemId) => itemId !== id)
      }
    } else {
      this.groupItems[location.scopeId] = (this.groupItems[location.scopeId] ?? [])
        .filter((itemId) => itemId !== id)
    }
    this.notifyObservers()
    this.notifyActivityObservers()
  }

  /**
   * Privileged fixture/ETL path. Seed Items already carry their canonical IDs,
   * timestamps and authors, so they deliberately bypass the auth-bound writers.
   */
  injectSeedItems(items: readonly Item[], groupId?: string): Item[] {
    if (!this.allowFixtureAuthors) {
      // Runtime seed injection is an OPEN ingress that bypasses the author
      // binding — a trusted instance must not offer it (spec 08: fixture
      // paths must be unreachable in the production path).
      throw new Error("injectSeedItems is a fixture-only ingress — construct the MockConnector with { allowFixtureAuthors: true }")
    }
    const targetGroupId = groupId ?? this.currentGroup?.id
    const injected: Item[] = []
    let changed = false

    for (const item of items) {
      const scopeId = item.type === "feature" ? null : targetGroupId ?? null
      const scopeItems = this.getScopeItems(scopeId, true)
      let stored = scopeItems.get(item.id)
      if (!stored) {
        this.assertNoGlobalScopeCollision(scopeId, item.id, item.type)
        stored = item
        this.storeItem(scopeId, stored)
        changed = true
      }
      injected.push(stored)

      if (scopeId !== null && targetGroupId && this.registerItemInGroup(stored.id, targetGroupId)) {
        changed = true
      }
    }

    if (changed) this.notifyObservers()
    return injected
  }

  getItemGroupId(itemId: string): string | null {
    const activeGroupId = this.currentGroup?.id
    if (activeGroupId && this.itemsByScope.get(activeGroupId)?.has(itemId)) return activeGroupId

    const matchingGroups = [...this.itemsByScope.entries()]
      .filter(([scopeId, items]) => scopeId !== null && items.has(itemId))
      .map(([scopeId]) => scopeId)
    return matchingGroups.length === 1 ? matchingGroups[0] : null
  }

  moveItemToGroup(itemId: string, targetGroupId: string): void {
    this.requireCurrentUser()
    const location = this.findVisibleItemLocation(itemId)
    if (!location || (location.scopeId === null && location.item.type === "feature")) throw new Error(`Item not found: ${itemId}`)
    if (location.scopeId === targetGroupId) return

    const targetItems = this.getScopeItems(targetGroupId, true)
    if (targetItems.has(itemId)) throw new Error(`Item already exists in target group: ${itemId}`)

    targetItems.set(itemId, location.item)
    this.appendActivity(this.activityScopeFor(location.scopeId), "delete", location.item)
    this.appendActivity(this.activityScopeFor(targetGroupId), "create", location.item)
    const orderEntry = this.itemOrder.find(
      (entry) => entry.scopeId === location.scopeId && entry.id === itemId
    )
    if (orderEntry) orderEntry.scopeId = targetGroupId
    location.items.delete(itemId)
    if (location.scopeId !== null) {
      this.groupItems[location.scopeId] = (this.groupItems[location.scopeId] ?? [])
        .filter((id) => id !== itemId)
    }
    this.registerItemInGroup(itemId, targetGroupId)
    this.notifyObservers()
    this.notifyActivityObservers()
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
    this.notificationState = applyNotificationStatePatch(this.notificationState, patch)
    this.notificationStateObs.set(cloneNotificationState(this.notificationState))
  }

  private requireCurrentUser(): User {
    if (!this.currentUser) throw new Error("Authentication required")
    return this.currentUser
  }

  private activityScopeFor(scopeId: string | null): string {
    return scopeId ?? "__personal__"
  }

  private appendActivity(scopeId: string, action: ActivityEntry["action"], item: Item): void {
    const entries = this.activityByScope.get(scopeId) ?? new Map<string, ActivityEntry>()
    const entry: ActivityEntry = {
      id: crypto.randomUUID(), ts: new Date().toISOString(), actor: this.requireCurrentUser().id,
      action, targetId: item.id, targetType: item.type,
      summary: deriveActivitySummary(item, (id) => this.findVisibleItemLocation(id)?.item),
    }
    entries.set(entry.id, entry)
    while (entries.size > 500) {
      const oldest = [...entries.values()].sort(compareActivity)[entries.size - 1]
      if (oldest) entries.delete(oldest.id)
    }
    this.activityByScope.set(scopeId, entries)
  }

  private readActivity(limit?: number): ActivityEntry[] {
    const scopes = this.currentGroup
      ? [this.currentGroup.id]
      : [...this.groups.map((group) => group.id), "__personal__"]
    const entries = scopes.flatMap((scope) => [...(this.activityByScope.get(scope)?.values() ?? [])])
      .filter((entry) => entry.action === "create" || entry.action === "update" || entry.action === "delete")
      .sort(compareActivity)
    return limit === undefined ? entries : entries.slice(0, Math.max(0, limit))
  }

  private readScopedActivity(limit?: number): ScopedActivityEntry[] {
    const visibleScopes = new Set([...this.groups.map((group) => group.id), "__personal__"])
    const entries = [...this.activityByScope.entries()].flatMap(([groupId, byId]) =>
      !visibleScopes.has(groupId) ? [] : [...byId.values()]
        .filter((entry) => entry.action === "create" || entry.action === "update" || entry.action === "delete")
        .map((entry) => this.resolveScopedActivity(groupId, entry)),
    ).sort((a, b) => compareActivity(a.entry, b.entry))
    return limit === undefined ? entries : entries.slice(0, Math.max(0, limit))
  }

  private resolveScopedActivity(groupId: string, entry: ActivityEntry): ScopedActivityEntry {
    const items = this.itemsByScope.get(groupId === "__personal__" ? null : groupId)
    const target = items?.get(entry.targetId)
    let subject: ScopedActivityEntry["subject"] = null
    if (entry.action === "delete") {
      subject = { id: entry.targetId, type: entry.targetType, ...(entry.summary ? { title: entry.summary } : {}) }
    } else if (target) {
      const parentId = target.type === "reaction" || target.type === "comment"
        ? target.relations?.find((relation) => relation.predicate === "reactsTo" || relation.predicate === "commentOn")?.target.replace(/^item:/, "")
        : undefined
      const resolved = parentId ? items?.get(parentId) : target
      if (resolved) subject = { id: resolved.id, type: resolved.type, createdBy: resolved.createdBy, ...(itemDisplayTitle(resolved) ? { title: itemDisplayTitle(resolved) } : {}), moduleHints: moduleHintsFor(resolved) }
    }
    const actor = groupId === "__personal__"
      ? (this.users.find((user) => user.id === entry.actor) ?? { id: entry.actor })
      : this.groupMembers[groupId]?.includes(entry.actor)
        ? (this.users.find((user) => user.id === entry.actor) ?? { id: entry.actor })
        : null
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

  // --- Relation Records ---

  getRelationRecords(filter?: RelationRecordFilter): Promise<RelationRecord[]> {
    return this.relationStore.getRelationRecords(filter)
  }

  observeRelationRecords(filter?: RelationRecordFilter): Observable<RelationRecord[]> {
    return this.relationStore.observeRelationRecords(filter)
  }

  getRelationNeighbors(endpoint: string, predicate?: string): Promise<Item[]> {
    return this.relationStore.getRelationNeighbors(endpoint, predicate)
  }

  observeRelationNeighbors(endpoint: string, predicate?: string): Observable<Item[]> {
    return this.relationStore.observeRelationNeighbors(endpoint, predicate)
  }

  async createRelationRecord(input: RelationRecordInput): Promise<RelationRecord> {
    this.requireCurrentUser()
    return this.relationStore.createRelationRecord(input)
  }

  async updateRelationRecord(id: string, updates: RelationRecordUpdate): Promise<RelationRecord> {
    this.requireCurrentUser()
    return this.relationStore.updateRelationRecord(id, updates)
  }

  async deleteRelationRecord(id: string): Promise<void> {
    this.requireCurrentUser()
    return this.relationStore.deleteRelationRecord(id)
  }

  // --- Relations ---

  async getRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Promise<Item[]> {
    return findRelatedItems(itemId, this.getScopedItems(), predicate, options)
  }

  observeRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Observable<Item[]> {
    const key = `${itemId}:${predicate ?? ""}:${JSON.stringify(options ?? {})}`
    if (!this.relatedObservables.has(key)) {
      const related = findRelatedItems(itemId, this.getScopedItems(), predicate, options)
      this.relatedObservables.set(key, createObservable(related))
      this.relatedObservableParams.set(key, { itemId, predicate, options })
    }
    return this.relatedObservables.get(key)!
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
    return [{ method: "mock", label: "Mock Login" }]
  }

  async authenticate(_method: string, _credentials: unknown): Promise<User> {
    const user = this.users[0]
    this.currentUser = user
    this.currentUserObs.set(user)
    this.authState.set({ status: "authenticated", user })
    return user
  }

  async logout(): Promise<void> {
    this.currentUser = null
    this.currentUserObs.set(null)
    this.authState.set({ status: "unauthenticated" })
  }

  // --- Sources ---

  getSources(): Source[] {
    return [{ id: "mock", name: "Mock Data", connector: this }]
  }

  getActiveSource(): Source {
    return { id: "mock", name: "Mock Data", connector: this }
  }

  setActiveSource(_sourceId: string): void {
    // Mock: only one source
  }

  // --- Internal ---

  private getScopeItems(scopeId: string | null, create = false): Map<string, Item> {
    let items = this.itemsByScope.get(scopeId)
    if (!items && create) {
      items = new Map<string, Item>()
      this.itemsByScope.set(scopeId, items)
    }
    return items ?? new Map<string, Item>()
  }

  private storeItem(scopeId: string | null, item: Item): void {
    const items = this.getScopeItems(scopeId, true)
    if (items.has(item.id)) return
    items.set(item.id, item)
    this.itemOrder.push({ scopeId, id: item.id })
  }

  private removeItemOrder(scopeId: string | null, id: string): void {
    this.itemOrder = this.itemOrder.filter(
      (entry) => entry.scopeId !== scopeId || entry.id !== id
    )
  }

  private findVisibleItemLocation(id: string): {
    scopeId: string | null
    items: Map<string, Item>
    item: Item
  } | null {
    const activeGroupId = this.currentGroup?.id
    if (activeGroupId) {
      const scopedItems = this.itemsByScope.get(activeGroupId)
      const scopedItem = scopedItems?.get(id)
      if (scopedItems && scopedItem) return { scopeId: activeGroupId, items: scopedItems, item: scopedItem }

      const globalItems = this.itemsByScope.get(null)
      const globalItem = globalItems?.get(id)
      if (globalItems && globalItem?.type === "feature") {
        return { scopeId: null, items: globalItems, item: globalItem }
      }
      return null
    }

    const globalItems = this.itemsByScope.get(null)
    const globalItem = globalItems?.get(id)
    if (globalItems && globalItem) return { scopeId: null, items: globalItems, item: globalItem }

    const matches = [...this.itemsByScope.entries()]
      .filter(([scopeId, items]) => scopeId !== null && items.has(id))
    if (matches.length !== 1) return null
    const [scopeId, items] = matches[0]
    return { scopeId, items, item: items.get(id)! }
  }

  private findVisibleItem(id: string): Item | undefined {
    return this.findVisibleItemLocation(id)?.item
  }

  private allocateItemId(scopeId: string | null, type: string): string {
    const items = this.getScopeItems(scopeId, true)
    let id: string
    do {
      id = `item-${this.nextItemId++}`
    } while (
      items.has(id)
      || (type === "feature" ? this.hasItemOutsideScope(scopeId, id) : this.hasGlobalFeature(id))
    )
    return id
  }

  private hasGlobalFeature(id: string): boolean {
    return this.itemsByScope.get(null)?.get(id)?.type === "feature"
  }

  private hasItemOutsideScope(scopeId: string | null, id: string): boolean {
    return [...this.itemsByScope.entries()]
      .some(([candidateScopeId, items]) => candidateScopeId !== scopeId && items.has(id))
  }

  private assertNoItemOutsideScope(scopeId: string | null, id: string): void {
    if (this.hasItemOutsideScope(scopeId, id)) {
      throw new Error(`Item ID conflicts with another scope: ${id}`)
    }
  }

  private assertNoGlobalScopeCollision(scopeId: string | null, id: string, type: string): void {
    if (type === "feature") {
      this.assertNoItemOutsideScope(scopeId, id)
      return
    }
    if (scopeId !== null && this.hasGlobalFeature(id)) {
      throw new Error(`Item ID conflicts with global feature: ${id}`)
    }
  }

  private registerItemInGroup(itemId: string, groupId: string): boolean {
    if (groupId === "all") return false
    if (!this.groupItems[groupId]) this.groupItems[groupId] = []
    if (this.groupItems[groupId].includes(itemId)) return false
    this.groupItems[groupId].push(itemId)
    return true
  }

  private notifyGroupObservers(): void {
    this.groupsObs.set([...this.groups])
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
      const item = this.findVisibleItem(id) ?? null
      observable.set(item)
    }
    for (const [key, observable] of this.relatedObservables) {
      const params = this.relatedObservableParams.get(key)
      if (params) {
        const related = findRelatedItems(params.itemId, this.getScopedItems(), params.predicate, params.options)
        observable.set(related)
      }
    }
  }
}
