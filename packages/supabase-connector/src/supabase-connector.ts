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
import type { PublicProfileData } from "@real-life-stack/data-interface"
import {
  createDefaultRelationStore,
  createObservable,
  createRelationRecordWith,
  deriveContext,
} from "@real-life-stack/data-interface"
import type {
  AuthSessionLike,
  ChannelLike,
  FilterBuilderLike,
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
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (payload) => {
        // Member-list display names refresh on ANY profile change; the own
        // profile read only runs when the OWN row changed (no read
        // amplification on foreign edits; unknown id → refresh defensively).
        const changedId = (payload.new as { id?: string } | null)?.id
          ?? (payload.old as { id?: string } | null)?.id
        if (changedId === undefined || changedId === this.sessionUserId) {
          void this.requestProfileRefresh()
        }
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
    this.profileObs.destroy()
    this.profileSyncPendingObs.destroy()
  }

  // --- Items ---

  /** Group ids are server-generated UUIDs; anything else cannot be embedded
      safely in a PostgREST `or=` expression — fail closed. */
  private static readonly SAFE_SCOPE_ID = /^[A-Za-z0-9_-]+$/

  /**
   * Read scope (Local parity): inside a group only that group's rows plus
   * global `feature` items are visible; the overview (no group) and
   * `aggregate`-scoped groups see everything.
   */
  private currentReadScopeGroupId(): string | null {
    if (this.currentGroupId === null) return null
    const scope = this.currentGroup?.data?.scope
    if (scope === "aggregate") return null
    return this.currentGroupId
  }

  private applyGroupScope<Q extends FilterBuilderLike>(query: Q): Q {
    const groupId = this.currentReadScopeGroupId()
    if (groupId === null) return query
    if (!SupabaseConnector.SAFE_SCOPE_ID.test(groupId)) {
      throw new Error(`[SupabaseConnector] unsupported group id for server-side scoping: ${JSON.stringify(groupId)}`)
    }
    // GLOBAL features only (group_id IS NULL): a feature created inside a
    // group is that group's feature and must not leak elsewhere.
    return query.or(`group_id.eq.${groupId},and(type.eq.feature,group_id.is.null)`) as Q
  }

  /** PostgREST caps unbounded queries at max_rows (config.toml: 1000). */
  private static readonly SERVER_PAGE = 1000

  async getItems(filter?: ItemFilter): Promise<Item[]> {
    // Page past the server's silent max_rows cap in EVERY case: unbounded
    // reads fetch everything, and an explicit limit above the cap is honored
    // window by window — never quietly truncated to the first 1000.
    const target = filter?.limit
    const results: Item[] = []
    let offset = filter?.offset ?? 0
    for (;;) {
      const window = target === undefined
        ? SupabaseConnector.SERVER_PAGE
        : Math.min(SupabaseConnector.SERVER_PAGE, target - results.length)
      if (window <= 0) break
      const query = applyItemFilter(this.applyGroupScope(this.client.from("items").select("*")), {
        ...(filter ?? {}),
        limit: window,
        offset,
      })
      const rows = throwOnError(await query, "getItems")
      results.push(...rows.map(rowToItem))
      if (rows.length < window) break
      offset += rows.length
    }
    return results
  }

  async getItem(id: string): Promise<Item | null> {
    const row = await this.getItemRowUnscoped(id)
    if (!row) return null
    const scopeGroupId = this.currentReadScopeGroupId()
    if (scopeGroupId !== null && row.group_id !== scopeGroupId
      && !(row.type === "feature" && row.group_id === null)) return null
    return rowToItem(row)
  }

  private async getItemRowUnscoped(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.from("items").select("*").eq("id", id).maybeSingle()
    return throwOnError(result, "getItem")
  }

  /** Scope-independent single-item read (canonical relation-record ids are
      globally unique; collision checks must see across groups). */
  private async getItemUnscoped(id: string): Promise<Item | null> {
    const row = await this.getItemRowUnscoped(id)
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
    // Returning delete: RLS silently matches 0 rows — distinguish "already
    // gone" (idempotent ok) from "denied" (row still visible → error).
    const deleted = throwOnError(await this.client.from("items").delete().eq("id", id).select(), "deleteItem")
    if (deleted.length === 0 && (await this.getItemRowUnscoped(id)) !== null) {
      throw new Error(`[SupabaseConnector] deleteItem: not authorized to delete ${id}`)
    }
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
      // Collision check must be scope-independent: item ids are globally
      // unique, and the canonical record may live outside the current scope.
      getItem: (id: string) => this.getItemUnscoped(id),
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
      // Reads are group-scoped: every registered item view changes content.
      this.scheduleItemsRefresh()
      return
    }
    const cached = this.groupsObs?.current.find((group) => group.id === id)
    if (cached) {
      this.currentGroup = cached
      this.currentGroupObs.set(cached)
      this.scheduleItemsRefresh()
      return
    }
    // Minimal group immediately (the id IS the scope); full data follows —
    // guarded so a stale fetch never overwrites a newer selection.
    this.currentGroup = { id, name: "", data: {} }
    this.currentGroupObs.set(this.currentGroup)
    this.scheduleItemsRefresh()
    this.client.from("groups").select("*").eq("id", id).maybeSingle().then((result) => {
      if (this.currentGroupId !== id) return
      const row = throwOnError(result, "setCurrentGroup")
      const group = row ? rowToGroup(row) : null
      this.currentGroup = group
      this.currentGroupObs.set(group)
      // The fetched group may carry scope-changing data (e.g. `aggregate`).
      this.scheduleItemsRefresh()
    }).then(undefined, (error) => {
      console.error("[SupabaseConnector] setCurrentGroup group fetch failed", error)
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
    const deleted = throwOnError(await this.client.from("groups").delete().eq("id", id).select(), "deleteGroup")
    if (deleted.length === 0) {
      const still = await this.client.from("groups").select("*").eq("id", id).maybeSingle()
      if (throwOnError(still, "deleteGroup") !== null) {
        throw new Error(`[SupabaseConnector] deleteGroup: not authorized to delete ${id}`)
      }
    }
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
    const deleted = throwOnError(
      await this.client.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId).select(),
      "removeMember",
    )
    if (deleted.length === 0) {
      const still = await this.client.from("group_members").select("*").eq("group_id", groupId).eq("user_id", userId).maybeSingle()
      if (throwOnError(still, "removeMember") !== null) {
        throw new Error(`[SupabaseConnector] removeMember: not authorized to remove ${userId} from ${groupId}`)
      }
    }
    this.scheduleGroupsRefresh()
  }

  // --- Profile (ProfileCapable, WoT-Parität) ---

  // Starts unloaded (async source): consumers can tell "still loading"
  // from "loaded, no profile" (Observable contract, spec 02).
  private profileObs = createObservable<Item | null>(null, false)
  private profileSyncPendingObs = createObservable<boolean>(false)
  /**
   * Session generation — THE transaction guard for the whole session
   * lifecycle (round-2 review): every IDENTITY change bumps it before any
   * await; every async continuation (applySession tail, profile reads,
   * profile writes) re-checks it after each await boundary. A
   * TOKEN_REFRESHED of the same identity is NOT a session change.
   */
  private sessionGeneration = 0
  /** Identity of the current generation (null = signed out). */
  private sessionUserId: string | null = null
  /** Single-flight profile refresh: at most one read per session in
      flight; further requests set the rerun flag and run EXACTLY once
      afterwards — responses can neither overtake nor get lost. */
  private profileFlight: Promise<void> | null = null
  private profileRerunRequested = false
  /**
   * Monotonic revision of profile-derived state WITHIN a session (round-3
   * review): the generation orders identity switches, this orders the
   * writers of the SAME identity. A confirmed local update bumps it; every
   * async continuation captures both and may only commit when both still
   * hold — an older enrichment can never roll back a newer local write.
   */
  private profileRevision = 0

  private captureProfileGuard(): { generation: number; revision: number } {
    return { generation: this.sessionGeneration, revision: this.profileRevision }
  }

  private profileGuardHolds(captured: { generation: number; revision: number }): boolean {
    return captured.generation === this.sessionGeneration && captured.revision === this.profileRevision
  }

  /**
   * THE commit boundary for ALL profile-derived state (round-4 review):
   * session bootstrap, worker/realtime reads and local updates land here —
   * profile item, currentUser projection and auth-state update TOGETHER,
   * guard-checked, then the revision advances. Three surfaces, one owner.
   */
  private commitOwnProfileRow(
    row: Record<string, unknown> | null,
    guard: { generation: number; revision: number },
  ): boolean {
    if (!this.profileGuardHolds(guard)) return false
    const userId = this.sessionUserId
    if (!userId) return false
    this.profileObs.set(row ? this.profileRowToPersonItem(row) : null)
    this.profileObs.markLoaded()
    // Project the profile-OWNED fields (displayName/avatarUrl) into the
    // user; other user fields are preserved.
    const base = this.currentUser?.id === userId ? this.currentUser : { id: userId }
    const next: User = { ...base, id: userId }
    if (row?.display_name) next.displayName = row.display_name as string
    else delete next.displayName
    if (row?.avatar_url) next.avatarUrl = row.avatar_url as string
    else delete next.avatarUrl
    this.currentUser = next
    this.currentUserObs.set(next)
    if (this.authState.current.status === "authenticated") {
      this.authState.set({ status: "authenticated", user: next })
    }
    this.profileRevision += 1
    return true
  }

  /** profiles-Row → person-Item (person/v1), same projection idea as WoT. */
  private profileRowToPersonItem(row: Record<string, unknown>): Item {
    const id = row.id as string
    const data: Record<string, unknown> = {
      displayName: (row.display_name as string | null) ?? id,
      ...(row.bio ? { bio: row.bio } : {}),
      ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    }
    return {
      id,
      "@context": deriveContext("person", data),
      type: "person",
      createdAt: typeof row.created_at === "string" ? new Date(row.created_at).toISOString() : new Date(0).toISOString(),
      createdBy: id,
      data,
    }
  }

  private async fetchProfileRow(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.from("profiles").select("*").eq("id", id).maybeSingle()
    return throwOnError(result, "getProfile")
  }

  /** Request a profile refresh; coalesces into the single flight. */
  private requestProfileRefresh(): Promise<void> {
    if (this.profileFlight) {
      this.profileRerunRequested = true
      return this.profileFlight
    }
    this.profileFlight = this.runProfileRefresh().finally(() => {
      this.profileFlight = null
      if (this.profileRerunRequested) void this.requestProfileRefresh()
    })
    return this.profileFlight
  }

  private async runProfileRefresh(): Promise<void> {
    do {
      this.profileRerunRequested = false
      const generation = this.sessionGeneration
      const userId = this.sessionUserId
      if (!userId) {
        // While auth is still resolving (init in flight), "no user" is
        // UNKNOWN, not final — the session transition triggers the next run.
        if (this.authState.current.status !== "loading") {
          this.profileObs.set(null)
          this.profileObs.markLoaded()
        }
        return
      }
      const guard = this.captureProfileGuard()
      try {
        const row = await this.fetchProfileRow(userId)
        // Session gone → this flight is void entirely.
        if (generation !== this.sessionGeneration) return
        // Commit through THE boundary. A false return means a local write
        // advanced the revision meanwhile: this response is stale — read
        // again instead of applying it.
        if (!this.commitOwnProfileRow(row, guard)) {
          this.profileRerunRequested = true
          continue
        }
      } catch (error) {
        if (generation === this.sessionGeneration) this.profileObs.markLoaded()
        console.error("[SupabaseConnector] profile refresh failed", error)
      }
    } while (this.profileRerunRequested)
  }

  async getMyProfile(): Promise<Item | null> {
    if (!this.profileObs.loaded) await this.requestProfileRefresh()
    return this.profileObs.current
  }

  observeMyProfile(): Observable<Item | null> {
    if (!this.profileObs.loaded) void this.requestProfileRefresh()
    return this.profileObs
  }

  async updateMyProfile(updates: Partial<Record<string, unknown>>): Promise<Item> {
    const user = await this.getCurrentUser()
    if (!user) throw new Error("[SupabaseConnector] updateMyProfile requires an authenticated user")
    const patch: Record<string, unknown> = {
      ...(updates.name !== undefined ? { display_name: (updates.name as string) || null } : {}),
      ...(updates.bio !== undefined ? { bio: (updates.bio as string) || null } : {}),
      ...(updates.avatar !== undefined ? { avatar_url: (updates.avatar as string) || null } : {}),
    }
    // Empty patch: a no-op, never an empty PostgREST body (400).
    if (Object.keys(patch).length === 0) {
      const current = await this.getMyProfile()
      if (current) return current
      throw new Error("[SupabaseConnector] updateMyProfile: no profile row for the current user")
    }
    const generation = this.sessionGeneration
    const result = await this.client.from("profiles").update(patch).eq("id", user.id).select().single()
    const row = throwOnError(result, "updateMyProfile")
    const item = this.profileRowToPersonItem(row)
    // Session changed mid-write: the server-side write stands, but the
    // observables belong to the NEW session — leave them alone.
    if (generation !== this.sessionGeneration || this.sessionUserId !== user.id) return item
    // Confirmed local write = the newest truth of this session: commit
    // through THE boundary with a FRESH revision capture (the commit's own
    // bump then voids every older in-flight read).
    this.commitOwnProfileRow(row, { generation, revision: this.profileRevision })
    return item
  }

  async getPublicProfile(id: string): Promise<PublicProfileData | null> {
    const row = await this.fetchProfileRow(id)
    if (!row) return null
    return {
      id,
      ...(row.display_name ? { name: row.display_name as string } : {}),
      ...(row.bio ? { bio: row.bio as string } : {}),
      ...(row.avatar_url ? { avatar: row.avatar_url as string } : {}),
    }
  }

  /** v1: every profile field is instance-visible — there is no discovery
      split like WoT's public profile server, so this is a documented no-op. */
  async setFieldVisibility(_field: string, _isPublic: boolean): Promise<void> {}

  /** The server IS the source of truth — nothing to publish. */
  async syncProfile(): Promise<void> {}

  isProfileSyncPending(): Observable<boolean> {
    return this.profileSyncPendingObs
  }

  // --- Users / Auth ---

  /** Identity the realtime channels were joined with (rejoin on change). */
  private realtimeAuthUserId: string | null = null

  /**
   * SINGLE authority for session state: currentUser, authState and the
   * profile observable change only here (authenticate/logout merely run the
   * Supabase auth operations and route through this method; the auth-event
   * callback routes here too — same-identity events collapse to a no-op).
   */
  private async applySession(session: AuthSessionLike | null): Promise<void> {
    const nextUserId = session?.user?.id ?? null
    const identityChanged = nextUserId !== this.sessionUserId
    if (!identityChanged) {
      // Same identity (e.g. TOKEN_REFRESHED) — not a session change. Only
      // the very first resolution (init) still has to settle the state.
      if (this.authState.current.status !== "loading") return
    }

    // --- synchronous transition: bump generation, flip identity, clear the
    // previous session's views. No awaits follow — enrichment is the profile
    // worker's job (commit boundary), not a parallel tail here.
    this.sessionGeneration += 1
    this.sessionUserId = nextUserId
    if (this.channels.length > 0 && nextUserId !== this.realtimeAuthUserId) {
      this.realtimeAuthUserId = nextUserId
      this.setupRealtimeChannels()
    } else {
      this.realtimeAuthUserId = nextUserId
    }

    if (nextUserId === null) {
      this.currentUser = null
      this.currentUserObs.set(null)
      this.profileObs.set(null)
      // No session is a SETTLED profile state: loaded, genuinely empty.
      this.profileObs.markLoaded()
      this.authState.set({ status: "unauthenticated" })
      return
    }

    // Identity switch A→B: A's profile must never stay visible while B's
    // data is still loading.
    if (identityChanged && this.profileObs.current !== null) this.profileObs.set(null)
    // Minimal user IMMEDIATELY (the id IS the identity). Enrichment happens
    // EXCLUSIVELY through the profile worker's commit boundary — no parallel
    // resolveUser tail that could compete with it (round-4 review).
    this.currentUser = { id: nextUserId }
    this.currentUserObs.set(this.currentUser)
    this.authState.set({ status: "authenticated", user: this.currentUser })
    this.requestProfileRefresh()
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
    let result: SupabaseResult<{ user: { id: string } | null; session: AuthSessionLike | null }>
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
    const data = throwOnError(result, `authenticate(${method})`)
    const authUser = data.user
    if (!authUser) throw new Error(`[SupabaseConnector] authenticate(${method}): no user returned`)
    // No session = no server-side auth.uid() — the account exists but is NOT
    // logged in (e-mail confirmations on). Publishing "authenticated" here
    // would break every RLS-bound write.
    if (!data.session) {
      throw new Error("[SupabaseConnector] Registrierung angelegt, aber E-Mail-Bestätigung steht aus — noch keine aktive Sitzung")
    }
    // Route through the single session authority. The auth-event callback
    // fires applySession for the same identity too — that collapses to a
    // no-op, so this stays deterministic regardless of event timing.
    await this.applySession(data.session)
    // Return contract: the ENRICHED user (display name from the profile).
    // Read-only — state ownership stays with applySession's own tail.
    return this.resolveUser(authUser.id)
  }

  async logout(): Promise<void> {
    const { error } = await this.client.auth.signOut()
    if (error) throw new Error(`[SupabaseConnector] logout: ${error.message}`)
    // Single authority: the sign-out event routes here as well and
    // collapses to a no-op for the already-cleared identity.
    await this.applySession(null)
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
