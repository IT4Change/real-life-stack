// @real-life-stack/data-interface
// Zentrale Typdefinitionen für das DataInterface (Connector-Schnittstelle)

import { BaseConnector } from "./base-connector.js"
export { BaseConnector, createObservable, shallowEqual, matchesFilter, findRelatedItems, applyPagination, type ReactiveObservable } from "./base-connector.js"
export * from "./item-types.js"

// --- Core Types ---

export interface Item {
  id: string
  type: string
  createdAt: string
  createdBy: string

  schema?: string
  schemaVersion?: number

  data: Record<string, unknown>
  relations?: Relation[]

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
  createdBy?: string
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

// --- Signed Claims (Verifications + Attestations) ---

export interface SignedClaim {
  id: string
  from: string            // Signer ID (DID bei WoT)
  to: string              // Subject ID (Empfänger-Prinzip)
  claim: string           // "physical-meeting" oder frei formuliert
  tags?: string[]         // ["verification"], ["skill", "kochen"], ["quest"]
  createdAt: string
  isAccepted: boolean     // Empfänger-Sichtbarkeit
}

export type ClaimDeliveryStatus = "sending" | "queued" | "delivered" | "acknowledged" | "failed"
export type VerificationDirection = "mutual" | "incoming" | "outgoing" | "none"

export interface SignedClaimCapable {
  // Erstellen (allgemein)
  createClaim(toId: string, claim: string, tags?: string[]): Promise<SignedClaim>

  // Erstellen (Verification via Challenge-Response)
  createChallenge(): Promise<{ code: string; nonce: string }>
  prepareResponse(challengeCode: string): Promise<{ peerId: string; peerName?: string; peerAvatar?: string }>
  confirmAndRespond(challengeCode: string): Promise<void>
  counterVerify(targetId: string): Promise<void>

  // Lesen
  getClaimsByMe(): Promise<SignedClaim[]>
  getClaimsAboutMe(): Promise<SignedClaim[]>
  observeClaims(): Observable<SignedClaim[]>

  // Verification-Status (Convenience)
  getVerificationStatus(contactId: string): VerificationDirection

  // Akzeptanz + Delivery
  setAccepted(id: string, accepted: boolean): Promise<void>
  observeDeliveryStatuses(): Observable<Map<string, ClaimDeliveryStatus>>
  retryClaim(id: string): Promise<void>
}

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
  isSyncPending(): Observable<boolean>
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
}

// --- Convenience: Full-Featured Connector ---

export type FullConnector = DataInterface & ItemWriter & RelationCapable & GroupManager & Authenticatable & MultiSource

// --- Type Guards ---

export function isWritable(c: DataInterface): c is DataInterface & ItemWriter {
  return "createItem" in c && "updateItem" in c && "deleteItem" in c
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

export function hasSignedClaims(c: DataInterface): c is DataInterface & SignedClaimCapable {
  return "createClaim" in c && "observeClaims" in c && "createChallenge" in c
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

export function hasProfile(c: DataInterface): c is DataInterface & ProfileCapable {
  return "getMyProfile" in c && "observeMyProfile" in c && "syncProfile" in c
}

export function hasEventListener(c: DataInterface): c is DataInterface & EventListenerCapable {
  return "onIncomingEvent" in c
}

export function hasItemGroups(c: DataInterface): c is DataInterface & ItemGroupCapable {
  return "getItemGroupId" in c && "moveItemToGroup" in c
}
