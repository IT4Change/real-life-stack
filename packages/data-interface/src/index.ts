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
