// @real-life-stack/data-interface
// Zentrale Typdefinitionen für das DataInterface (Connector-Schnittstelle)

import { BaseConnector } from "./base-connector.js"
export { BaseConnector, createObservable, shallowEqual, matchesFilter, findRelatedItems, applyPagination, type ReactiveObservable } from "./base-connector.js"
export {
  canonicalizeRelationEndpoints,
  createDefaultRelationStore,
  createRelationRecordWith,
  deriveRelationRecordId,
  relationRecordFromItem,
  relationStoreOptionsFrom,
  type DefaultRelationStoreOptions,
  type RelationPredicateDefinition,
  type RelationRecordCreateConnector,
} from "./relation-records.js"
export * from "./item-types.js"
export * from "./votes.js"
export * from "./vocab.js"
export { EMPTY_NOTIFICATION_STATE, cloneNotificationState, applyNotificationStatePatch, maxTs, pruneReadEntryKeys } from "./notification-state.js"

// --- Core Types ---

export interface Item {
  id: string
  type: string
  createdAt: string
  createdBy: string

  /**
   * Active vocabularies for this item, as URL identifiers. The first entry is
   * always `base/v1`; additional entries opt the item into vocab-specific
   * schemas (event/v1, place/v1, task/v1, person/v1, ...).
   *
   * Conformance: see docs/spec/06-schema-composition.md.
   */
  "@context"?: string[]

  schema?: string
  schemaVersion?: number

  data: Record<string, unknown>
  relations?: Relation[]

  /**
   * Free-string or URN tag identifiers. Top-level (not in `data`) so the
   * `hasTag` filter and cross-vocab listings work regardless of which
   * vocabulary the item carries. Spec: docs/spec/07-tags.md, base/v1 schema.
   */
  tags?: string[]

  _source?: string
}

export interface Relation {
  predicate: string
  target: string
  meta?: Record<string, unknown>
}

export interface Group {
  id: string
  name: string
  members?: string[]
  data?: Record<string, unknown>
}

export interface User {
  id: string
  displayName?: string
  avatarUrl?: string
  /**
   * True when this user is an admin of the group the member list was fetched for.
   * Derived from the space's authoritative admin set (`admins`, fallback
   * `createdBy`), NOT from list position — `space.members` is DID-sorted, so
   * position says nothing about who created or administers the space. Only set
   * by per-group member queries; undefined in the personal (all-groups) view.
   */
  isAdmin?: boolean
}

// --- Observable ---

export interface Observable<T> {
  current: T
  subscribe(callback: (value: T) => void): Unsubscribe
  /**
   * Whether the first value has been resolved. Synchronous sources are loaded
   * from creation; an async source (e.g. a network-backed `observe`) is `false`
   * until its first fetch settles — even when that result is empty. Optional and
   * defaults to "loaded": treat `false` as still-loading, anything else as
   * loaded. Lets consumers tell "no data yet" apart from "loaded, genuinely
   * empty" (e.g. a viewport query that legitimately returns nothing).
   */
  loaded?: boolean
}

export type Unsubscribe = () => void

// --- Auth ---

export type AuthState =
  | { status: "authenticated"; user: User }
  | { status: "unauthenticated" }
  | { status: "loading" }

export interface AuthMethod {
  method: string
  label: string
}

// --- Filter & Query ---

export interface ItemFilter {
  type?: string
  hasField?: string[]
  /**
   * AND-filter on top-level `item.tags`. All listed tags must be present.
   * Empty array matches every item. Spec: docs/spec/07-tags.md.
   */
  hasTag?: string[]
  createdBy?: string
  /**
   * Viewport bounding box `[west, south, east, north]` (GeoJSON lng/lat axis
   * order). Matches items whose `data.position` lies inside the box; items
   * without a parsable position are excluded while `bbox` is set. The data seam
   * for scaling maps: a local connector MAY filter client-side from the full
   * set, a backend connector SHOULD restrict server-side. Spec:
   * docs/spec/modules/map.md → Datenquelle, docs/spec/02-data-interface.md.
   */
  bbox?: [number, number, number, number]
  source?: string
  limit?: number
  offset?: number
}

export interface RelatedItemsOptions {
  direction?: "from" | "to" | "both"
  depth?: number
  limit?: number
  offset?: number
}

// --- Source (Multi-Source) ---

export interface Source {
  id: string
  name: string
  connector: DataInterface
}

// --- DataInterface (Core — read-only) ---

export interface DataInterface {
  // Lifecycle
  init(): Promise<void>
  dispose(): Promise<void>

  // Items — einmalig laden
  getItems(filter?: ItemFilter): Promise<Item[]>
  getItem(id: string): Promise<Item | null>

  // Items — reaktiv beobachten
  observe(filter: ItemFilter): Observable<Item[]>
  observeItem(id: string): Observable<Item | null>
}

// --- Capability Interfaces ---

export type CreateItemInput = Omit<Item, "id" | "createdAt"> & { id?: string }

export interface ItemWriter {
  createItem(item: CreateItemInput): Promise<Item>
  updateItem(id: string, updates: Partial<Item>): Promise<Item>
  deleteItem(id: string): Promise<void>
}

/** A human-readable, best-effort history entry for one space. */
/** Best display string for an item: title-ish field, else truncated text. */
export function itemDisplayTitle(item: Item): string | undefined {
  for (const key of ["title", "name", "label", "displayName"]) {
    const value = item.data[key]
    if (typeof value === "string" && value.trim()) return value
  }
  // Posts and comments carry their body in `content` (base/v1) — an excerpt
  // beats the bare type word everywhere a title is displayed.
  for (const key of ["content", "text"]) {
    const value = item.data[key]
    if (typeof value === "string" && value.trim()) {
      return value.length > 40 ? `${value.slice(0, 40)}…` : value
    }
  }
  return undefined
}

/**
 * Activity summary for a logged mutation. Plain items log their display
 * title; reactions log "<emoji> auf „<Ziel>"" so the history answers who
 * reacted to what — even after the reaction item itself is gone.
 */
export function deriveActivitySummary(
  item: Item,
  lookupItem: (id: string) => Item | undefined,
): string | undefined {
  if (item.type === "reaction") {
    const emoji = typeof item.data.emoji === "string" && item.data.emoji ? item.data.emoji : "Reaktion"
    const target = item.relations?.find((relation) => relation.predicate === "reactsTo")?.target
    const targetId = target?.startsWith("item:") ? target.slice("item:".length) : undefined
    const parent = targetId ? lookupItem(targetId) : undefined
    const title = parent ? itemDisplayTitle(parent) : undefined
    return title ? `${emoji} auf „${title}"` : emoji
  }
  if (item.type === "relation" && item.data.predicate === "votesOn") {
    // Votes are relation records (votes.ts); their record item carries the
    // stance in data.value and the statement in the "to" endpoint relation.
    const stanceLabel = item.data.value === "green" ? "Zustimmung"
      : item.data.value === "yellow" ? "Bedenken"
      : item.data.value === "red" ? "Ablehnung" : "Stimme"
    const target = item.relations?.find((relation) => relation.predicate === "to")?.target
    const targetId = target?.startsWith("item:") ? target.slice("item:".length) : undefined
    const parent = targetId ? lookupItem(targetId) : undefined
    const title = parent ? itemDisplayTitle(parent) : undefined
    return title ? `${stanceLabel} zu „${title}"` : stanceLabel
  }
  return itemDisplayTitle(item)
}

export interface ActivityEntry {
  id: string
  ts: string
  actor: string
  action: "create" | "update" | "delete"
  origin?: "mirror"
  targetId: string
  targetType: string
  summary?: string
}

export interface ActivityLogCapable {
  getActivity(options?: { limit?: number }): Promise<ActivityEntry[]>
  observeActivity(options?: { limit?: number }): Observable<ActivityEntry[]>
}

/** Additive all-visible-spaces activity projection. */
export interface ScopedActivityLogCapable {
  getScopedActivity(options?: { limit?: number }): Promise<ScopedActivityEntry[]>
  observeScopedActivity(options?: { limit?: number }): Observable<ScopedActivityEntry[]>
}

export interface ScopedActivityEntry {
  groupId: string
  entry: ActivityEntry
  targetExists: boolean
  subject: {
    id: string
    type: string
    createdBy?: string
    title?: string
    moduleHints?: { hasPosition: boolean; hasStart: boolean; hasStatus: boolean }
  } | null
  isPersonal?: boolean
  actor: User | null
}

/** Effective, device-map-free notification state exposed to RLS callers. */
export interface NotificationState {
  lastSeenTs?: string
  readUpToTs?: string
  readEntryKeys: Record<string, string>
  mutedGroupIds: Record<string, true>
}

export type NotificationStatePatch =
  | { op: "markSeen"; ts: string }
  | { op: "markRead"; keys: Record<string, string> }
  | { op: "markAllReadUpTo"; ts: string }
  | { op: "mute"; groupId: string }
  | { op: "unmute"; groupId: string }

export interface NotificationStateCapable {
  getNotificationState(): Promise<NotificationState>
  observeNotificationState(): Observable<NotificationState>
  updateNotificationState(patch: NotificationStatePatch): Promise<void>
}

export function hasNotificationState(connector: DataInterface): connector is DataInterface & NotificationStateCapable {
  return typeof (connector as Partial<NotificationStateCapable>).getNotificationState === "function"
    && typeof (connector as Partial<NotificationStateCapable>).observeNotificationState === "function"
    && typeof (connector as Partial<NotificationStateCapable>).updateNotificationState === "function"
}

const KANBAN_STATUSES = new Set(["open", "in-progress", "done", "archived"])
export type ModuleHints = NonNullable<NonNullable<ScopedActivityEntry["subject"]>["moduleHints"]>

/** The exact field predicates used by the workspace's default module resolver. */
export function moduleHintsFor(itemOrHints: Item | ModuleHints): ModuleHints {
  if ("hasPosition" in itemOrHints) return itemOrHints
  const item = itemOrHints
  const data = item.data ?? {}
  const position = data.position as { coordinates?: unknown } | undefined
  const status = data.status
  return {
    hasPosition: Array.isArray(position?.coordinates),
    hasStart: typeof data.start === "string" && data.start.length > 0,
    hasStatus: item.type === "task" || (typeof status === "string" && KANBAN_STATUSES.has(status)),
  }
}

/**
 * UCAN-style abilities for item authorization. Strings, so they map onto UCAN
 * `can` capabilities directly; extend as new actions appear.
 */
export type Ability = "item/create" | "item/edit" | "item/delete"

/**
 * What an authorization check targets: an existing item (edit/delete), or a
 * space context (create, where no item exists yet — optionally scoped to a type).
 * An `Item` has no top-level `space`, so `"space" in resource` discriminates.
 */
export type AuthorizationResource = Item | { space: string; type?: string }

/**
 * Optional capability: per-resource authorization. Models permissions as a
 * UCAN-style capability — "may the actor perform `ability` on `resource`" —
 * which maps to both WoT/UCAN (held capability chain, checked locally) and
 * GraphQL RBAC/RLS (server policy, per-row flags delivered with the data).
 *
 * MUST be synchronous: it resolves from already-loaded state (held UCANs,
 * per-row permission flags, owner column), never a network round-trip — so the
 * UI can gate affordances per item in a list without N calls. Enforcement lives
 * in the backend/protocol; `can` only drives UI affordances, it is NOT a
 * security boundary. Connectors without an authorization model omit it; callers
 * then fall back to a creator-owns default (see toolkit `useItemPermissions`).
 */
export interface AuthorizationCapable {
  can(ability: Ability, resource: AuthorizationResource): boolean
}

export interface RelationCapable {
  getRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Promise<Item[]>
  observeRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Observable<Item[]>
}

export interface RelationRecord {
  id: string
  predicate: string
  from: string
  to: string
  fields?: Record<string, unknown>
  confirmationRef?: string
  createdBy: string
  createdAt: string
}

export interface RelationRecordInput {
  predicate: string
  from: string
  to: string
  fields?: Record<string, unknown>
  confirmationRef?: string
}

export interface RelationRecordUpdate {
  fields?: Record<string, unknown>
  confirmationRef?: string | null
}

export interface RelationRecordFilter {
  predicate?: string
  from?: string
  to?: string
  /** Match records whose from or to target equals this value. */
  endpoint?: string
}

export interface RelationRecordCapable {
  getRelationRecords(filter?: RelationRecordFilter): Promise<RelationRecord[]>
  observeRelationRecords(filter?: RelationRecordFilter): Observable<RelationRecord[]>
  getRelationNeighbors(endpoint: string, predicate?: string): Promise<Item[]>
  observeRelationNeighbors(endpoint: string, predicate?: string): Observable<Item[]>
}

export interface RelationRecordWriterCapable {
  createRelationRecord(input: RelationRecordInput): Promise<RelationRecord>
  updateRelationRecord(id: string, updates: RelationRecordUpdate): Promise<RelationRecord>
  deleteRelationRecord(id: string): Promise<void>
}

export interface GroupManager {
  getGroups(): Promise<Group[]>
  observeGroups(): Observable<Group[]>
  getCurrentGroup(): Group | null
  observeCurrentGroup(): Observable<Group | null>
  setCurrentGroup(id: string | null): void
  createGroup(name: string, data?: Record<string, unknown>): Promise<Group>
  updateGroup(id: string, updates: Partial<Group>): Promise<Group>
  deleteGroup(id: string): Promise<void>
  getMembers(groupId: string | null): Promise<User[]>
  observeMembers(groupId: string | null): Observable<User[]>
  inviteMember(groupId: string, userId: string): Promise<void>
  removeMember(groupId: string, userId: string): Promise<void>
}

export interface Authenticatable {
  getCurrentUser(): Promise<User | null>
  observeCurrentUser(): Observable<User | null>
  getUser(id: string): Promise<User | null>
  getAuthState(): Observable<AuthState>
  getAuthMethods(): AuthMethod[]
  authenticate(method: string, credentials: unknown): Promise<User>
  logout(): Promise<void>
}

export interface MultiSource {
  getSources(): Source[]
  getActiveSource(): Source
  setActiveSource(sourceId: string): void
}

// --- Contacts ---

export interface ContactInfo {
  id: string              // DID bei WoT, User-ID bei GraphQL/REST
  publicKey?: string      // nur bei Krypto-Connectors
  name?: string
  avatar?: string
  bio?: string
  status: "pending" | "active"
  verifiedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ContactManager {
  getContacts(): Promise<ContactInfo[]>
  observeContacts(): Observable<ContactInfo[]>
  addContact(id: string, name?: string): Promise<ContactInfo>
  activateContact(id: string): Promise<void>
  updateContactName(id: string, name: string): Promise<void>
  removeContact(id: string): Promise<void>
}

// --- Messaging / Relay ---

export type RelayState = "connected" | "connecting" | "disconnected" | "error"

export interface MessagingCapable {
  getRelayState(): Observable<RelayState>
  getOutboxPendingCount(): Observable<number>
}

export type VerificationDirection = "mutual" | "incoming" | "outgoing" | "none"

// --- Confirmations (backend-agnostische Trust-Projektion) ---

export type ConfirmationTrustLevel =
  | "demo"
  | "local"
  | "server-confirmed"
  | "signed-attested"

export interface ConfirmationView {
  id: string
  subjectId: string
  issuerId?: string
  claim: string
  schema?: string
  tags?: string[]
  relations?: Relation[]
  createdAt: string
  trustLevel: ConfirmationTrustLevel
  source?: string
  isAccepted?: boolean
}

export interface ConfirmationCapable {
  getConfirmations(): Promise<ConfirmationView[]>
  observeConfirmations(): Observable<ConfirmationView[]>
}

export interface ConfirmationIssueInput {
  subjectId: string
  claim: string
  tags?: string[]
  schema?: string
  relations?: Relation[]
}

export interface ConfirmationWriterCapable {
  issueConfirmation(input: ConfirmationIssueInput): Promise<ConfirmationView>
  setConfirmationAccepted(id: string, accepted: boolean): Promise<void>
}

export interface VerificationChallenge {
  code: string
  nonce: string
}

export interface EncounterPeerInfo {
  peerId: string
  peerName?: string
  peerAvatar?: string
}

export interface EncounterVerificationCapable {
  createVerificationChallenge(): Promise<VerificationChallenge>
  prepareVerificationResponse(challengeCode: string): Promise<EncounterPeerInfo>
  confirmVerificationResponse(challengeCode: string): Promise<void>
  counterVerify(contactId: string): Promise<void>
  getVerificationStatus(contactId: string): VerificationDirection
}

// --- Profile ---

export interface PublicProfileData {
  id: string
  name?: string
  bio?: string
  avatar?: string
  offers?: string[]
  needs?: string[]
}

export interface ProfileCapable {
  getMyProfile(): Promise<Item | null>
  observeMyProfile(): Observable<Item | null>
  updateMyProfile(updates: Partial<Record<string, unknown>>): Promise<Item>
  setFieldVisibility(field: string, isPublic: boolean): Promise<void>
  getPublicProfile(id: string): Promise<PublicProfileData | null>
  syncProfile(): Promise<void>
  /**
   * Whether a profile publish to the discovery server is currently in flight.
   * Scoped to the profile write path only — NOT a generic read/sync status
   * (read readiness is `Observable.loaded`, generic write-pending is
   * `getOutboxPendingCount()`). See docs/spec/02-data-interface.md → Readiness vs. Sync.
   */
  isProfileSyncPending(): Observable<boolean>
}

// --- Incoming Events ---

export interface IncomingVerificationEvent {
  type: "incoming-verification"
  fromId: string
  fromName?: string
  fromAvatar?: string
  /** The challenge code needed for counter-verification */
  challengeCode: string
}

export interface IncomingSpaceInviteEvent {
  type: "space-invite"
  fromId: string
  fromName?: string
  spaceId: string
  spaceName: string
  spaceImage?: string
}

export interface MutualVerificationEvent {
  type: "mutual-verification"
  fromId: string
  fromName?: string
  fromAvatar?: string
}

export interface IncomingClaimEvent {
  type: "incoming-claim"
  fromId: string
  fromName?: string
  claimId: string
}

export type IncomingEvent = IncomingVerificationEvent | IncomingSpaceInviteEvent | MutualVerificationEvent | IncomingClaimEvent

export interface EventListenerCapable {
  onIncomingEvent(callback: (event: IncomingEvent) => void): () => void
}

// --- Item-Group Assignment ---

export interface ItemGroupCapable {
  getItemGroupId(itemId: string): string | null
  moveItemToGroup(itemId: string, targetGroupId: string): void | Promise<void>
  /**
   * The id of the user's personal/private space — the "share with nobody" target
   * (items here are not in any shared group). Used by the sharing-scope picker to
   * offer a „Privat" option. `null` for connectors without a personal space.
   * Pass this id to `moveItemToGroup` to make an item private.
   */
  getPersonalGroupId?(): string | null
}

// --- Convenience: Full-Featured Connector ---

export type FullConnector = DataInterface & ItemWriter & RelationCapable & GroupManager & Authenticatable & MultiSource

// --- Type Guards ---

export function isWritable(c: DataInterface): c is DataInterface & ItemWriter {
  return "createItem" in c && "updateItem" in c && "deleteItem" in c
}

export function hasActivityLog(c: DataInterface): c is DataInterface & ActivityLogCapable {
  const candidate = c as DataInterface & Partial<ActivityLogCapable>
  return typeof candidate.getActivity === "function" && typeof candidate.observeActivity === "function"
}

export function hasScopedActivityLog(c: DataInterface): c is DataInterface & ScopedActivityLogCapable {
  const candidate = c as DataInterface & Partial<ScopedActivityLogCapable>
  return typeof candidate.getScopedActivity === "function" && typeof candidate.observeScopedActivity === "function"
}

export function hasAuthorization(c: DataInterface): c is DataInterface & AuthorizationCapable {
  return "can" in c && typeof (c as { can?: unknown }).can === "function"
}

export function hasRelations(c: DataInterface): c is DataInterface & RelationCapable {
  return "getRelatedItems" in c && "observeRelatedItems" in c
}

export function hasRelationRecords(c: DataInterface): c is DataInterface & RelationRecordCapable {
  const candidate = c as DataInterface & Partial<RelationRecordCapable>
  return (
    typeof candidate.getRelationRecords === "function" &&
    typeof candidate.observeRelationRecords === "function" &&
    typeof candidate.getRelationNeighbors === "function" &&
    typeof candidate.observeRelationNeighbors === "function"
  )
}

export function hasRelationRecordWriter(c: DataInterface): c is DataInterface & RelationRecordWriterCapable {
  const candidate = c as DataInterface & Partial<RelationRecordWriterCapable>
  return (
    typeof candidate.createRelationRecord === "function" &&
    typeof candidate.updateRelationRecord === "function" &&
    typeof candidate.deleteRelationRecord === "function"
  )
}

export function hasGroups(c: DataInterface): c is DataInterface & GroupManager {
  return "getGroups" in c && "observeGroups" in c && "getMembers" in c
}

export function isAuthenticatable(c: DataInterface): c is DataInterface & Authenticatable {
  return "getAuthState" in c && "authenticate" in c
}

export function hasMultiSource(c: DataInterface): c is DataInterface & MultiSource {
  return "getSources" in c && "getActiveSource" in c
}

export function hasContacts(c: DataInterface): c is DataInterface & ContactManager {
  return "getContacts" in c && "observeContacts" in c && "addContact" in c
}

export function hasMessaging(c: DataInterface): c is DataInterface & MessagingCapable {
  return "getRelayState" in c && "getOutboxPendingCount" in c
}

export function hasConfirmations(c: DataInterface): c is DataInterface & ConfirmationCapable {
  if (!("getConfirmations" in c) || !("observeConfirmations" in c)) return false
  const get = (c as { getConfirmations: unknown }).getConfirmations
  const obs = (c as { observeConfirmations: unknown }).observeConfirmations
  if (typeof get !== "function" || typeof obs !== "function") return false
  // BaseConnector defaults must not imply support — both methods must be overridden.
  if (
    get === BaseConnector.prototype.getConfirmations ||
    obs === BaseConnector.prototype.observeConfirmations
  ) {
    return false
  }
  return true
}

export function hasConfirmationWriter(c: DataInterface): c is DataInterface & ConfirmationWriterCapable {
  if (!("issueConfirmation" in c) || !("setConfirmationAccepted" in c)) return false
  const issue = (c as { issueConfirmation: unknown }).issueConfirmation
  const setConfirmationAccepted = (c as { setConfirmationAccepted: unknown }).setConfirmationAccepted
  if (typeof issue !== "function" || typeof setConfirmationAccepted !== "function") return false
  if (
    issue === BaseConnector.prototype.issueConfirmation ||
    setConfirmationAccepted === BaseConnector.prototype.setConfirmationAccepted
  ) {
    return false
  }
  return true
}

export function hasEncounterVerification(c: DataInterface): c is DataInterface & EncounterVerificationCapable {
  if (
    !("createVerificationChallenge" in c) ||
    !("prepareVerificationResponse" in c) ||
    !("confirmVerificationResponse" in c) ||
    !("counterVerify" in c) ||
    !("getVerificationStatus" in c)
  ) {
    return false
  }
  const create = (c as { createVerificationChallenge: unknown }).createVerificationChallenge
  const prepare = (c as { prepareVerificationResponse: unknown }).prepareVerificationResponse
  const confirm = (c as { confirmVerificationResponse: unknown }).confirmVerificationResponse
  const counter = (c as { counterVerify: unknown }).counterVerify
  const status = (c as { getVerificationStatus: unknown }).getVerificationStatus
  if (
    typeof create !== "function" ||
    typeof prepare !== "function" ||
    typeof confirm !== "function" ||
    typeof counter !== "function" ||
    typeof status !== "function"
  ) {
    return false
  }
  if (
    create === BaseConnector.prototype.createVerificationChallenge ||
    prepare === BaseConnector.prototype.prepareVerificationResponse ||
    confirm === BaseConnector.prototype.confirmVerificationResponse ||
    counter === BaseConnector.prototype.counterVerify ||
    status === BaseConnector.prototype.getVerificationStatus
  ) {
    return false
  }
  return true
}

export function hasProfile(c: DataInterface): c is DataInterface & ProfileCapable {
  return "getMyProfile" in c && "observeMyProfile" in c && "syncProfile" in c
}

export function hasEventListener(c: DataInterface): c is DataInterface & EventListenerCapable {
  return "onIncomingEvent" in c
}

export function hasItemGroups(c: DataInterface): c is DataInterface & ItemGroupCapable {
  return "getItemGroupId" in c && "moveItemToGroup" in c
}
