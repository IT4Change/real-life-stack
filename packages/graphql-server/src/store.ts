import type { CreateItemInput, Item, ItemFilter, Group, User, AuthState, Relation } from "@real-life-stack/data-interface"
import { applyPagination, matchesFilter } from "@real-life-stack/data-interface"
import { demoItems, demoGroups, demoUsers, demoGroupMembers } from "@real-life-stack/data-interface/demo-data"
import { publish } from "./pubsub.js"

// Deep-copy demo data so mutations don't affect the originals
function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_key, value) => {
    if (value instanceof Date) return value.toISOString()
    return value
  }))
}

// --- State ---

let items: Item[] = clone(demoItems)
let groups: Group[] = clone(demoGroups)
const users: User[] = clone(demoUsers)
let groupMembers: Record<string, string[]> = clone(demoGroupMembers)
let currentGroupId: string | null = groups[0]?.id ?? null
let currentUser: User | null = users[0] ?? null
let authState: AuthState = currentUser
  ? { status: "authenticated", user: currentUser }
  : { status: "unauthenticated" }
let nextItemId = 100

// --- Items ---

/** GraphQL delivers bbox as number[]; the contract type is a 4-tuple. */
type WireItemFilter = Omit<ItemFilter, "bbox"> & { bbox?: number[] }

export function getItems(wireFilter?: WireItemFilter): Item[] {
  // The SHARED filter implementation — the server must accept exactly what
  // the DataInterface contract defines, or parameters silently vanish at
  // this boundary (rls#214).
  if (!wireFilter) return items
  const { bbox, ...rest } = wireFilter
  if (bbox && bbox.length !== 4) {
    // Fail CLOSED: silently dropping an invalid bbox would return everything
    // as if no filter were set.
    throw new Error(`bbox must be [west, south, east, north] (4 numbers), got ${bbox.length}`)
  }
  const filter: ItemFilter = {
    ...rest,
    ...(bbox ? { bbox: bbox as [number, number, number, number] } : {}),
  }
  const filtered = items.filter((item) => matchesFilter(item, filter))
  return applyPagination(filtered, filter.limit, filter.offset)
}

export function getItem(id: string): Item | null {
  return items.find((i) => i.id === id) ?? null
}

type StoreCreateItemInput = Pick<
  CreateItemInput,
  "id" | "type" | "createdBy" | "data" | "relations" | "@context" | "tags"
>

function allocateItemId(): string {
  let id: string
  do {
    id = `item-${nextItemId++}`
  } while (items.some((item) => item.id === id))
  return id
}

export function createItem(input: StoreCreateItemInput): Item {
  if (input.id !== undefined) {
    const existing = items.find((item) => item.id === input.id)
    if (existing) return existing
  }

  const item: Item = {
    id: input.id ?? allocateItemId(),
    type: input.type,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    ...(input["@context"] ? { "@context": input["@context"] } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
    data: input.data,
    relations: input.relations,
  }
  items.push(item)
  publish({ topic: "ITEMS_CHANGED", filter: { type: item.type } })
  publish({ topic: "ITEM_CHANGED", itemId: item.id })
  return item
}

export function updateItem(id: string, updates: { data?: Record<string, unknown>; relations?: Item["relations"]; "@context"?: string[]; tags?: string[] }): Item {
  const idx = items.findIndex((i) => i.id === id)
  if (idx === -1) throw new Error(`Item not found: ${id}`)
  items[idx] = { ...items[idx], ...updates, id }
  publish({ topic: "ITEMS_CHANGED", filter: { type: items[idx].type } })
  publish({ topic: "ITEM_CHANGED", itemId: id })
  return items[idx]
}

export function deleteItem(id: string): boolean {
  const item = items.find((i) => i.id === id)
  if (!item) return false
  items = items.filter((i) => i.id !== id)
  publish({ topic: "ITEMS_CHANGED", filter: { type: item.type } })
  publish({ topic: "ITEM_CHANGED", itemId: id })
  return true
}

// --- Relations ---

export function getRelatedItems(
  itemId: string,
  predicate?: string,
): Item[] {
  const item = items.find((i) => i.id === itemId)
  if (!item?.relations) return []

  const relations: Relation[] = item.relations
  const matching = predicate
    ? relations.filter((r) => r.predicate === predicate)
    : relations

  const targetIds = matching
    .map((r) => r.target.replace(/^(item:|global:)/, ""))
    .filter((t) => !t.startsWith("space:"))

  return items.filter((i) => targetIds.includes(i.id))
}

// --- Groups ---

export function getGroups(): Group[] {
  return groups
}

export function createGroup(name: string, data?: Record<string, unknown>): Group {
  const group: Group = { id: `group-${Date.now()}`, name, data }
  groups.push(group)
  groupMembers[group.id] = currentUser ? [currentUser.id] : []
  return group
}

export function updateGroup(id: string, updates: { name?: string; data?: Record<string, unknown> }): Group {
  const group = groups.find((g) => g.id === id)
  if (!group) throw new Error(`Group not found: ${id}`)
  if (updates.name) group.name = updates.name
  if (updates.data) group.data = { ...group.data, ...updates.data }
  return group
}

export function deleteGroup(id: string): boolean {
  const existed = groups.some((g) => g.id === id)
  groups = groups.filter((g) => g.id !== id)
  delete groupMembers[id]
  if (currentGroupId === id) {
    currentGroupId = groups[0]?.id ?? null
  }
  return existed
}

export function getMembers(groupId: string): User[] {
  const memberIds = groupMembers[groupId] ?? []
  return users.filter((u) => memberIds.includes(u.id))
}

export function inviteMember(groupId: string, userId: string): boolean {
  if (!groupMembers[groupId]) groupMembers[groupId] = []
  if (groupMembers[groupId].includes(userId)) return false
  groupMembers[groupId].push(userId)
  return true
}

export function removeMember(groupId: string, userId: string): boolean {
  if (!groupMembers[groupId]) return false
  const before = groupMembers[groupId].length
  groupMembers[groupId] = groupMembers[groupId].filter((id) => id !== userId)
  return groupMembers[groupId].length < before
}

export function getCurrentGroup(): Group | null {
  if (!currentGroupId) return null
  return groups.find((g) => g.id === currentGroupId) ?? null
}

export function setCurrentGroup(id: string): Group | null {
  const group = groups.find((g) => g.id === id)
  if (group) currentGroupId = id
  return group ?? null
}

// --- Users & Auth ---

export function getUsers(): User[] {
  return users
}

export function getUser(id: string): User | null {
  return users.find((u) => u.id === id) ?? null
}

export function getCurrentUser(): User | null {
  return currentUser
}

export function getAuthState(): AuthState {
  return authState
}

export function getAuthMethods() {
  return [{ method: "mock", label: "Mock Login" }]
}

export function authenticate(_method: string, _credentials: unknown): User {
  currentUser = users[0]
  authState = { status: "authenticated", user: currentUser }
  publish({ topic: "AUTH_STATE_CHANGED" })
  return currentUser
}

export function logout(): void {
  currentUser = null
  authState = { status: "unauthenticated" }
  publish({ topic: "AUTH_STATE_CHANGED" })
}

// --- Sources ---

export function getSources() {
  return [{ id: "graphql", name: "GraphQL Server" }]
}

export function getActiveSource() {
  return { id: "graphql", name: "GraphQL Server" }
}
