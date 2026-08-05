import type {
  AuthMethod,
  AuthState,
  ClaimVerdict,
  CreateItemInput,
  DataInterface,
  Group,
  Item,
  ItemFilter,
  ItemWriter,
  Observable,
  RelationRecord,
  RelationRecordCreateConnector,
  RelationRecordFilter,
  RelationRecordInput,
  RelationRecordUpdate,
  Source,
  User,
} from "@real-life-stack/data-interface"
import {
  createDefaultRelationStore,
  createObservable,
  createRelationRecordWith,
} from "@real-life-stack/data-interface"
import type {
  AuthSessionLike,
  ChannelLike,
  SupabaseClientLike,
  SupabaseResult,
} from "./client-types.js"
import { applyItemFilter } from "./filter-translation.js"
import {
  itemToInsertRow,
  itemUpdateToRowPatch,
  profileToUser,
  rowToGroup,
  rowToItem,
} from "./row-mapping.js"

export interface SupabaseConnectorOptions {
  /**
   * Marked fixture path (tests/tooling with a service-role client): keeps
   * caller-supplied foreign authors on the raw item API — and LOSES the
   * claim-verification capability, because spec 08's authoritative "trusted"
   * requires every ingress to bind createdBy to the session. Production
   * connectors never set this; with the anon key the server-side RLS
   * policies reject foreign authors anyway.
   */
  allowFixtureAuthors?: boolean
}

type ItemsObservable = ReturnType<typeof createObservable<Item[]>>

function throwOnError<T>(result: SupabaseResult<T>, action: string): T {
  if (result.error) throw new Error(`[SupabaseConnector] ${action}: ${result.error.message}`)
  return result.data as T
}

/**
 * Native Supabase connector (Weg B): PostgREST for queries/writes, Realtime
 * postgres_changes for WoT-grade reactivity. The authoritative claim mode's
 * security rests on the RLS policies in supabase/migrations/0001 — insert
 * WITH CHECK binds created_by to auth.uid(), the immutability trigger closes
 * the update path — NOT on this client code.
 */
export class SupabaseConnector implements DataInterface, ItemWriter {
  private readonly client: SupabaseClientLike
  private readonly allowFixtureAuthors: boolean

  private currentGroup: Group | null = null
  /** Scope source of truth: set SYNCHRONOUSLY in setCurrentGroup so a
      createItem right after group selection never races the group fetch. */
  private currentGroupId: string | null = null
  private currentGroupObs = createObservable<Group | null>(null)
  private groupsObs: ReturnType<typeof createObservable<Group[]>> | null = null
  private memberObservables = new Map<string | null, ReturnType<typeof createObservable<User[]>>>()

  private authState = createObservable<AuthState>({ status: "loading" })
  private currentUserObs = createObservable<User | null>(null)
  private currentUser: User | null = null
  private authUnsubscribe: (() => void) | null = null

  private itemObservables = new Map<string, { observable: ItemsObservable; filter: ItemFilter }>()
  private singleItemObservables = new Map<string, ReturnType<typeof createObservable<Item | null>>>()
  private channels: ChannelLike[] = []
  private itemsRefreshScheduled = false
  private groupsRefreshScheduled = false

  /**
   * Authoritative claim verdict (spec 08): present only when every ingress
   * binds createdBy — i.e. never on the fixture path. Assigned in the
   * constructor so `hasClaimVerification()` reflects the trust boundary.
   */
  verifyRecordClaim?: (record: RelationRecord) => Promise<ClaimVerdict>

  constructor(client: SupabaseClientLike, options?: SupabaseConnectorOptions) {
    this.client = client
    this.allowFixtureAuthors = options?.allowFixtureAuthors === true
    if (!this.allowFixtureAuthors) {
      this.verifyRecordClaim = async () => "trusted"
    }
  }

  // --- Lifecycle ---

  async init(): Promise<void> {
    const { data } = await this.client.auth.getSession()
    await this.applySession(data?.session ?? null)

    const { data: authSub } = this.client.auth.onAuthStateChange((_event, session) => {
      void this.applySession(session)
    })
    this.authUnsubscribe = () => authSub.subscription.unsubscribe()

    this.setupRealtimeChannels()
  }

  /**
   * (Re)join the realtime channels. postgres_changes subscriptions carry the
   * JWT CLAIMS OF THE JOIN — a channel joined before login runs as `anon`
   * and our RLS (`select to authenticated`) yields no events. applySession
   * re-joins on auth transitions so the subscription matches the session.
   */
  private setupRealtimeChannels(): void {
    for (const channel of this.channels) this.client.removeChannel(channel)
    this.channels = []

    const itemsChannel = this.client
      .channel("rls-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => {
        this.scheduleItemsRefresh()
      })
    itemsChannel.subscribe()
    this.channels.push(itemsChannel)

    const groupsChannel = this.client
      .channel("rls-groups")
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => {
        this.scheduleGroupsRefresh()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => {
        this.scheduleGroupsRefresh()
      })
    groupsChannel.subscribe()
    this.channels.push(groupsChannel)
  }

  async dispose(): Promise<void> {
    this.authUnsubscribe?.()
    this.authUnsubscribe = null
    for (const channel of this.channels) this.client.removeChannel(channel)
    this.channels = []
    for (const { observable } of this.itemObservables.values()) observable.destroy()
    this.itemObservables.clear()
    for (const observable of this.singleItemObservables.values()) observable.destroy()
    this.singleItemObservables.clear()
    for (const observable of this.memberObservables.values()) observable.destroy()
    this.memberObservables.clear()
    this.groupsObs?.destroy()
    this.groupsObs = null
    this.authState.destroy()
    this.currentUserObs.destroy()
    this.currentGroupObs.destroy()
  }

  // --- Items ---

  async getItems(filter?: ItemFilter): Promise<Item[]> {
    const query = applyItemFilter(this.client.from("items").select("*"), filter)
    const rows = throwOnError(await query, "getItems")
    return rows.map(rowToItem)
  }

  async getItem(id: string): Promise<Item | null> {
    const result = await this.client.from("items").select("*").eq("id", id).maybeSingle()
    const row = throwOnError(result, "getItem")
    return row ? rowToItem(row) : null
  }

  observe(filter: ItemFilter): Observable<Item[]> {
    const key = JSON.stringify(filter, Object.keys(filter as Record<string, unknown>).sort())
    const existing = this.itemObservables.get(key)
    if (existing) return existing.observable
    // Starts unloaded; markLoaded() once the first fetch settles so consumers
    // can tell "still loading" from "loaded, empty".
    const observable = createObservable<Item[]>([], false)
    this.itemObservables.set(key, { observable, filter })
    void this.getItems(filter)
      .then((items) => observable.set(items))
      .catch((error) => console.error("[SupabaseConnector] observe initial load failed", error))
      .finally(() => observable.markLoaded())
    return observable
  }

  observeItem(id: string): Observable<Item | null> {
    const existing = this.singleItemObservables.get(id)
    if (existing) return existing
    const observable = createObservable<Item | null>(null, false)
    this.singleItemObservables.set(id, observable)
    void this.getItem(id)
      .then((item) => observable.set(item))
      .catch((error) => console.error("[SupabaseConnector] observeItem initial load failed", error))
      .finally(() => observable.markLoaded())
    return observable
  }

  /** Refresh every registered item observable, batched per microtask —
      one storm of realtime events triggers one refetch round. */
  private scheduleItemsRefresh(): void {
    if (this.itemsRefreshScheduled) return
    this.itemsRefreshScheduled = true
    queueMicrotask(() => {
      this.itemsRefreshScheduled = false
      for (const { observable, filter } of this.itemObservables.values()) {
        void this.getItems(filter)
          .then((items) => observable.set(items))
          .catch((error) => console.error("[SupabaseConnector] observe refresh failed", error))
      }
      for (const [id, observable] of this.singleItemObservables) {
        void this.getItem(id)
          .then((item) => observable.set(item))
          .catch((error) => console.error("[SupabaseConnector] observeItem refresh failed", error))
      }
    })
  }

  async createItem(item: CreateItemInput): Promise<Item> {
    return this.createItemInGroup(item, this.currentGroupId)
  }

  private async createItemInGroup(item: CreateItemInput, groupId: string | null): Promise<Item> {
    const user = await this.getCurrentUser()
    // Regular ingress binds createdBy to the session (mirrored server-side by
    // the insert policy); the fixture path keeps caller-supplied authors.
    const createdBy = this.allowFixtureAuthors
      ? (item.createdBy ?? user?.id)
      : user?.id
    if (!createdBy) throw new Error("[SupabaseConnector] createItem requires an authenticated user")
    // items.id has NO db-side default (canonical relation-record ids are
    // caller-supplied) — generate here when the caller brings none.
    const id = item.id ?? crypto.randomUUID()
    const row = itemToInsertRow({ ...item, id, createdBy }, groupId)
    const result = await this.client.from("items").insert(row).select().single()
    const created = rowToItem(throwOnError(result, "createItem"))
    this.scheduleItemsRefresh()
    return created
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    // Identity fields are stripped client-side (fail closed) and immutable
    // server-side (trigger) — updates carry content only.
    const patch = itemUpdateToRowPatch(updates)
    if (Object.keys(patch).length === 0) {
      const current = await this.getItem(id)
      if (!current) throw new Error(`[SupabaseConnector] updateItem: item not found: ${id}`)
      return current
    }
    const result = await this.client.from("items").update(patch).eq("id", id).select().single()
    const updated = rowToItem(throwOnError(result, "updateItem"))
    this.scheduleItemsRefresh()
    return updated
  }

  async deleteItem(id: string): Promise<void> {
    throwOnError(await this.client.from("items").delete().eq("id", id), "deleteItem")
    this.scheduleItemsRefresh()
  }

  // --- Relation records (auth-bound store, spec 08) ---

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

  async createRelationRecord(input: RelationRecordInput): Promise<RelationRecord> {
    // A relation record belongs NEXT TO the item it targets: created from the
    // overview (no current group), it must land in the target's owner group,
    // otherwise the group's members never see it.
    const targetItemId = input.to.startsWith("item:") ? input.to.slice("item:".length) : null
    const targetGroupId = targetItemId ? await this.getItemGroupId(targetItemId) : null
    if (targetGroupId === null || targetGroupId === this.currentGroupId) {
      return this.relationStoreInstance().createRelationRecord(input)
    }
    const scoped: RelationRecordCreateConnector = {
      getItem: (id: string) => this.getItem(id),
      createItem: (item: CreateItemInput) => this.createItemInGroup(item, targetGroupId),
      getCurrentUser: () => this.getCurrentUser(),
    }
    return createRelationRecordWith(scoped, input)
  }

  updateRelationRecord(id: string, updates: RelationRecordUpdate): Promise<RelationRecord> {
    return this.relationStoreInstance().updateRelationRecord(id, updates)
  }

  deleteRelationRecord(id: string): Promise<void> {
    return this.relationStoreInstance().deleteRelationRecord(id)
  }

  private async getItemGroupId(itemId: string): Promise<string | null> {
    const result = await this.client.from("items").select("group_id").eq("id", itemId).maybeSingle()
    const row = throwOnError(result, "getItemGroupId")
    return (row?.group_id as string | null) ?? null
  }

  // --- Groups ---

  async getGroups(): Promise<Group[]> {
    const [groupsResult, membersResult] = await Promise.all([
      this.client.from("groups").select("*").order("created_at", { ascending: true }).order("id", { ascending: true }),
      this.client.from("group_members").select("*"),
    ])
    const groupRows = throwOnError(await Promise.resolve(groupsResult), "getGroups")
    const memberRows = throwOnError(await Promise.resolve(membersResult), "getGroups members")
    const membersByGroup = new Map<string, string[]>()
    for (const row of memberRows) {
      const groupId = row.group_id as string
      const list = membersByGroup.get(groupId) ?? []
      list.push(row.user_id as string)
      membersByGroup.set(groupId, list)
    }
    const groups = groupRows.map((row) => rowToGroup(row, membersByGroup.get(row.id as string) ?? []))
    this.groupsObservable().set(groups)
    return groups
  }

  private groupsObservable(): ReturnType<typeof createObservable<Group[]>> {
    this.groupsObs ??= createObservable<Group[]>([], false)
    return this.groupsObs
  }

  observeGroups(): Observable<Group[]> {
    const observable = this.groupsObservable()
    void this.getGroups()
      .catch((error) => console.error("[SupabaseConnector] observeGroups initial load failed", error))
      .finally(() => observable.markLoaded())
    return observable
  }

  private scheduleGroupsRefresh(): void {
    if (this.groupsRefreshScheduled) return
    this.groupsRefreshScheduled = true
    queueMicrotask(() => {
      this.groupsRefreshScheduled = false
      if (this.groupsObs) {
        void this.getGroups().catch((error) => console.error("[SupabaseConnector] groups refresh failed", error))
      }
      for (const groupId of this.memberObservables.keys()) {
        void this.refreshMembers(groupId)
      }
    })
  }

  getCurrentGroup(): Group | null {
    return this.currentGroup
  }

  observeCurrentGroup(): Observable<Group | null> {
    return this.currentGroupObs
  }

  setCurrentGroup(id: string | null): void {
    this.currentGroupId = id
    if (id === null) {
      this.currentGroup = null
      this.currentGroupObs.set(null)
      return
    }
    const cached = this.groupsObs?.current.find((group) => group.id === id)
    if (cached) {
      this.currentGroup = cached
      this.currentGroupObs.set(cached)
      return
    }
    // Minimal group immediately (the id IS the scope); full data follows —
    // guarded so a stale fetch never overwrites a newer selection.
    this.currentGroup = { id, name: "", data: {} }
    this.currentGroupObs.set(this.currentGroup)
    void this.client.from("groups").select("*").eq("id", id).maybeSingle().then((result) => {
      if (this.currentGroupId !== id) return
      const row = throwOnError(result, "setCurrentGroup")
      const group = row ? rowToGroup(row) : null
      this.currentGroup = group
      this.currentGroupObs.set(group)
    })
  }

  async createGroup(name: string, data?: Record<string, unknown>): Promise<Group> {
    const user = await this.getCurrentUser()
    if (!user) throw new Error("[SupabaseConnector] createGroup requires an authenticated user")
    const result = await this.client
      .from("groups")
      .insert({ name, data: data ?? {}, created_by: user.id })
      .select()
      .single()
    const row = throwOnError(result, "createGroup")
    // The creator is a member of their own group (WoT parity).
    await this.addMembership(row.id as string, user.id)
    this.scheduleGroupsRefresh()
    return rowToGroup(row, [user.id])
  }

  async updateGroup(id: string, updates: Partial<Group>): Promise<Group> {
    const patch = {
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.data !== undefined ? { data: updates.data } : {}),
    }
    const result = await this.client.from("groups").update(patch).eq("id", id).select().single()
    const row = throwOnError(result, "updateGroup")
    this.scheduleGroupsRefresh()
    return rowToGroup(row)
  }

  async deleteGroup(id: string): Promise<void> {
    throwOnError(await this.client.from("groups").delete().eq("id", id), "deleteGroup")
    if (this.currentGroupId === id) {
      this.currentGroupId = null
      this.currentGroup = null
      this.currentGroupObs.set(null)
    }
    this.scheduleGroupsRefresh()
  }

  async getMembers(groupId: string | null): Promise<User[]> {
    if (groupId === null) {
      const result = await this.client.from("profiles").select("*").order("created_at", { ascending: true }).order("id", { ascending: true })
      return throwOnError(result, "getMembers").map(profileToUser)
    }
    const [membershipResult, groupResult] = await Promise.all([
      this.client.from("group_members").select("*").eq("group_id", groupId),
      this.client.from("groups").select("*").eq("id", groupId).maybeSingle(),
    ])
    const memberIds = throwOnError(await Promise.resolve(membershipResult), "getMembers").map((row) => row.user_id as string)
    const groupRow = throwOnError(await Promise.resolve(groupResult), "getMembers group")
    if (memberIds.length === 0) return []
    const profilesResult = await this.client.from("profiles").select("*").in("id", memberIds)
    const profiles = throwOnError(profilesResult, "getMembers profiles")
    const byId = new Map(profiles.map((row) => [row.id as string, profileToUser(row)]))
    const adminId = groupRow?.created_by as string | undefined
    return memberIds.map((id) => {
      const user = byId.get(id) ?? { id }
      return { ...user, isAdmin: adminId !== undefined && id === adminId }
    })
  }

  observeMembers(groupId: string | null): Observable<User[]> {
    let observable = this.memberObservables.get(groupId)
    if (!observable) {
      observable = createObservable<User[]>([], false)
      this.memberObservables.set(groupId, observable)
      void this.getMembers(groupId)
        .then((members) => observable!.set(members))
        .catch((error) => console.error("[SupabaseConnector] observeMembers initial load failed", error))
        .finally(() => observable!.markLoaded())
    }
    return observable
  }

  private async refreshMembers(groupId: string | null): Promise<void> {
    const observable = this.memberObservables.get(groupId)
    if (!observable) return
    try {
      observable.set(await this.getMembers(groupId))
    } catch (error) {
      console.error("[SupabaseConnector] members refresh failed", error)
    }
  }

  async inviteMember(groupId: string, userId: string): Promise<void> {
    await this.addMembership(groupId, userId)
    this.scheduleGroupsRefresh()
  }

  private async addMembership(groupId: string, userId: string): Promise<void> {
    const result = await this.client.from("group_members").insert({ group_id: groupId, user_id: userId }).select().single()
    // Duplicate membership is idempotent, not an error.
    if (result.error && result.error.code !== "23505") {
      throw new Error(`[SupabaseConnector] inviteMember: ${result.error.message}`)
    }
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    const deletion = this.client.from("group_members").delete().eq("group_id", groupId)
    // The delete builder chains eq twice (composite key) — the structural
    // type exposes one eq, so chain through the returned builder.
    const result = await (deletion as unknown as { eq(column: string, value: unknown): PromiseLike<SupabaseResult<unknown>> }).eq("user_id", userId)
    throwOnError(result, "removeMember")
    this.scheduleGroupsRefresh()
  }

  // --- Users / Auth ---

  /** Identity the realtime channels were joined with (rejoin on change). */
  private realtimeAuthUserId: string | null = null

  private async applySession(session: AuthSessionLike | null): Promise<void> {
    const nextUserId = session?.user?.id ?? null
    if (this.channels.length > 0 && nextUserId !== this.realtimeAuthUserId) {
      this.realtimeAuthUserId = nextUserId
      this.setupRealtimeChannels()
    } else {
      this.realtimeAuthUserId = nextUserId
    }
    if (!session?.user) {
      this.currentUser = null
      this.currentUserObs.set(null)
      this.authState.set({ status: "unauthenticated" })
      return
    }
    const user = await this.resolveUser(session.user.id, session)
    this.currentUser = user
    this.currentUserObs.set(user)
    this.authState.set({ status: "authenticated", user })
  }

  private async resolveUser(id: string, session?: AuthSessionLike | null): Promise<User> {
    const fromProfile = await this.getUser(id).catch(() => null)
    if (fromProfile) return fromProfile
    const metadata = session?.user.user_metadata
    const displayName = typeof metadata?.display_name === "string" ? metadata.display_name : session?.user.email ?? undefined
    return { id, ...(displayName ? { displayName } : {}) }
  }

  async getCurrentUser(): Promise<User | null> {
    if (this.currentUser) return this.currentUser
    const { data } = await this.client.auth.getSession()
    const session = data?.session ?? null
    if (!session?.user) return null
    return this.resolveUser(session.user.id, session)
  }

  observeCurrentUser(): Observable<User | null> {
    return this.currentUserObs
  }

  async getUser(id: string): Promise<User | null> {
    const result = await this.client.from("profiles").select("*").eq("id", id).maybeSingle()
    const row = throwOnError(result, "getUser")
    return row ? profileToUser(row) : null
  }

  getAuthState(): Observable<AuthState> {
    return this.authState
  }

  getAuthMethods(): AuthMethod[] {
    return [
      { method: "anonymous", label: "Anonym ausprobieren" },
      { method: "email", label: "E-Mail Login" },
      { method: "email-signup", label: "E-Mail Registrierung" },
    ]
  }

  async authenticate(method: string, credentials: unknown): Promise<User> {
    const creds = (credentials ?? {}) as { email?: string; password?: string; displayName?: string }
    let result: SupabaseResult<{ user: { id: string } | null }>
    if (method === "anonymous") {
      result = await this.client.auth.signInAnonymously()
    } else if (method === "email") {
      if (!creds.email || !creds.password) throw new Error("[SupabaseConnector] email auth requires email and password")
      result = await this.client.auth.signInWithPassword({ email: creds.email, password: creds.password })
    } else if (method === "email-signup") {
      if (!creds.email || !creds.password) throw new Error("[SupabaseConnector] signup requires email and password")
      result = await this.client.auth.signUp({
        email: creds.email,
        password: creds.password,
        ...(creds.displayName ? { options: { data: { display_name: creds.displayName } } } : {}),
      })
    } else {
      throw new Error(`[SupabaseConnector] unknown auth method: ${method}`)
    }
    const authUser = throwOnError(result, `authenticate(${method})`).user
    if (!authUser) throw new Error(`[SupabaseConnector] authenticate(${method}): no user returned`)
    const user = await this.resolveUser(authUser.id)
    this.currentUser = user
    this.currentUserObs.set(user)
    this.authState.set({ status: "authenticated", user })
    return user
  }

  async logout(): Promise<void> {
    const { error } = await this.client.auth.signOut()
    if (error) throw new Error(`[SupabaseConnector] logout: ${error.message}`)
    this.currentUser = null
    this.currentUserObs.set(null)
    this.authState.set({ status: "unauthenticated" })
  }

  // --- Sources ---

  getSources(): Source[] {
    return [{ id: "supabase", name: "Supabase", connector: this }]
  }

  getActiveSource(): Source {
    return this.getSources()[0]!
  }

  setActiveSource(_sourceId: string): void {
    // Single source.
  }
}
