// @real-life-stack/data-interface
// Zentrale Typdefinitionen für das DataInterface (Connector-Schnittstelle)

import { BaseConnector } from "./base-connector.js"
export { BaseConnector, createObservable, shallowEqual, matchesFilter, findRelatedItems, applyPagination, type ReactiveObservable } from "./base-connector.js"
export * from "./item-types.js"
export * from "./vocab.js"

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

export interface ItemWriter {
  createItem(item: Omit<Item, "id" | "createdAt">): Promise<Item>
  updateItem(id: string, updates: Partial<Item>): Promise<Item>
  deleteItem(id: string): Promise<void>
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

export function hasAuthorization(c: DataInterface): c is DataInterface & AuthorizationCapable {
  return "can" in c && typeof (c as { can?: unknown }).can === "function"
}

export function hasRelations(c: DataInterface): c is DataInterface & RelationCapable {
  return "getRelatedItems" in c && "observeRelatedItems" in c
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
