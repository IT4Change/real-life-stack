import { deriveContext } from "./vocab.js"
import type {
  Ability,
  Authenticatable,
  AuthorizationCapable,
  CreateItemInput,
  DataInterface,
  Item,
  ItemWriter,
  Observable,
  RelationRecord,
  RelationRecordCapable,
  RelationRecordFilter,
  RelationRecordInput,
  RelationRecordUpdate,
  RelationRecordWriterCapable,
  User,
} from "./index.js"

export interface DefaultRelationStoreOptions {
  symmetricPredicates?: Iterable<string>
}

export interface RelationPredicateDefinition {
  predicate: string
  symmetric: boolean
}

export function relationStoreOptionsFrom(
  definitions: Iterable<RelationPredicateDefinition>,
): DefaultRelationStoreOptions {
  const symmetricPredicates: string[] = []
  for (const definition of definitions) {
    if (definition.symmetric) symmetricPredicates.push(definition.predicate)
  }
  return { symmetricPredicates }
}

type RelationStoreConnector = DataInterface & ItemWriter & Authenticatable
type DefaultRelationStore = RelationRecordCapable & RelationRecordWriterCapable

/**
 * The minimal surface the record-CREATE contract needs. Connectors that must
 * create a record in a specific scope (e.g. the owner space of the item a
 * vote targets, resolved per input) pass a scoped facade of exactly these
 * three methods to {@link createRelationRecordWith}.
 */
export interface RelationRecordCreateConnector {
  getItem(id: string): Promise<Item | null>
  createItem(input: CreateItemInput): Promise<Item>
  getCurrentUser(): Promise<User | null>
}

const RESERVED_FIELD_KEYS = new Set(["predicate", "confirmationRef"])

function normalizedOptions(options?: DefaultRelationStoreOptions): DefaultRelationStoreOptions {
  return { symmetricPredicates: new Set(options?.symmetricPredicates ?? []) }
}

function isSymmetricPredicate(predicate: string, options?: DefaultRelationStoreOptions): boolean {
  for (const candidate of options?.symmetricPredicates ?? []) {
    if (candidate === predicate) return true
  }
  return false
}

export function canonicalizeRelationEndpoints(
  predicate: string,
  from: string,
  to: string,
  options?: DefaultRelationStoreOptions,
): { from: string; to: string } {
  if (!isSymmetricPredicate(predicate, options) || from <= to) return { from, to }
  return { from: to, to: from }
}

export async function deriveRelationRecordId(
  createdBy: string,
  predicate: string,
  from: string,
  to: string,
  options?: DefaultRelationStoreOptions,
): Promise<string> {
  const canonical = canonicalizeRelationEndpoints(predicate, from, to, options)
  const bytes = new TextEncoder().encode(
    JSON.stringify([createdBy, predicate, canonical.from, canonical.to]),
  )
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `rel-${hex}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isRelationTarget(target: unknown): target is string {
  if (typeof target !== "string") return false
  if (target.startsWith("item:")) return target.length > "item:".length
  if (target.startsWith("global:")) return target.length > "global:".length
  return /^space:.+\/item:.+$/.test(target)
}

function matchingEndpointRelations(
  relations: unknown,
  predicate: "from" | "to",
): Array<Record<string, unknown>> {
  if (!Array.isArray(relations)) return []
  return relations.filter((relation): relation is Record<string, unknown> => (
    isRecord(relation) &&
    relation.predicate === predicate
  ))
}

export function relationRecordFromItem(item: Item): RelationRecord | null {
  if (item.type !== "relation" || !isRecord(item.data)) return null
  const predicate = item.data.predicate
  if (typeof predicate !== "string" || predicate.length === 0) return null

  const fromRelations = matchingEndpointRelations(item.relations, "from")
  const toRelations = matchingEndpointRelations(item.relations, "to")
  if (fromRelations.length !== 1 || toRelations.length !== 1) return null
  if (!isRelationTarget(fromRelations[0].target) || !isRelationTarget(toRelations[0].target)) {
    return null
  }

  const confirmationRef = item.data.confirmationRef
  if (confirmationRef !== undefined && typeof confirmationRef !== "string") return null

  const fields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(item.data)) {
    if (!RESERVED_FIELD_KEYS.has(key)) fields[key] = value
  }

  return {
    id: item.id,
    predicate,
    from: fromRelations[0].target,
    to: toRelations[0].target,
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    ...(confirmationRef !== undefined ? { confirmationRef } : {}),
    createdBy: item.createdBy,
    createdAt: item.createdAt,
  }
}

function matchesRelationFilter(record: RelationRecord, filter?: RelationRecordFilter): boolean {
  if (!filter) return true
  if (filter.predicate !== undefined && record.predicate !== filter.predicate) return false
  if (filter.from !== undefined && record.from !== filter.from) return false
  if (filter.to !== undefined && record.to !== filter.to) return false
  if (filter.endpoint !== undefined && record.from !== filter.endpoint && record.to !== filter.endpoint) return false
  return true
}

function recordsFromItems(items: Item[], filter?: RelationRecordFilter): RelationRecord[] {
  const records: RelationRecord[] = []
  for (const item of items) {
    const record = relationRecordFromItem(item)
    if (record && matchesRelationFilter(record, filter)) records.push(record)
  }
  return records
}

function mapObservable<T, U>(source: Observable<T>, map: (value: T) => U): Observable<U> {
  return {
    get current() {
      return map(source.current)
    },
    get loaded() {
      return source.loaded
    },
    subscribe(callback) {
      return source.subscribe((value) => callback(map(value)))
    },
  }
}

function combinedLoaded(left: Observable<unknown>, right: Observable<unknown>): boolean {
  return left.loaded !== false && right.loaded !== false
}

function sameItems(left: Item[], right: Item[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function combineItemObservables(
  left: Observable<Item[]>,
  right: Observable<Item[]>,
  map: (leftItems: Item[], rightItems: Item[]) => Item[],
): Observable<Item[]> {
  return {
    get current() {
      return map(left.current, right.current)
    },
    get loaded() {
      return combinedLoaded(left, right)
    },
    subscribe(callback) {
      let previous = map(left.current, right.current)
      let wasLoaded = combinedLoaded(left, right)
      const emit = () => {
        const next = map(left.current, right.current)
        const isLoaded = combinedLoaded(left, right)
        if (!sameItems(previous, next) || wasLoaded !== isLoaded) {
          previous = next
          wasLoaded = isLoaded
          callback(next)
        }
      }
      const unsubscribeLeft = left.subscribe(emit)
      const unsubscribeRight = right.subscribe(emit)
      return () => {
        unsubscribeLeft()
        unsubscribeRight()
      }
    },
  }
}

function localTargetId(target: string): string | null {
  return target.startsWith("item:") && target.length > "item:".length
    ? target.slice("item:".length)
    : null
}

function relationNeighbors(
  relationItems: Item[],
  allItems: Item[],
  endpoint: string,
  predicate?: string,
): Item[] {
  const records = recordsFromItems(relationItems, { endpoint, predicate })
  const itemsById = new Map(allItems.map((item) => [item.id, item]))
  const neighbors: Item[] = []
  const seen = new Set<string>()

  for (const record of records) {
    const targets: string[] = []
    if (record.from === endpoint) targets.push(record.to)
    if (record.to === endpoint) targets.push(record.from)

    for (const target of targets) {
      const id = localTargetId(target)
      const item = id ? itemsById.get(id) : undefined
      if (item && !seen.has(item.id)) {
        seen.add(item.id)
        neighbors.push(item)
      }
    }
  }

  return neighbors
}

function assertFields(fields: Record<string, unknown> | undefined): void {
  if (fields === undefined) return
  if (!isRecord(fields)) throw new Error("Relation fields must be an object")
  for (const key of Object.keys(fields)) {
    if (RESERVED_FIELD_KEYS.has(key)) {
      throw new Error(`Relation field is reserved: ${key}`)
    }
  }
}

function assertInput(input: RelationRecordInput): void {
  if (typeof input.predicate !== "string" || input.predicate.length === 0) {
    throw new Error("Relation predicate must be a non-empty string")
  }
  if (!isRelationTarget(input.from) || !isRelationTarget(input.to)) {
    throw new Error("Relation endpoints must use an RLS target prefix")
  }
  if (input.confirmationRef !== undefined && typeof input.confirmationRef !== "string") {
    throw new Error("Relation confirmationRef must be a string")
  }
  assertFields(input.fields)
}

function assertSameIdentity(
  item: Item,
  expected: Pick<RelationRecord, "id" | "predicate" | "from" | "to" | "createdBy">,
): RelationRecord {
  const record = relationRecordFromItem(item)
  if (
    !record ||
    record.id !== expected.id ||
    record.predicate !== expected.predicate ||
    record.from !== expected.from ||
    record.to !== expected.to ||
    record.createdBy !== expected.createdBy
  ) {
    throw new Error(`Item id collision for relation record ${expected.id}`)
  }
  return record
}

function authorizationCapability(connector: RelationStoreConnector): AuthorizationCapable | null {
  const candidate = connector as RelationStoreConnector & Partial<AuthorizationCapable>
  return typeof candidate.can === "function" ? candidate as AuthorizationCapable : null
}

async function assertCanMutate(
  connector: RelationStoreConnector,
  ability: Extract<Ability, "item/edit" | "item/delete">,
  item: Item,
): Promise<void> {
  const user = await connector.getCurrentUser()
  if (!user) throw new Error("Relation record mutation requires an authenticated user")

  const authorization = authorizationCapability(connector)
  const allowed = authorization ? authorization.can(ability, item) : item.createdBy === user.id
  if (!allowed) throw new Error(`Not authorized to ${ability} relation record ${item.id}`)
}

function buildRelationData(
  predicate: string,
  fields?: Record<string, unknown>,
  confirmationRef?: string,
): Record<string, unknown> {
  return {
    ...(fields ?? {}),
    predicate,
    ...(confirmationRef !== undefined ? { confirmationRef } : {}),
  }
}

/**
 * The record-CREATE contract, callable against a scoped item facade: caller
 * never supplies `createdBy` (it comes from the authenticated identity), the
 * canonical id hashes the (author, tuple), and a pre-existing id with a
 * different identity is an error, not an idempotent success. The default
 * store delegates here; connectors reuse it to create a record inside the
 * resolved owner scope of the item the relation targets.
 */
export async function createRelationRecordWith(
  connector: RelationRecordCreateConnector,
  input: RelationRecordInput,
  options?: DefaultRelationStoreOptions,
): Promise<RelationRecord> {
  assertInput(input)
  const user = await connector.getCurrentUser()
  if (!user) throw new Error("Relation record creation requires an authenticated user")

  const endpoints = canonicalizeRelationEndpoints(
    input.predicate,
    input.from,
    input.to,
    options,
  )
  const id = await deriveRelationRecordId(
    user.id,
    input.predicate,
    endpoints.from,
    endpoints.to,
    options,
  )
  const expected = { id, predicate: input.predicate, ...endpoints, createdBy: user.id }
  const existing = await connector.getItem(id)
  if (existing) return assertSameIdentity(existing, expected)

  const data = buildRelationData(input.predicate, input.fields, input.confirmationRef)
  const itemInput: CreateItemInput = {
    id,
    type: "relation",
    createdBy: user.id,
    "@context": deriveContext("relation", data),
    data,
    relations: [
      { predicate: "from", target: endpoints.from },
      { predicate: "to", target: endpoints.to },
    ],
  }
  const created = await connector.createItem(itemInput)
  return assertSameIdentity(created, expected)
}

export function createDefaultRelationStore(
  connector: RelationStoreConnector,
  options?: DefaultRelationStoreOptions,
): DefaultRelationStore {
  const stableOptions = normalizedOptions(options)

  const getRelationRecords = async (filter?: RelationRecordFilter): Promise<RelationRecord[]> => {
    return recordsFromItems(await connector.getItems({ type: "relation" }), filter)
  }

  const observeRelationRecords = (filter?: RelationRecordFilter): Observable<RelationRecord[]> => {
    return mapObservable(connector.observe({ type: "relation" }), (items) => recordsFromItems(items, filter))
  }

  const getRelationNeighbors = async (endpoint: string, predicate?: string): Promise<Item[]> => {
    const [relationItems, allItems] = await Promise.all([
      connector.getItems({ type: "relation" }),
      connector.getItems(),
    ])
    return relationNeighbors(relationItems, allItems, endpoint, predicate)
  }

  const observeRelationNeighbors = (endpoint: string, predicate?: string): Observable<Item[]> => {
    return combineItemObservables(
      connector.observe({ type: "relation" }),
      connector.observe({}),
      (relationItems, allItems) => relationNeighbors(relationItems, allItems, endpoint, predicate),
    )
  }

  const createRelationRecord = (input: RelationRecordInput): Promise<RelationRecord> =>
    createRelationRecordWith(connector, input, stableOptions)

  const updateRelationRecord = async (
    id: string,
    updates: RelationRecordUpdate,
  ): Promise<RelationRecord> => {
    for (const key of Object.keys(updates)) {
      if (key !== "fields" && key !== "confirmationRef") {
        throw new Error(`Relation update field is not mutable: ${key}`)
      }
    }
    assertFields(updates.fields)
    if (
      updates.confirmationRef !== undefined &&
      updates.confirmationRef !== null &&
      typeof updates.confirmationRef !== "string"
    ) {
      throw new Error("Relation confirmationRef must be a string or null")
    }

    const item = await connector.getItem(id)
    const current = item ? relationRecordFromItem(item) : null
    if (!item || !current) throw new Error(`Relation record not found: ${id}`)
    await assertCanMutate(connector, "item/edit", item)

    const fields = updates.fields === undefined ? current.fields : updates.fields
    const confirmationRef = updates.confirmationRef === null
      ? undefined
      : updates.confirmationRef ?? current.confirmationRef
    const updated = await connector.updateItem(id, {
      data: buildRelationData(current.predicate, fields, confirmationRef),
    })
    return assertSameIdentity(updated, current)
  }

  const deleteRelationRecord = async (id: string): Promise<void> => {
    const item = await connector.getItem(id)
    if (!item || item.type !== "relation") throw new Error(`Relation record not found: ${id}`)
    await assertCanMutate(connector, "item/delete", item)
    await connector.deleteItem(id)
  }

  return {
    getRelationRecords,
    observeRelationRecords,
    getRelationNeighbors,
    observeRelationNeighbors,
    createRelationRecord,
    updateRelationRecord,
    deleteRelationRecord,
  }
}
