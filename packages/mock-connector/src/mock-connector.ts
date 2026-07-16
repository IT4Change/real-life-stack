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
  applyPagination,
  createDefaultRelationStore,
  createObservable,
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

export class MockConnector implements FullConnector, RelationRecordCapable, RelationRecordWriterCapable {
  private items: Item[]
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

  constructor(seed?: MockConnectorSeed, options: MockConnectorOptions = {}) {
    const data = seed ?? {
      items: demoItems,
      groups: demoGroups,
      users: demoUsers,
      groupMembers: demoGroupMembers,
      groupItems: demoGroupItems,
    }

    this.items = deduplicateItems(data.items)
    this.groups = data.groups.filter((g) => (g.data?.scope as string) !== "aggregate")
    this.users = [...data.users]
    this.groupMembers = { ...data.groupMembers }
    this.groupItems = copyGroupItems(data.groupItems)
    this.currentGroup = null
    this.currentUser = this.users[0] ?? null
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
    for (const obs of this.relatedObservables.values()) obs.destroy()
    for (const obs of this.memberObservables.values()) obs.destroy()
    this.itemObservables.clear()
    this.singleItemObservables.clear()
    this.relatedObservables.clear()
    this.relatedObservableParams.clear()
    this.memberObservables.clear()
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
      return
    }
    if (this.currentGroup?.id === id) return
    const group = this.groups.find((g) => g.id === id)
    if (group) {
      this.currentGroup = group
      this.currentGroupObs.set(group)
      this.notifyObservers()
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
    Object.assign(group, updates)
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
      // "Alles" scope: return all items (except feature items which are always global)
      return this.items
    }

    // For specific scopes (personal, friends, group-*): filter by groupItems mapping
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
    return this.items.find((item) => item.id === id) ?? null
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
      const item = this.items.find((i) => i.id === id) ?? null
      this.singleItemObservables.set(id, createObservable(item))
    }
    return this.singleItemObservables.get(id)!
  }

  async createItem(item: CreateItemInput): Promise<Item> {
    if (item.id !== undefined) {
      const existing = this.items.find((candidate) => candidate.id === item.id)
      if (existing) return existing
    }

    const id = item.id ?? this.allocateItemId()
    const newItem: Item = {
      ...item,
      id,
      createdAt: new Date().toISOString(),
    }
    this.items.push(newItem)

    // Register item in current group's scope
    const groupId = this.currentGroup?.id
    if (groupId) this.registerItemInGroup(newItem.id, groupId)

    this.notifyObservers()
    return newItem
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    const idx = this.items.findIndex((i) => i.id === id)
    if (idx === -1) throw new Error(`Item not found: ${id}`)
    this.items[idx] = { ...this.items[idx], ...updates, id }
    this.notifyObservers()
    return this.items[idx]
  }

  async deleteItem(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id)
    for (const groupId of Object.keys(this.groupItems)) {
      this.groupItems[groupId] = this.groupItems[groupId].filter((itemId) => itemId !== id)
    }
    this.notifyObservers()
  }

  /**
   * Privileged fixture/ETL path. Seed Items already carry their canonical IDs,
   * timestamps and authors, so they deliberately bypass the auth-bound writers.
   */
  injectSeedItems(items: readonly Item[], groupId?: string): Item[] {
    const targetGroupId = groupId ?? this.currentGroup?.id
    const injected: Item[] = []
    let changed = false

    for (const item of items) {
      let stored = this.items.find((candidate) => candidate.id === item.id)
      if (!stored) {
        stored = item
        this.items.push(stored)
        changed = true
      }
      injected.push(stored)

      if (targetGroupId && this.registerItemInGroup(stored.id, targetGroupId)) {
        changed = true
      }
    }

    if (changed) this.notifyObservers()
    return injected
  }

  getItemGroupId(itemId: string): string | null {
    for (const [gid, itemIds] of Object.entries(this.groupItems)) {
      if (itemIds.includes(itemId)) return gid
    }
    return null
  }

  moveItemToGroup(itemId: string, targetGroupId: string): void {
    // Remove from all groups
    for (const gid of Object.keys(this.groupItems)) {
      this.groupItems[gid] = this.groupItems[gid].filter((id) => id !== itemId)
    }
    // Add to target group
    this.registerItemInGroup(itemId, targetGroupId)
    this.notifyObservers()
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

  createRelationRecord(input: RelationRecordInput): Promise<RelationRecord> {
    return this.relationStore.createRelationRecord(input)
  }

  updateRelationRecord(id: string, updates: RelationRecordUpdate): Promise<RelationRecord> {
    return this.relationStore.updateRelationRecord(id, updates)
  }

  deleteRelationRecord(id: string): Promise<void> {
    return this.relationStore.deleteRelationRecord(id)
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

  private allocateItemId(): string {
    let id: string
    do {
      id = `item-${this.nextItemId++}`
    } while (this.items.some((item) => item.id === id))
    return id
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
      const item = this.items.find((i) => i.id === id) ?? null
      observable.set(item)
    }
    for (const [key, observable] of this.relatedObservables) {
      const params = this.relatedObservableParams.get(key)
      if (params) {
        const related = findRelatedItems(params.itemId, this.items, params.predicate, params.options)
        observable.set(related)
      }
    }
  }
}
