import { describe, expect, it, vi } from "vitest"
import {
  canonicalizeRelationEndpoints,
  createDefaultRelationStore,
  createObservable,
  deriveRelationRecordId,
  matchesFilter,
  relationRecordFromItem,
  VOCAB_BASE,
  VOCAB_RELATION,
} from "../src/index.js"
import type {
  AuthMethod,
  AuthState,
  CreateItemInput,
  Item,
  ItemFilter,
  Observable,
  User,
} from "../src/index.js"

const ALICE: User = { id: "did:key:alice", displayName: "Alice" }
const BOB: User = { id: "did:key:bob", displayName: "Bob" }

function projectObservable<T, U>(source: Observable<T>, project: (value: T) => U): Observable<U> {
  return {
    get current() {
      return project(source.current)
    },
    get loaded() {
      return source.loaded
    },
    subscribe(callback) {
      return source.subscribe((value) => callback(project(value)))
    },
  }
}

class TestConnector {
  private readonly itemsSource
  private readonly userSource
  private sequence = 0

  constructor(items: Item[] = [], user: User | null = ALICE, loaded = true) {
    this.itemsSource = createObservable(items, loaded)
    this.userSource = createObservable<User | null>(user)
  }

  async init(): Promise<void> {}
  async dispose(): Promise<void> {}

  async getItems(filter: ItemFilter = {}): Promise<Item[]> {
    return this.itemsSource.current.filter((item) => matchesFilter(item, filter))
  }

  async getItem(id: string): Promise<Item | null> {
    return this.itemsSource.current.find((item) => item.id === id) ?? null
  }

  observe(filter: ItemFilter): Observable<Item[]> {
    return projectObservable(this.itemsSource, (items) => (
      items.filter((item) => matchesFilter(item, filter))
    ))
  }

  observeItem(id: string): Observable<Item | null> {
    return projectObservable(
      this.itemsSource,
      (items) => items.find((item) => item.id === id) ?? null,
    )
  }

  async createItem(input: CreateItemInput): Promise<Item> {
    const id = input.id ?? `generated-${++this.sequence}`
    const existing = await this.getItem(id)
    if (existing) return existing
    const { id: _requestedId, ...rest } = input
    const item: Item = {
      ...rest,
      id,
      createdAt: "2026-07-15T10:00:00.000Z",
    }
    this.itemsSource.set([...this.itemsSource.current, item])
    return item
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    const existing = await this.getItem(id)
    if (!existing) throw new Error(`Item not found: ${id}`)
    const updated = { ...existing, ...updates, id, createdAt: existing.createdAt }
    this.itemsSource.set(this.itemsSource.current.map((item) => item.id === id ? updated : item))
    return updated
  }

  async deleteItem(id: string): Promise<void> {
    this.itemsSource.set(this.itemsSource.current.filter((item) => item.id !== id))
  }

  async getCurrentUser(): Promise<User | null> {
    return this.userSource.current
  }

  observeCurrentUser(): Observable<User | null> {
    return this.userSource
  }

  async getUser(id: string): Promise<User | null> {
    return this.userSource.current?.id === id ? this.userSource.current : null
  }

  getAuthState(): Observable<AuthState> {
    return projectObservable(this.userSource, (user): AuthState => (
      user ? { status: "authenticated", user } : { status: "unauthenticated" }
    ))
  }

  getAuthMethods(): AuthMethod[] {
    return []
  }

  async authenticate(): Promise<User> {
    throw new Error("Not implemented")
  }

  async logout(): Promise<void> {
    this.userSource.set(null)
  }

  setUser(user: User | null): void {
    this.userSource.set(user)
  }

  addItem(item: Item): void {
    this.itemsSource.set([...this.itemsSource.current, item])
  }

  markLoaded(): void {
    this.itemsSource.markLoaded()
  }
}

function domainItem(id: string): Item {
  return {
    id,
    type: "person",
    createdBy: ALICE.id,
    createdAt: "2026-07-15T09:00:00.000Z",
    data: { displayName: id },
  }
}

function relationItem(
  id: string,
  from: string,
  to: string,
  predicate = "knows",
  relations?: Item["relations"],
): Item {
  return {
    id,
    type: "relation",
    createdBy: ALICE.id,
    createdAt: "2026-07-15T10:00:00.000Z",
    data: { predicate },
    relations: relations ?? [
      { predicate: "from", target: from },
      { predicate: "to", target: to },
    ],
  }
}

describe("relation record identity", () => {
  it("uses the fixed JCS string-array vector with lowercase SHA-256", async () => {
    await expect(deriveRelationRecordId(
      "did:key:z6MkTest",
      "knows",
      "item:person-anton",
      "item:person-kaliya",
    )).resolves.toBe(
      "rel-4494eed1761255500765ac88ded8f81f052039327ba8c353fa0c1a270d140e08",
    )
  })

  it("canonicalizes only configured symmetric predicates", async () => {
    const options = { symmetricPredicates: ["knows"] }
    expect(canonicalizeRelationEndpoints("knows", "item:z", "item:a", options)).toEqual({
      from: "item:a",
      to: "item:z",
    })
    expect(canonicalizeRelationEndpoints("follows", "item:z", "item:a", options)).toEqual({
      from: "item:z",
      to: "item:a",
    })
    await expect(deriveRelationRecordId(ALICE.id, "knows", "item:z", "item:a", options))
      .resolves.toBe(await deriveRelationRecordId(ALICE.id, "knows", "item:a", "item:z", options))
  })

  it("does not normalize Unicode and cannot collide through newline concatenation", async () => {
    await expect(deriveRelationRecordId("café", "knows", "item:a", "item:b"))
      .resolves.toBe("rel-687c0a9d5016a5cd21bc95a5a0bdff2e55e143c69750be36ec69f87223a428c4")
    await expect(deriveRelationRecordId("café", "knows", "item:a", "item:b"))
      .resolves.toBe("rel-d633de54543f1778789fb60822b954e15737c9fada8a957181ba4678f63db703")
    expect(await deriveRelationRecordId("a", "b\nc", "d", "e"))
      .not.toBe(await deriveRelationRecordId("a\nb", "c", "d", "e"))
  })
})

describe("relation item projection", () => {
  it("projects valid items and strips reserved data fields from fields", () => {
    const item = relationItem("rel-valid", "item:a", "item:b")
    item.data = { predicate: "knows", confirmationRef: "conf-1", level: "met" }
    expect(relationRecordFromItem(item)).toMatchObject({
      id: "rel-valid",
      predicate: "knows",
      from: "item:a",
      to: "item:b",
      fields: { level: "met" },
      confirmationRef: "conf-1",
    })
  })

  it.each([
    ["missing endpoint", [{ predicate: "from", target: "item:a" }]],
    ["duplicate from", [
      { predicate: "from", target: "item:a" },
      { predicate: "from", target: "item:c" },
      { predicate: "to", target: "item:b" },
    ]],
    ["invalid endpoint", [
      { predicate: "from", target: "person-a" },
      { predicate: "to", target: "item:b" },
    ]],
  ])("ignores malformed items with %s", (_label, relations) => {
    expect(relationRecordFromItem(relationItem(
      "rel-malformed",
      "item:a",
      "item:b",
      "knows",
      relations,
    ))).toBeNull()
  })
})

describe("default relation store", () => {
  it("creates canonical, idempotent records using the authenticated author", async () => {
    const connector = new TestConnector()
    const store = createDefaultRelationStore(connector, { symmetricPredicates: ["knows"] })
    const created = await store.createRelationRecord({
      predicate: "knows",
      from: "item:z",
      to: "item:a",
      fields: { level: "met" },
    })

    expect(created).toMatchObject({
      from: "item:a",
      to: "item:z",
      createdBy: ALICE.id,
      fields: { level: "met" },
    })
    const stored = await connector.getItem(created.id)
    expect(stored?.["@context"]).toEqual([VOCAB_BASE, VOCAB_RELATION])

    const repeated = await store.createRelationRecord({
      predicate: "knows",
      from: "item:a",
      to: "item:z",
      fields: { level: "verified" },
    })
    expect(repeated).toEqual(created)
    expect((await connector.getItems({ type: "relation" }))).toHaveLength(1)
  })

  it("fully replaces fields, removes confirmationRef with null, and validates updates", async () => {
    const connector = new TestConnector()
    const store = createDefaultRelationStore(connector)
    await expect(store.createRelationRecord({
      predicate: "follows",
      from: "item:a",
      to: "item:b",
      fields: { confirmationRef: "conf-hidden" },
    })).rejects.toThrow("reserved")
    const created = await store.createRelationRecord({
      predicate: "follows",
      from: "item:a",
      to: "item:b",
      fields: { old: true, nested: { old: true } },
      confirmationRef: "conf-1",
    })

    const replaced = await store.updateRelationRecord(created.id, {
      fields: { nested: { next: true } },
    })
    expect(replaced.fields).toEqual({ nested: { next: true } })
    expect(replaced.confirmationRef).toBe("conf-1")

    const removed = await store.updateRelationRecord(created.id, { confirmationRef: null })
    expect(removed.confirmationRef).toBeUndefined()
    expect((await connector.getItem(created.id))?.data).not.toHaveProperty("confirmationRef")

    await expect(store.updateRelationRecord(created.id, {
      fields: { predicate: "knows" },
    })).rejects.toThrow("reserved")
    await expect(store.updateRelationRecord(created.id, {
      confirmationRef: 42,
    } as never)).rejects.toThrow("string or null")
    await expect(store.updateRelationRecord(created.id, {
      predicate: "knows",
    } as never)).rejects.toThrow("not mutable")
  })

  it("requires authentication and defaults mutation authorization to creator-owns", async () => {
    const connector = new TestConnector()
    const store = createDefaultRelationStore(connector)
    const created = await store.createRelationRecord({
      predicate: "follows",
      from: "item:a",
      to: "item:b",
    })

    connector.setUser(BOB)
    await expect(store.updateRelationRecord(created.id, { fields: { denied: true } }))
      .rejects.toThrow("Not authorized")
    await expect(store.deleteRelationRecord(created.id)).rejects.toThrow("Not authorized")

    connector.setUser(null)
    await expect(store.createRelationRecord({
      predicate: "follows",
      from: "item:b",
      to: "item:c",
    })).rejects.toThrow("authenticated user")

    connector.setUser(ALICE)
    await store.deleteRelationRecord(created.id)
    expect(await connector.getItem(created.id)).toBeNull()
  })

  it("allows an authorized author to delete a malformed relation item", async () => {
    const malformed = relationItem("rel-malformed", "item:a", "item:b", "knows", [
      { predicate: "from", target: "item:a" },
      { predicate: "from", target: "item:c" },
      { predicate: "to", target: "item:b" },
    ])
    const connector = new TestConnector([malformed])
    const store = createDefaultRelationStore(connector)

    await store.deleteRelationRecord(malformed.id)

    expect(await connector.getItem(malformed.id)).toBeNull()
  })

  it("filters by either endpoint and ignores malformed records", async () => {
    const valid = relationItem("rel-a-b", "item:a", "item:b")
    const malformed = relationItem("rel-bad", "item:a", "item:c", "knows", [
      { predicate: "from", target: "item:a" },
      { predicate: "from", target: "item:b" },
      { predicate: "to", target: "item:c" },
    ])
    const store = createDefaultRelationStore(new TestConnector([valid, malformed]))
    await expect(store.getRelationRecords({ endpoint: "item:b" })).resolves.toEqual([
      expect.objectContaining({ id: "rel-a-b" }),
    ])
    await expect(store.getRelationRecords({ endpoint: "item:c" })).resolves.toEqual([])
  })

  it("projects deduplicated local neighbors and skips dangling or cross-space targets", async () => {
    const items = [
      domainItem("a"),
      domainItem("b"),
      domainItem("c"),
      relationItem("rel-a-b-1", "item:a", "item:b"),
      relationItem("rel-a-b-2", "item:b", "item:a"),
      relationItem("rel-a-c", "item:a", "item:c", "attends"),
      relationItem("rel-dangling", "item:a", "item:missing"),
      relationItem("rel-global", "item:a", "global:did:key:bob"),
      relationItem("rel-cross", "item:a", "space:garden/item:b"),
    ]
    const store = createDefaultRelationStore(new TestConnector(items))

    await expect(store.getRelationNeighbors("item:a", "knows"))
      .resolves.toEqual([expect.objectContaining({ id: "b" })])
    await expect(store.getRelationNeighbors("item:a"))
      .resolves.toEqual([
        expect.objectContaining({ id: "b" }),
        expect.objectContaining({ id: "c" }),
      ])
  })

  it("keeps observable mapping lazy, propagates loaded, and cleans up subscriptions", () => {
    const connector = new TestConnector([], ALICE, false)
    const observed = createDefaultRelationStore(connector).observeRelationRecords()
    const callback = vi.fn()

    expect(observed.loaded).toBe(false)
    const unsubscribe = observed.subscribe(callback)
    connector.markLoaded()
    expect(observed.loaded).toBe(true)
    expect(callback).toHaveBeenCalledWith([])

    unsubscribe()
    connector.addItem(relationItem("rel-after-unsubscribe", "item:a", "item:b"))
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
