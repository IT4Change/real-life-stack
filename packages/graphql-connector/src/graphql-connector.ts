import { GraphQLClient } from "graphql-request"
import { createClient, type Client as WsClient } from "graphql-ws"
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
  RelatedItemsOptions,
  Source,
} from "@real-life-stack/data-interface"
import { createObservable } from "@real-life-stack/data-interface"
import {
  ITEMS_QUERY,
  ITEM_QUERY,
  GROUPS_QUERY,
  MEMBERS_QUERY,
  RELATED_ITEMS_QUERY,
  CURRENT_USER_QUERY,
  USER_QUERY,
  CURRENT_GROUP_QUERY,
  AUTH_STATE_QUERY,
  AUTH_METHODS_QUERY,
  SOURCES_QUERY,
  ACTIVE_SOURCE_QUERY,
  CREATE_ITEM_MUTATION,
  UPDATE_ITEM_MUTATION,
  DELETE_ITEM_MUTATION,
  CREATE_GROUP_MUTATION,
  UPDATE_GROUP_MUTATION,
  DELETE_GROUP_MUTATION,
  INVITE_MEMBER_MUTATION,
  REMOVE_MEMBER_MUTATION,
  SET_CURRENT_GROUP_MUTATION,
  AUTHENTICATE_MUTATION,
  LOGOUT_MUTATION,
  ITEMS_CHANGED_SUBSCRIPTION,
  ITEM_CHANGED_SUBSCRIPTION,
  AUTH_STATE_CHANGED_SUBSCRIPTION,
} from "./queries.js"

function parseItem(raw: Record<string, unknown>): Item {
  // GraphQL cannot name a field "@context" — the wire field is `context`.
  // Nullable wire fields normalise to absent, matching the Item type.
  const { context, tags, relations, updatedAt, updatedBy, ...rest } = raw
  const normalizedRelations = Array.isArray(relations)
    ? relations.map(({ meta, ...relation }: { meta?: unknown }) => ({
        ...relation,
        ...(meta != null ? { meta } : {}),
      }))
    : relations
  return {
    ...rest,
    ...(context != null ? { "@context": context } : {}),
    ...(tags != null ? { tags } : {}),
    ...(normalizedRelations != null ? { relations: normalizedRelations } : {}),
    // A never-edited item has no stamp. GraphQL sends `null`, the Item
    // contract says ABSENT — normalising here keeps every consumer from
    // having to handle both (the same boundary that swallowed @context).
    ...(updatedAt != null ? { updatedAt } : {}),
    ...(updatedBy != null ? { updatedBy } : {}),
  } as unknown as Item
}

export class GraphQLConnector implements FullConnector {
  private client: GraphQLClient
  private wsClient: WsClient | null = null
  private wsUrl: string
  private currentGroup: Group | null = null
  private authStateObservable = createObservable<AuthState>({ status: "loading" })
  private currentUserObs = createObservable<User | null>(null)
  private groupsObs = createObservable<Group[]>([])
  private currentGroupObs = createObservable<Group | null>(null)
  private cleanupFns: (() => void)[] = []

  constructor(url = "http://localhost:4000/graphql", options?: { fetch?: typeof fetch }) {
    // Injectable fetch so contract tests can run the REAL connector against
    // an in-process server (fastify inject) without sockets.
    this.client = new GraphQLClient(url, options?.fetch ? { fetch: options.fetch } : undefined)
    // Derive WebSocket URL from HTTP URL
    this.wsUrl = url.replace(/^http/, "ws")
  }

  async init(): Promise<void> {
    // Create WebSocket client for subscriptions (Mercurius uses graphql-ws protocol)
    this.wsClient = createClient({ url: this.wsUrl })

    // Fetch initial auth state
    const { authState } = await this.client.request<{ authState: AuthState }>(AUTH_STATE_QUERY)
    this.authStateObservable.set(authState)

    // Fetch initial current group
    const { currentGroup } = await this.client.request<{ currentGroup: Group | null }>(CURRENT_GROUP_QUERY)
    this.currentGroup = currentGroup

    // Subscribe to auth state changes via WebSocket
    this.subscribeWs<{ authStateChanged: AuthState }>(
      AUTH_STATE_CHANGED_SUBSCRIPTION,
      {},
      (data) => {
        const state = data.authStateChanged
        this.authStateObservable.set(state)
        this.currentUserObs.set(state.status === "authenticated" ? state.user : null)
      },
    )

    // Fetch initial current user
    this.getCurrentUser().then((user) => this.currentUserObs.set(user))
  }

  async dispose(): Promise<void> {
    for (const cleanup of this.cleanupFns) cleanup()
    this.cleanupFns = []
    this.authStateObservable.destroy()
    this.groupsObs.destroy()
    this.currentGroupObs.destroy()
    for (const obs of this.memberObservables.values()) obs.destroy()
    this.memberObservables.clear()
    for (const obs of this.relatedObservables.values()) obs.destroy()
    this.relatedObservables.clear()
    await this.wsClient?.dispose()
    this.wsClient = null
  }

  // --- Groups ---

  async getGroups(): Promise<Group[]> {
    const { groups } = await this.client.request<{ groups: Group[] }>(GROUPS_QUERY)
    this.groupsObs.set(groups)
    return groups
  }

  observeGroups(): Observable<Group[]> {
    // Initial fetch
    this.getGroups().catch(() => {})
    return this.groupsObs
  }

  getCurrentGroup(): Group | null {
    return this.currentGroup
  }

  observeCurrentGroup(): Observable<Group | null> {
    return this.currentGroupObs
  }

  setCurrentGroup(id: string): void {
    this.client.request(SET_CURRENT_GROUP_MUTATION, { id }).then((res) => {
      const { setCurrentGroup } = res as { setCurrentGroup: Group | null }
      this.currentGroup = setCurrentGroup
      this.currentGroupObs.set(setCurrentGroup)
    })
  }

  async createGroup(name: string, data?: Record<string, unknown>): Promise<Group> {
    const { createGroup } = await this.client.request<{ createGroup: Group }>(CREATE_GROUP_MUTATION, { name, data })
    void this.getGroups()
    return createGroup
  }

  async updateGroup(id: string, updates: Partial<Group>): Promise<Group> {
    const { updateGroup } = await this.client.request<{ updateGroup: Group }>(UPDATE_GROUP_MUTATION, {
      id,
      input: { name: updates.name, data: updates.data },
    })
    void this.getGroups()
    return updateGroup
  }

  async deleteGroup(id: string): Promise<void> {
    await this.client.request(DELETE_GROUP_MUTATION, { id })
    void this.getGroups()
  }

  async getMembers(groupId: string | null): Promise<User[]> {
    const { members } = await this.client.request<{ members: User[] }>(MEMBERS_QUERY, { groupId })
    return members
  }

  private memberObservables = new Map<string | null, ReturnType<typeof createObservable<User[]>>>()

  observeMembers(groupId: string | null): Observable<User[]> {
    if (!this.memberObservables.has(groupId)) {
      // Starts unloaded; markLoaded() once the first members fetch settles so
      // consumers can tell "still loading members" from "loaded, no members".
      const obs = createObservable<User[]>([], false)
      this.memberObservables.set(groupId, obs)
      void this.getMembers(groupId)
        .then((members) => obs.set(members))
        .catch((err) => console.error("[GraphQLConnector] observeMembers initial load failed", err))
        .finally(() => obs.markLoaded())
    }
    return this.memberObservables.get(groupId)!
  }

  private async notifyMemberObservers(groupId: string | null): Promise<void> {
    const obs = this.memberObservables.get(groupId)
    if (obs) {
      const members = await this.getMembers(groupId)
      obs.set(members)
    }
  }

  async inviteMember(groupId: string, userId: string): Promise<void> {
    await this.client.request(INVITE_MEMBER_MUTATION, { groupId, userId })
    void this.notifyMemberObservers(groupId)
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await this.client.request(REMOVE_MEMBER_MUTATION, { groupId, userId })
    void this.notifyMemberObservers(groupId)
  }

  // --- Items ---

  async getItems(filter?: ItemFilter): Promise<Item[]> {
    const gqlFilter = filter ? { type: filter.type, hasField: filter.hasField, hasSchema: filter.hasSchema, hasTag: filter.hasTag, bbox: filter.bbox, createdBy: filter.createdBy, limit: filter.limit, offset: filter.offset } : undefined
    const { items } = await this.client.request<{ items: Record<string, unknown>[] }>(ITEMS_QUERY, { filter: gqlFilter })
    return items.map(parseItem)
  }

  async getItem(id: string): Promise<Item | null> {
    const { item } = await this.client.request<{ item: Record<string, unknown> | null }>(ITEM_QUERY, { id })
    return item ? parseItem(item) : null
  }

  observe(filter: ItemFilter): Observable<Item[]> {
    // Starts unloaded; markLoaded() once the first fetch settles so consumers can
    // tell "still loading" from "loaded, empty".
    const observable = createObservable<Item[]>([], false)

    // Initial fetch
    this.getItems(filter)
      .then((items) => observable.set(items))
      .catch((err) => console.error("[GraphQLConnector] observe initial load failed", err))
      .finally(() => observable.markLoaded())

    // SSE subscription for live updates
    const gqlFilter = filter ? { type: filter.type, hasField: filter.hasField, hasSchema: filter.hasSchema, hasTag: filter.hasTag, bbox: filter.bbox, createdBy: filter.createdBy, limit: filter.limit, offset: filter.offset } : undefined
    this.subscribeWs<{ itemsChanged: Record<string, unknown>[] }>(
      ITEMS_CHANGED_SUBSCRIPTION,
      { filter: gqlFilter },
      (data) => observable.set(data.itemsChanged.map(parseItem)),
    )

    return observable
  }

  observeItem(id: string): Observable<Item | null> {
    // Starts unloaded; markLoaded() once the first fetch settles so consumers can
    // tell "still loading" from "loaded, not found" (null).
    const observable = createObservable<Item | null>(null, false)

    // Initial fetch
    this.getItem(id)
      .then((item) => observable.set(item))
      .catch((err) => console.error("[GraphQLConnector] observeItem initial load failed", err))
      .finally(() => observable.markLoaded())

    // SSE subscription for live updates
    this.subscribeWs<{ itemChanged: Record<string, unknown> | null }>(
      ITEM_CHANGED_SUBSCRIPTION,
      { id },
      (data) => observable.set(data.itemChanged ? parseItem(data.itemChanged) : null),
    )

    return observable
  }

  async createItem(item: CreateItemInput): Promise<Item> {
    const { createItem } = await this.client.request<{ createItem: Record<string, unknown> }>(CREATE_ITEM_MUTATION, {
      input: { id: item.id, type: item.type, createdBy: item.createdBy, context: item["@context"], tags: item.tags, data: item.data, relations: item.relations },
    })
    return parseItem(createItem)
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    const { updateItem } = await this.client.request<{ updateItem: Record<string, unknown> }>(UPDATE_ITEM_MUTATION, {
      id,
      input: { context: updates["@context"], tags: updates.tags, data: updates.data, relations: updates.relations },
    })
    return parseItem(updateItem)
  }

  async deleteItem(id: string): Promise<void> {
    await this.client.request(DELETE_ITEM_MUTATION, { id })
  }

  // --- Relations ---

  async getRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions,
  ): Promise<Item[]> {
    const { relatedItems } = await this.client.request<{ relatedItems: Record<string, unknown>[] }>(
      RELATED_ITEMS_QUERY,
      { itemId, predicate, limit: options?.limit, offset: options?.offset, direction: options?.direction },
    )
    return relatedItems.map(parseItem)
  }

  private relatedObservables = new Map<string, ReturnType<typeof createObservable<Item[]>>>()

  observeRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Observable<Item[]> {
    const key = `${itemId}:${predicate ?? ""}:${JSON.stringify(options ?? {})}`
    if (!this.relatedObservables.has(key)) {
      const obs = createObservable<Item[]>([])
      this.relatedObservables.set(key, obs)
      void this.getRelatedItems(itemId, predicate, options).then((items) => obs.set(items))
    }
    return this.relatedObservables.get(key)!
  }

  // --- Users ---

  async getCurrentUser(): Promise<User | null> {
    const { currentUser } = await this.client.request<{ currentUser: User | null }>(CURRENT_USER_QUERY)
    return currentUser
  }

  observeCurrentUser(): Observable<User | null> {
    return this.currentUserObs
  }

  async getUser(id: string): Promise<User | null> {
    const { user } = await this.client.request<{ user: User | null }>(USER_QUERY, { id })
    return user
  }

  // --- Auth ---

  getAuthState(): Observable<AuthState> {
    return this.authStateObservable
  }

  getAuthMethods(): AuthMethod[] {
    // Synchronous — return cached or default; async fetch happens in init()
    return [{ method: "mock", label: "Mock Login" }]
  }

  async authenticate(method: string, credentials: unknown): Promise<User> {
    const { authenticate } = await this.client.request<{ authenticate: User }>(AUTHENTICATE_MUTATION, {
      method,
      credentials,
    })
    return authenticate
  }

  async logout(): Promise<void> {
    await this.client.request(LOGOUT_MUTATION)
  }

  // --- Sources ---

  getSources(): Source[] {
    return [{ id: "graphql", name: "GraphQL Server", connector: this }]
  }

  getActiveSource(): Source {
    return { id: "graphql", name: "GraphQL Server", connector: this }
  }

  setActiveSource(_sourceId: string): void {
    // Single source
  }

  // --- WebSocket Subscription Helper ---

  private subscribeWs<T>(query: string, variables: Record<string, unknown>, onData: (data: T) => void): void {
    if (!this.wsClient) return

    const cleanup = this.wsClient.subscribe<T>(
      { query, variables },
      {
        next: (result) => {
          if (result.data) onData(result.data)
        },
        error: (err) => {
          console.error("WebSocket subscription error:", err)
        },
        complete: () => {},
      },
    )

    this.cleanupFns.push(cleanup)
  }
}
