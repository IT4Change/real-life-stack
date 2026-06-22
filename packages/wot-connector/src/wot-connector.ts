import type {
  Item,
  ItemFilter,
  Group,
  User,
  Observable,
  AuthState,
  AuthMethod,
  RelatedItemsOptions,
  Source,
  ContactInfo,
  RelayState,
  VerificationDirection,
  ConfirmationIssueInput,
  ConfirmationView,
  EncounterPeerInfo,
  VerificationChallenge,
  IncomingEvent,
} from "@real-life-stack/data-interface"
import {
  BaseConnector,
  createObservable,
  matchesFilter,
  findRelatedItems,
  applyPagination,
  type ReactiveObservable,
} from "@real-life-stack/data-interface"

import {
  OutboxMessagingAdapter,
  PersonalDocOutboxStore,
  PersonalDocSpaceMetadataStorage,
  GroupKeyService,
  HttpDiscoveryAdapter,
  OfflineFirstDiscoveryAdapter,
  InMemoryPublishStateStore,
  InMemoryGraphCacheStore,
  VerificationWorkflow,
  AttestationWorkflow,
  IdentityWorkflow,
  WebCryptoProtocolCryptoAdapter,
  IndexedDbIdentitySeedVault,
  CompactStorageManager,
  TracedCompactStorageManager,
  TracedOutboxMessagingAdapter,
  getMetrics,
  getDefaultDisplayName,
  signEnvelope,
  verifyEnvelope,
} from "@real-life/wot-core"
import { x25519MultibaseToPublicKeyBytes } from "@real-life/wot-core/protocol"
import type {
  SpaceInfo,
  SpaceHandle,
  Subscribable,
  MessagingAdapter,
  MessageEnvelope,
  MessageType,
  PublicProfile,
  PublicIdentitySession,
} from "@real-life/wot-core"
import {
  YjsReplicationAdapter,
  YjsStorageAdapter,
  initYjsPersonalDoc,
  getYjsPersonalDoc,
  resetYjsPersonalDoc,
  deleteYjsPersonalDocDB,
  onYjsPersonalDocChange,
  changeYjsPersonalDoc,
  flushYjsPersonalDoc,
  refreshYjsPersonalDocFromVault,
} from "@real-life/adapter-yjs"
import type { PersonalDoc } from "@real-life/adapter-yjs"

import type { WotConnectorConfig, RlsSpaceDoc, SerializedItem } from "./types.js"
import { serializeItem, deserializeItem } from "./serialization.js"
import { CrossGroupIndex } from "./CrossGroupIndex.js"
import { mapPersonalDocConfirmations } from "./confirmations.js"
import { CompatibleWebSocketMessagingAdapter } from "./compatible-websocket-messaging-adapter.js"

// --- Constants ---

const RLS_SPACE_TYPE = "rls"
const DEFAULT_MODULES = ["feed", "kanban", "calendar", "map"]
// Overview mode: setCurrentGroup(null) = show all items from all spaces

class WorkflowBackedIdentity implements PublicIdentitySession {
  private readonly workflow: IdentityWorkflow

  constructor() {
    const crypto = new WebCryptoProtocolCryptoAdapter()
    this.workflow = new IdentityWorkflow({
      crypto,
      vault: new IndexedDbIdentitySeedVault({ crypto }),
    })
  }

  get did(): string {
    return this.session().did
  }

  get kid(): string {
    return this.session().kid
  }

  get ed25519PublicKey(): Uint8Array {
    return this.session().ed25519PublicKey
  }

  get x25519PublicKey(): Uint8Array {
    return this.session().x25519PublicKey
  }

  async create(userPassphrase: string, storeSeed: boolean = true): Promise<{ mnemonic: string; did: string }> {
    const { mnemonic, identity } = await this.workflow.createIdentity({
      passphrase: userPassphrase,
      storeSeed,
    })
    return { mnemonic, did: identity.getDid() }
  }

  async unlock(mnemonic: string, passphrase: string, storeSeed: boolean = false): Promise<void> {
    await this.workflow.recoverIdentity({ mnemonic, passphrase, storeSeed })
  }

  async unlockFromStorage(passphrase?: string): Promise<void> {
    await this.workflow.unlockStoredIdentity(passphrase === undefined ? {} : { passphrase })
  }

  hasStoredIdentity(): Promise<boolean> {
    return this.workflow.hasStoredIdentity()
  }

  hasActiveSession(): Promise<boolean> {
    return this.workflow.hasActiveSession()
  }

  async deleteStoredIdentity(): Promise<void> {
    await this.workflow.deleteStoredIdentity()
  }

  getDid(): string {
    return this.session().getDid()
  }

  sign(data: string): Promise<string> {
    return this.session().sign(data)
  }

  signJws(payload: unknown): Promise<string> {
    return this.session().signJws(payload)
  }

  signEd25519(data: Uint8Array): Promise<Uint8Array> {
    return this.session().signEd25519(data)
  }

  deriveFrameworkKey(info: string): Promise<Uint8Array> {
    return this.session().deriveFrameworkKey(info)
  }

  getPublicKeyMultibase(): Promise<string> {
    return this.session().getPublicKeyMultibase()
  }

  getEncryptionPublicKeyBytes(): Promise<Uint8Array> {
    return this.session().getEncryptionPublicKeyBytes()
  }

  encryptForRecipient(...args: Parameters<PublicIdentitySession["encryptForRecipient"]>): ReturnType<PublicIdentitySession["encryptForRecipient"]> {
    return this.session().encryptForRecipient(...args)
  }

  decryptForMe(...args: Parameters<PublicIdentitySession["decryptForMe"]>): ReturnType<PublicIdentitySession["decryptForMe"]> {
    return this.session().decryptForMe(...args)
  }

  private session(): PublicIdentitySession {
    const identity = this.workflow.getCurrentIdentity()
    if (!identity) throw new Error("Identity not unlocked")
    return identity
  }
}

function isVerificationConfirmation(c: ConfirmationView): boolean {
  return c.schema === "wot:verification"
}

// --- WotConnector ---

export class WotConnector extends BaseConnector {
  private config: WotConnectorConfig
  private identity: WorkflowBackedIdentity
  private httpDiscovery: HttpDiscoveryAdapter
  private discovery: OfflineFirstDiscoveryAdapter
  private publishStateStore: InMemoryPublishStateStore
  private graphCacheStore: InMemoryGraphCacheStore
  private verificationWorkflow = new VerificationWorkflow({ crypto: new WebCryptoProtocolCryptoAdapter() })
  private attestationWorkflow = new AttestationWorkflow({ crypto: new WebCryptoProtocolCryptoAdapter() })

  // Adapters (initialized after auth)
  private wsAdapter: CompatibleWebSocketMessagingAdapter | null = null
  private outboxAdapter: OutboxMessagingAdapter | null = null
  private replication: YjsReplicationAdapter | null = null
  private groupKeyService: GroupKeyService | null = null
  private storage: YjsStorageAdapter | null = null

  // State
  private currentGroupId: string | null = null
  private currentHandle: SpaceHandle<RlsSpaceDoc> | null = null
  private handleReady: Promise<void> = Promise.resolve()
  private handleRemoteUnsub: (() => void) | null = null
  private notifyScheduled = false
  private itemCache: Item[] | null = null
  private privateSpaceId: string | null = null
  private crossGroupIndex: CrossGroupIndex<RlsSpaceDoc, Item> | null = null
  private crossGroupUnsub: (() => void) | null = null
  private spacesSubscriptionUnsub: (() => void) | null = null
  private personalDocUnsub: (() => void) | null = null
  private contactsUnsub: (() => void) | null = null
  private verificationsUnsub: (() => void) | null = null
  private attestationsUnsub: (() => void) | null = null

  // Observables (stable references — backing changes on group switch)
  private authStateObs: ReactiveObservable<AuthState>
  private contactsObs: ReactiveObservable<ContactInfo[]>
  private confirmationsObs: ReactiveObservable<ConfirmationView[]>
  private relayStateObs: ReactiveObservable<RelayState>
  private outboxCountObs: ReactiveObservable<number>
  private profileObs: ReactiveObservable<Item | null>
  private currentUserObs: ReactiveObservable<User | null>
  private syncPendingObs: ReactiveObservable<boolean>
  private profileUnsub: (() => void) | null = null
  private groupsCache: Group[] = []

  // Verification challenge state (in-progress challenges)
  private pendingChallenge: { code: string; nonce: string } | null = null

  // Incoming event listeners
  private eventCallbacks = new Set<(event: IncomingEvent) => void>()

  // Item observables keyed by JSON.stringify(filter)
  private itemObservables = new Map<string, ReactiveObservable<Item[]>>()
  private itemByIdObservables = new Map<string, ReactiveObservable<Item | null>>()
  private relatedObservables = new Map<string, ReactiveObservable<Item[]>>()
  private relatedObservableParams = new Map<string, { itemId: string; predicate?: string; options?: RelatedItemsOptions }>()

  constructor(config: WotConnectorConfig) {
    super()
    this.config = config
    this.identity = new WorkflowBackedIdentity()
    this.httpDiscovery = new HttpDiscoveryAdapter(config.profilesUrl)
    this.publishStateStore = new InMemoryPublishStateStore()
    this.graphCacheStore = new InMemoryGraphCacheStore()
    this.discovery = new OfflineFirstDiscoveryAdapter(this.httpDiscovery, this.publishStateStore, this.graphCacheStore)
    this.authStateObs = createObservable<AuthState>({ status: "loading" })
    this.contactsObs = createObservable<ContactInfo[]>([])
    this.confirmationsObs = createObservable<ConfirmationView[]>([])
    this.relayStateObs = createObservable<RelayState>("disconnected")
    this.outboxCountObs = createObservable<number>(0)
    this.profileObs = createObservable<Item | null>(null)
    this.currentUserObs = createObservable<User | null>(null)
    this.syncPendingObs = createObservable<boolean>(false)
  }

  // ==================== Lifecycle ====================

  async init(): Promise<void> {
    const hasStored = await this.identity.hasStoredIdentity()
    if (hasStored) {
      const hasSession = await this.identity.hasActiveSession()
      if (hasSession) {
        try {
          await this.identity.unlockFromStorage()
          await this.bootstrapAdapters()
          await this.setAuthAuthenticated()
          return
        } catch {
          // Session expired or corrupt — need manual unlock
        }
      }
      this.authStateObs.set({ status: "unauthenticated" })
    } else {
      this.authStateObs.set({ status: "unauthenticated" })
    }
  }

  async dispose(): Promise<void> {
    this.closeCurrentHandle()
    this.crossGroupUnsub?.()
    this.crossGroupIndex?.stop()
    this.crossGroupIndex = null
    this.privateSpaceId = null
    this.spacesSubscriptionUnsub?.()
    this.personalDocUnsub?.()
    this.contactsUnsub?.()
    this.verificationsUnsub?.()
    this.attestationsUnsub?.()
    this.profileUnsub?.()
    await this.replication?.stop()
    await this.outboxAdapter?.disconnect()
    await this.wsAdapter?.disconnect()
    await resetYjsPersonalDoc()

    for (const obs of this.itemObservables.values()) obs.destroy()
    for (const obs of this.itemByIdObservables.values()) obs.destroy()
    this.itemObservables.clear()
    this.itemByIdObservables.clear()
    for (const obs of this.relatedObservables.values()) obs.destroy()
    this.relatedObservables.clear()
    this.authStateObs.destroy()
    this.contactsObs.destroy()
    this.confirmationsObs.destroy()
    this.relayStateObs.destroy()
    this.outboxCountObs.destroy()
    this.profileObs.destroy()
    this.syncPendingObs.destroy()
    for (const obs of this.memberObservables.values()) obs.destroy()
    this.memberObservables.clear()
  }

  // ==================== Auth ====================

  override getAuthState(): Observable<AuthState> {
    return this.authStateObs
  }

  override getAuthMethods(): AuthMethod[] {
    return [{ method: "did", label: "Web of Trust (DID)" }]
  }

  override async authenticate(method: string, credentials: unknown): Promise<User> {
    const creds = credentials as Record<string, string>

    // Generate mnemonic without saving — used by OnboardingFlow step 1
    if (method === "generate") {
      const { mnemonic, did } = await this.identity.create("", false)
      const user: User & { _mnemonic: string } = {
        id: did,
        displayName: did.slice(-8),
        _mnemonic: mnemonic,
      }
      return user
    }

    // Finalize identity creation with mnemonic + passphrase
    if (method === "create") {
      if (creds.mnemonic) {
        // New flow: mnemonic was pre-generated via "generate"
        await this.identity.unlock(creds.mnemonic, creds.passphrase, true)
      } else {
        // Legacy flow: generate + save in one step
        await this.identity.create(creds.passphrase, true)
      }
      await this.bootstrapAdapters()
      // Write initial profile if provided
      if (creds.displayName || creds.bio) {
        const did = this.identity.getDid()
        const now = new Date().toISOString()
        changeYjsPersonalDoc((doc: any) => {
          doc.profile = {
            did,
            name: creds.displayName || null,
            bio: creds.bio || null,
            avatar: null,
            offersJson: null,
            needsJson: null,
            createdAt: now,
            updatedAt: now,
          }
        })
      }
      await this.setAuthAuthenticated()
      const user = await this.getCurrentUser()
      return user!
    }

    if (method === "mnemonic") {
      await this.identity.unlock(creds.mnemonic, creds.passphrase, true)
      await this.bootstrapAdapters()
      await this.setAuthAuthenticated()
      return (await this.getCurrentUser())!
    }

    if (method === "unlock") {
      await this.identity.unlockFromStorage(creds.passphrase)
      await this.bootstrapAdapters()
      await this.setAuthAuthenticated()
      return (await this.getCurrentUser())!
    }

    throw new Error(`Unknown auth method: ${method}`)
  }

  /**
   * Delete the locally stored identity directly, without the adapter teardown
   * that logout() runs first. logout() only reaches deleteStoredIdentity() after
   * several awaited disconnects (replication/ws/outbox, deleteYjsPersonalDocDB) —
   * any of which could reject and skip it. This guarantees the seed is removed,
   * so a half-finished biometric setup can be rolled back without lockout risk.
   */
  async deleteStoredIdentity(): Promise<void> {
    await this.identity.deleteStoredIdentity()
  }

  override async logout(): Promise<void> {
    this.closeCurrentHandle()
    this.crossGroupUnsub?.()
    this.crossGroupIndex?.stop()
    this.crossGroupIndex = null
    this.privateSpaceId = null
    this.spacesSubscriptionUnsub?.()
    this.personalDocUnsub?.()
    await this.replication?.stop()
    await this.outboxAdapter?.disconnect()
    await this.wsAdapter?.disconnect()

    this.contactsUnsub?.()
    this.contactsUnsub = null
    this.verificationsUnsub?.()
    this.verificationsUnsub = null
    this.attestationsUnsub?.()
    this.attestationsUnsub = null
    this.profileUnsub?.()
    this.profileUnsub = null
    this.storage = null

    this.wsAdapter = null
    this.outboxAdapter = null
    this.replication = null
    this.groupKeyService = null
    this.currentGroupId = null
    this.currentGroupObservable.set(null)
    this.groupsCache = []
    this.groupsObservable.set([])

    // Reset auth-scoped WoT observables so the logged-out or identity-switched
    // UI cannot keep rendering stale confirmations, contacts, relay state, or
    // pending-outbox counts from the previous session.
    this.confirmationsObs.set([])
    this.contactsObs.set([])
    this.outboxCountObs.set(0)
    this.relayStateObs.set("disconnected")
    this.profileObs.set(null)
    this.syncPendingObs.set(false)

    await deleteYjsPersonalDocDB()
    await this.identity.deleteStoredIdentity()

    // Clear identity switch marker
    try { localStorage.removeItem("rls-wot-active-did") } catch { /* ignore */ }

    this.currentUserObs.set(null)
    this.authStateObs.set({ status: "unauthenticated" })
    this.notifyAllObservers()
  }

  /** Update the local profile in PersonalDoc */
  async updateProfile(updates: { name?: string; bio?: string; avatar?: string }): Promise<User> {
    const did = this.identity.getDid()
    const now = new Date().toISOString()
    changeYjsPersonalDoc((doc: any) => {
      if (!doc.profile) {
        doc.profile = {
          did,
          name: null,
          bio: null,
          avatar: null,
          offersJson: null,
          needsJson: null,
          createdAt: now,
          updatedAt: now,
        }
      }
      if (updates.name !== undefined) doc.profile.name = updates.name || null
      if (updates.bio !== undefined) doc.profile.bio = updates.bio || null
      if (updates.avatar !== undefined) doc.profile.avatar = updates.avatar || null
      doc.profile.updatedAt = now
    })
    // Re-publish to discovery server + notify all contacts
    this.publishProfile().catch(() => {})
    this.broadcastProfileUpdate().catch(() => {})
    return (await this.getCurrentUser())!
  }

  override async updateMyProfile(updates: Partial<Record<string, unknown>>): Promise<Item> {
    const user = await this.updateProfile({
      name: updates.name as string | undefined,
      bio: updates.bio as string | undefined,
      avatar: updates.avatar as string | undefined,
    })
    return (await this.getMyProfile()) ?? {
      id: user.id,
      type: "person",
      createdAt: new Date().toISOString(),
      createdBy: user.id,
      data: { name: user.displayName },
    }
  }

  override async getMyProfile(): Promise<Item | null> {
    return this.profileObs.current
  }

  override observeMyProfile(): Observable<Item | null> {
    return this.profileObs
  }

  override async syncProfile(): Promise<void> {
    this.syncPendingObs.set(true)
    try {
      await this.publishProfile()
    } finally {
      this.syncPendingObs.set(false)
    }
  }

  override isSyncPending(): Observable<boolean> {
    return this.syncPendingObs
  }

  /** Get the current user's DID */
  getDid(): string {
    return this.identity.getDid()
  }

  override async getCurrentUser(): Promise<User | null> {
    return this.currentUserObs.current
  }

  override observeCurrentUser(): Observable<User | null> {
    return this.currentUserObs
  }

  override async getUser(id: string): Promise<User | null> {
    // Lookup cascade: self -> contacts -> HttpDiscovery -> fallback
    try {
      const doc = getYjsPersonalDoc()

      // 1. Own profile (we're not in our own contacts list)
      const ownDid = this.identity.getDid()
      if (id === ownDid) {
        const profile = doc.profile
        return {
          id,
          displayName: profile?.name ?? getDefaultDisplayName(id),
          avatarUrl: profile?.avatar ?? undefined,
        }
      }

      // 2. contacts
      const contact = doc.contacts?.[id]
      if (contact) {
        return {
          id,
          displayName: contact.name ?? getDefaultDisplayName(id),
          avatarUrl: contact.avatar ?? undefined,
        }
      }
    } catch {
      // PersonalDoc not initialized — try network
    }

    // 3. HttpDiscovery
    try {
      const result = await this.discovery.resolveProfile(id)
      return {
        id,
        displayName: result.profile?.name ?? getDefaultDisplayName(id),
        avatarUrl: result.profile?.avatar ?? undefined,
      }
    } catch {
      // Network error — fallback
    }

    // 4. Fallback
    return { id, displayName: getDefaultDisplayName(id) }
  }

  // ==================== Groups ====================

  override async getGroups(): Promise<Group[]> {
    return this.groupsCache
  }

  override getCurrentGroup(): Group | null {
    if (!this.currentGroupId) return null
    return this.groupsCache.find((g) => g.id === this.currentGroupId) ?? null
  }

  override setCurrentGroup(id: string | null): void {
    if (this.currentGroupId === id) return
    this.currentGroupId = id
    this.currentGroupObservable.set(this.getCurrentGroup())

    // Close old handle
    this.closeCurrentHandle()

    if (id === null) {
      // Overview mode reads from CrossGroupIndex — no handle needed
      this.handleReady = Promise.resolve()
      this.notifyAllObservers()
    } else if (this.replication) {
      this.handleReady = this.openCurrentHandle().then(() => this.notifyAllObservers())
    }
  }

  override async createGroup(name: string, data?: Record<string, unknown>): Promise<Group> {
    if (!this.replication) throw new Error("Not authenticated")

    const modules = (data?.modules as string[]) ?? DEFAULT_MODULES
    const initialDoc: RlsSpaceDoc = {
      _type: RLS_SPACE_TYPE,
      items: {},
    }

    const space = await this.replication.createSpace("shared", initialDoc, { name, appTag: RLS_SPACE_TYPE, modules })
    const group = this.spaceToGroup(space)

    // Auto-select first group
    if (!this.currentGroupId) {
      this.setCurrentGroup(group.id)
    }

    return group
  }

  override async updateGroup(id: string, updates: Partial<Group>): Promise<Group> {
    if (id === null) throw new Error("Cannot update personal view")
    if (!this.replication) throw new Error("Not authenticated")

    // All metadata via updateSpace (framework level — syncs via _meta)
    const metaUpdate: Record<string, unknown> = {}
    if (updates.name) metaUpdate.name = updates.name
    if (updates.data?.image !== undefined) metaUpdate.image = updates.data.image as string
    if (updates.data?.modules !== undefined) metaUpdate.modules = updates.data.modules as string[]
    if (Object.keys(metaUpdate).length > 0) {
      await this.replication.updateSpace(id, metaUpdate as any)
    }

    const idx = this.groupsCache.findIndex((g) => g.id === id)
    if (idx !== -1) {
      const group = this.groupsCache[idx]
      this.groupsCache[idx] = {
        ...group,
        name: updates.name ?? group.name,
        data: updates.data ? { ...group.data, ...updates.data } : group.data,
      }
      this.groupsObservable.set([...this.groupsCache])
      return this.groupsCache[idx]
    }
    return { id, name: updates.name ?? "Unknown", ...updates }
  }

  override async deleteGroup(id: string): Promise<void> {
    if (id === null) throw new Error("Cannot delete personal view")
    if (!this.replication) throw new Error("Not authenticated")

    // "Delete" = leave the space: remove self from members, clean up local data
    const did = this.identity.getDid()
    try {
      await this.replication.removeMember(id, did)
    } catch {
      // May fail if already removed or single member
    }

    // Remove space from replication adapter (stops sync, removes from spaces map)
    await this.replication.leaveSpace(id)

    // If this was the current group, switch away
    if (this.currentGroupId === id) {
      this.closeCurrentHandle()
      this.currentGroupId = null
      this.currentGroupObservable.set(null)
      this.notifyAllObservers()
    }
  }

  override async getMembers(groupId: string | null): Promise<User[]> {
    if (!this.replication) return []

    if (groupId === null) {
      // Personal view: union of all members from all shared spaces
      const spaces = await this.replication.getSpaces()
      const allDids = new Set<string>()
      for (const space of spaces) {
        if (space.type === "shared") {
          for (const did of space.members) {
            allDids.add(did)
          }
        }
      }
      const users = await Promise.all(
        [...allDids].map((did) => this.getUser(did))
      )
      return users.filter((u: User | null): u is User => u !== null)
    }

    const space = await this.replication.getSpace(groupId)
    if (!space) return []

    const users = await Promise.all(
      space.members.map((did: string) => this.getUser(did))
    )
    return users.filter((u: User | null): u is User => u !== null)
  }

  private memberObservables = new Map<string | null, ReactiveObservable<User[]>>()

  override observeMembers(groupId: string | null): Observable<User[]> {
    if (!this.memberObservables.has(groupId)) {
      const obs = createObservable<User[]>([])
      this.memberObservables.set(groupId, obs)
      // Load initial members
      void this.getMembers(groupId).then((members) => obs.set(members))
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

  private getEncryptionPublicKeyMultibase(result: {
    didDocument?: { keyAgreement?: Array<{ publicKeyMultibase?: string }> } | null
  }): string | undefined {
    return result.didDocument?.keyAgreement?.find((entry) => entry.publicKeyMultibase)?.publicKeyMultibase
  }

  override async inviteMember(groupId: string, userId: string): Promise<void> {
    if (!this.replication) throw new Error("Not authenticated")

    // Resolve member's encryption public key via discovery
    const result = await this.discovery.resolveProfile(userId)
    const encryptionPublicKey = this.getEncryptionPublicKeyMultibase(result)
    if (!encryptionPublicKey) {
      throw new Error(`Cannot invite ${userId}: encryption key not found`)
    }

    const keyBytes = x25519MultibaseToPublicKeyBytes(encryptionPublicKey)
    await this.replication.addMember(groupId, userId, keyBytes)
    void this.notifyMemberObservers(groupId)
  }

  override async removeMember(groupId: string, userId: string): Promise<void> {
    if (!this.replication) throw new Error("Not authenticated")
    await this.replication.removeMember(groupId, userId)
    void this.notifyMemberObservers(groupId)
  }

  // ==================== Items ====================

  override async getItems(filter?: ItemFilter): Promise<Item[]> {
    await this.handleReady
    const allItems = this.getCachedItems()
    if (allItems.length === 0) return []
    if (!filter) return allItems
    const filtered = allItems.filter((item) => matchesFilter(item, filter))
    return applyPagination(filtered, filter.limit, filter.offset)
  }

  override async getItem(id: string): Promise<Item | null> {
    await this.handleReady
    if (this.currentGroupId === null && this.crossGroupIndex) {
      const entry = this.crossGroupIndex.getAll().get(id)
      return entry?.item ?? null
    }
    const doc = this.getCurrentDoc()
    if (!doc) return null

    const serialized = doc.items?.[id]
    if (!serialized) return null
    return deserializeItem(serialized)
  }

  override async createItem(item: Omit<Item, "id" | "createdAt">): Promise<Item> {
    await this.handleReady

    const id = crypto.randomUUID()
    const newItem: Item = {
      ...item,
      id,
      createdAt: new Date().toISOString(),
    }
    const serialized = serializeItem(newItem)

    // In overview mode, create in private space
    if (this.currentGroupId === null) {
      if (!this.privateSpaceId || !this.replication) {
        throw new Error("Private space not available")
      }
      const privateHandle = await this.replication.openSpace<RlsSpaceDoc>(this.privateSpaceId)
      privateHandle.transact((doc) => {
        if (!doc.items) doc.items = {}
        doc.items[id] = serialized
      })
      privateHandle.close()
      this.crossGroupIndex?.reindexGroup(this.privateSpaceId)
      this.notifyAllObservers()
      return newItem
    }

    const handle = this.currentHandle
    if (!handle) throw new Error("No active group selected")

    handle.transact((doc) => {
      if (!doc.items) doc.items = {}
      doc.items[id] = serialized
    })
    if (this.currentGroupId) this.crossGroupIndex?.reindexGroup(this.currentGroupId)
    this.notifyAllObservers()
    return newItem
  }

  override async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    await this.handleReady

    const handle = await this.resolveHandleForItem(id)

    handle.transact((doc) => {
      const existing = doc.items[id]
      if (!existing) throw new Error(`Item ${id} not found`)

      if (updates.type) existing.type = updates.type
      if (updates.data) {
        // Merge field-by-field; deep-clone values to avoid CRDT reference errors
        for (const [key, value] of Object.entries(updates.data)) {
          existing.data[key] = (typeof value === "object" && value !== null)
            ? JSON.parse(JSON.stringify(value))
            : value as any
        }
      }
      if (updates.relations !== undefined) existing.relations = updates.relations
      if (updates.schema !== undefined) existing.schema = updates.schema
      if (updates.schemaVersion !== undefined) existing.schemaVersion = updates.schemaVersion
      if (updates.tags !== undefined) existing.tags = updates.tags
      if (updates["@context"] !== undefined) existing["@context"] = updates["@context"]
    })

    // Reindex the affected group so CrossGroupIndex reflects local writes
    // (handle.onRemoteUpdate only fires for origin === 'remote')
    if (this.crossGroupIndex) {
      const spaceId = this.currentGroupId ?? this.crossGroupIndex.getItemGroupId(id)
      if (spaceId) this.crossGroupIndex.reindexGroup(spaceId)
    }

    this.notifyAllObservers()
    const updated = await this.getItem(id)
    if (!updated) throw new Error(`Item ${id} disappeared after update`)
    return updated
  }

  override async deleteItem(id: string): Promise<void> {
    await this.handleReady

    const handle = await this.resolveHandleForItem(id)

    // Capture owning space before mutation (after delete, item is gone from index)
    const spaceIdForReindex =
      this.currentGroupId ?? this.crossGroupIndex?.getItemGroupId(id) ?? null

    handle.transact((doc) => {
      delete doc.items[id]
    })

    if (this.crossGroupIndex && spaceIdForReindex) {
      this.crossGroupIndex.reindexGroup(spaceIdForReindex)
    }

    this.notifyAllObservers()
  }

  // ==================== Item-Group Assignment (ItemGroupCapable) ====================

  getItemGroupId(itemId: string): string | null {
    if (this.crossGroupIndex) {
      return this.crossGroupIndex.getItemGroupId(itemId)
    }
    // Fallback: if no index, check current group
    if (this.currentHandle) {
      const doc = this.currentHandle.getDoc()
      if (doc.items?.[itemId]) return this.currentGroupId
    }
    return null
  }

  async moveItemToGroup(itemId: string, targetGroupId: string): Promise<void> {
    await this.handleReady
    if (!this.replication) throw new Error("Not connected")

    const sourceGroupId = this.getItemGroupId(itemId)
    if (!sourceGroupId) throw new Error(`Item ${itemId} not found in any group`)
    if (sourceGroupId === targetGroupId) return

    // Read item from source
    const sourceHandle = await this.replication.openSpace<RlsSpaceDoc>(sourceGroupId)
    const serialized = sourceHandle.getDoc().items?.[itemId]
    if (!serialized) throw new Error(`Item ${itemId} not found in source group`)

    // Write to target
    const targetHandle = await this.replication.openSpace<RlsSpaceDoc>(targetGroupId)
    targetHandle.transact((doc) => {
      if (!doc.items) doc.items = {}
      doc.items[itemId] = serialized
    })

    // Delete from source
    sourceHandle.transact((doc) => {
      delete doc.items[itemId]
    })

    // Reindex both groups
    this.crossGroupIndex?.reindexGroup(sourceGroupId)
    this.crossGroupIndex?.reindexGroup(targetGroupId)

    this.notifyAllObservers()
  }

  /**
   * Resolve the SpaceHandle that owns a given item.
   * In overview view, looks up the group via CrossGroupIndex and opens a handle.
   * In normal group view, returns the current handle.
   */
  private async resolveHandleForItem(itemId: string): Promise<SpaceHandle<RlsSpaceDoc>> {
    if (this.currentGroupId === null && this.crossGroupIndex && this.replication) {
      const spaceId = this.crossGroupIndex.getItemGroupId(itemId)
      if (!spaceId) throw new Error(`Item ${itemId} not found in any space`)
      // The CrossGroupIndex already has handles open for all spaces,
      // so openSpace returns the existing handle (no extra cost)
      return this.replication.openSpace<RlsSpaceDoc>(spaceId)
    }

    if (!this.currentHandle) throw new Error("No active group selected")
    return this.currentHandle
  }

  // ==================== Observables ====================

  override observe(filter: ItemFilter): Observable<Item[]> {
    const key = JSON.stringify(filter)
    let obs = this.itemObservables.get(key)
    if (!obs) {
      // Starts unloaded: `current` is `[]` until the first fetch settles. Set the
      // data, then markLoaded() so consumers can tell "still loading" apart from
      // "loaded, empty" — even when the result is genuinely empty (set([]) on an
      // already-empty observable is a no-op, so markLoaded does the notifying).
      obs = createObservable<Item[]>([], false)
      this.itemObservables.set(key, obs)
      // Load initial data (awaits handleReady internally)
      void this.getItems(filter)
        .then((items) => obs!.set(items))
        .catch((err) => console.error("[WotConnector] observe initial load failed", err))
        .finally(() => obs!.markLoaded())
    }
    return obs
  }

  override observeItem(id: string): Observable<Item | null> {
    let obs = this.itemByIdObservables.get(id)
    if (!obs) {
      obs = createObservable<Item | null>(null)
      this.itemByIdObservables.set(id, obs)
      void this.getItem(id).then((item) => obs!.set(item))
    }
    return obs
  }

  observeRelatedItems(
    itemId: string,
    predicate?: string,
    options?: RelatedItemsOptions
  ): Observable<Item[]> {
    const key = `${itemId}:${predicate ?? ""}:${JSON.stringify(options ?? {})}`
    if (!this.relatedObservables.has(key)) {
      const obs = createObservable<Item[]>([])
      this.relatedObservables.set(key, obs)
      this.relatedObservableParams.set(key, { itemId, predicate, options })
      void this.getRelatedItems(itemId, predicate, options).then((items) => obs.set(items))
    }
    return this.relatedObservables.get(key)!
  }

  // ==================== Internal: Bootstrap ====================

  private async bootstrapAdapters(): Promise<void> {
    const did = this.identity.getDid()

    // Identity switch cleanup
    const prevDid = safeLocalStorage("rls-wot-active-did")
    if (prevDid && prevDid !== did) {
      await this.cleanupOldIdentity()
    }
    try { localStorage.setItem("rls-wot-active-did", did) } catch { /* ignore */ }

    // 1. WebSocket connect (MUST happen before PersonalDoc so it can receive sync messages)
    this.wsAdapter = new CompatibleWebSocketMessagingAdapter(this.config.relayUrl, {
      signBrokerAuthBytes: (signingBytes: Uint8Array) => this.identity.signEd25519(signingBytes),
    })

    // Register relay state listener BEFORE connect so we catch the 'connected' event
    this.wsAdapter.onStateChange((state) => {
      this.relayStateObs.set(state as RelayState)
      // Update PersistenceMetrics so DebugSnapshot reflects relay status
      getMetrics().setRelayStatus(state === "connected", this.config.relayUrl, 0)
      // Retry pending discovery publishes on reconnect
      if (state === "connected") {
        this.syncDiscoveryPending().catch(() => {})
      }
    })

    const personalDocFns = {
      getPersonalDoc: getYjsPersonalDoc,
      changePersonalDoc: changeYjsPersonalDoc,
      onPersonalDocChange: onYjsPersonalDocChange,
    }

    const outboxStore = new PersonalDocOutboxStore(personalDocFns)
    const rawOutbox = new OutboxMessagingAdapter(this.wsAdapter, outboxStore, {
      skipTypes: ["profile-update", "attestation-ack", "personal-sync"] as MessageType[],
    })
    this.outboxAdapter = new TracedOutboxMessagingAdapter(rawOutbox) as unknown as OutboxMessagingAdapter
    await this.wsAdapter.connect(did)

    // 2. PersonalDoc (Yjs-based, multi-device sync)
    await initYjsPersonalDoc(
      this.identity,
      this.outboxAdapter as unknown as MessagingAdapter,
      this.config.vaultUrl,
    )

    // 3. Now that PersonalDoc is ready, connect OutboxAdapter to enable
    //    flush + auto-reconnect. wsAdapter.connect() is idempotent, so this
    //    just triggers flushOutbox() + _startAutoReconnect() without reconnecting.
    await this.outboxAdapter.connect(did)
    const spaceMetadataStorage = new PersonalDocSpaceMetadataStorage(personalDocFns)

    // 4. Group Keys
    this.groupKeyService = new GroupKeyService()

    // 5. CompactStore for Yjs spaces
    const spaceCompactStore = new TracedCompactStorageManager(new CompactStorageManager("rls-yjs-space-compact-store"))
    await spaceCompactStore.open()

    // 6. Replication (Yjs)
    this.replication = new YjsReplicationAdapter({
      identity: this.identity,
      messaging: this.outboxAdapter as unknown as MessagingAdapter,
      groupKeyService: this.groupKeyService,
      metadataStorage: spaceMetadataStorage,
      vaultUrl: this.config.vaultUrl,
      compactStore: spaceCompactStore,
      flushPersonalDoc: flushYjsPersonalDoc,
      refreshPersonalDocFromVault: refreshYjsPersonalDocFromVault,
    })
    await this.replication.start()

    // 7. Outbox pending count → outboxCountObs
    if (outboxStore.watchPendingCount) {
      outboxStore.watchPendingCount().subscribe((count: number) => {
        this.outboxCountObs.set(count)
      })
    }

    // 8. Incoming message handler (verification, space-invite)
    this.wsAdapter.onMessage(async (envelope) => {
      await this.handleIncomingMessage(envelope)
    })

    // 9. Storage adapter for reactive contacts and confirmations
    this.storage = new YjsStorageAdapter(did)

    // PersonalDoc changes -> discover new spaces (not full state broadcast,
    // which would mutate PersonalDoc and create an infinite loop).
    let restoring = false
    let pending = false
    this.personalDocUnsub = onYjsPersonalDocChange(() => {
      if (restoring) { pending = true; return }
      restoring = true
      const run = () => {
        const p = this.replication?.restoreSpacesFromMetadata?.()
        if (!p) { restoring = false; pending = false; return }
        p.catch(() => {})
          .finally(() => {
            if (pending) { pending = false; run() }
            else { restoring = false }
          })
      }
      run()
    })

    // Reactive contacts via StorageAdapter
    this.contactsUnsub = this.storage.watchContacts().subscribe((contacts: any[]) => {
      const mapped: ContactInfo[] = contacts.map((c: any) => ({
        id: c.did,
        publicKey: c.publicKey || undefined,
        name: c.name || undefined,
        avatar: c.avatar || undefined,
        bio: c.bio || undefined,
        status: c.status ?? "pending",
        verifiedAt: c.verifiedAt || undefined,
        createdAt: c.createdAt ?? new Date().toISOString(),
        updatedAt: c.updatedAt ?? new Date().toISOString(),
      }))
      this.contactsObs.set(mapped)
      // Contact profile changed → refresh member observables (displayName/avatar)
      for (const groupId of this.memberObservables.keys()) {
        void this.notifyMemberObservers(groupId)
      }
    })
    // Load initial contacts
    this.contactsObs.set(
      this.storage.watchContacts().getValue().map((c: any) => ({
        id: c.did,
        publicKey: c.publicKey || undefined,
        name: c.name || undefined,
        avatar: c.avatar || undefined,
        bio: c.bio || undefined,
        status: c.status ?? "pending",
        verifiedAt: c.verifiedAt || undefined,
        createdAt: c.createdAt ?? new Date().toISOString(),
        updatedAt: c.updatedAt ?? new Date().toISOString(),
      }))
    )

    // Reactive confirmations via StorageAdapter (verifications + attestations)
    this.verificationsUnsub = this.storage.watchAllVerifications().subscribe(() => this.syncConfirmationsFromPersonalDoc())
    this.attestationsUnsub = this.storage.watchAllAttestations().subscribe(() => this.syncConfirmationsFromPersonalDoc())
    this.syncConfirmationsFromPersonalDoc()

    // Reactive profile via PersonalDoc changes
    let lastProfileKey = ""
    this.profileUnsub = onYjsPersonalDocChange(() => {
      const doc = getYjsPersonalDoc()
      const profile = doc?.profile
      const key = JSON.stringify(profile ?? null)
      if (key !== lastProfileKey) {
        lastProfileKey = key
        this.syncProfileObservable()
      }
    })
    this.syncProfileObservable()

    // 10. CrossGroupIndex for personal view (aggregates items across all shared spaces)
    this.crossGroupIndex = new CrossGroupIndex<RlsSpaceDoc, Item>(
      this.replication,
      (doc) => {
        const map = new Map<string, Item>()
        for (const [id, s] of Object.entries(doc.items ?? {})) {
          map.set(id, deserializeItem(s))
        }
        return map
      },
      (item) => item.type,
      { groupFilter: (info) => info.type === "shared" },
    )
    this.crossGroupIndex.start()
    this.crossGroupUnsub = this.crossGroupIndex.onChange(() => {
      if (this.currentGroupId === null) {
        this.notifyAllObservers()
      }
    })

    // 11. Watch spaces for reactive group list
    const spacesSubscribable = this.replication.watchSpaces()
    this.spacesSubscriptionUnsub = spacesSubscribable.subscribe((spaces: SpaceInfo[]) => {
      this.updateGroupsFromSpaces(spaces)
    })
    // Load initial spaces
    this.updateGroupsFromSpaces(spacesSubscribable.getValue())

    // 12. Ensure private space exists (hidden space for personal items)
    const allSpaces = this.replication.watchSpaces().getValue()
    const existingPrivate = allSpaces.find((s) => s.appTag === "rls-private")
    if (existingPrivate) {
      this.privateSpaceId = existingPrivate.id
    } else {
      const initialDoc = { _type: "rls", items: {} } as unknown as RlsSpaceDoc
      const created = await this.replication.createSpace("shared", initialDoc, {
        name: "Privat",
        appTag: "rls-private",
        modules: DEFAULT_MODULES,
      })
      this.privateSpaceId = created.id
    }

    // 13. Sync contact profiles from discovery server (non-blocking)
    this.syncContactProfiles().catch(() => {})
  }

  private async setAuthAuthenticated(): Promise<void> {
    const user = await this.getCurrentUser()
    if (user) {
      this.authStateObs.set({ status: "authenticated", user })
    }
    // Publish profile to discovery server (non-blocking)
    this.publishProfile().catch(() => {})
  }

  private async publishProfile(): Promise<void> {
    const did = this.identity.getDid()
    const doc = getYjsPersonalDoc()
    const profile: PublicProfile = {
      did,
      name: doc.profile?.name ?? getDefaultDisplayName(did),
      ...(doc.profile?.bio ? { bio: doc.profile.bio } : {}),
      ...(doc.profile?.avatar ? { avatar: doc.profile.avatar } : {}),
      updatedAt: new Date().toISOString(),
    }
    await this.discovery.publishProfile(profile, this.identity)
  }

  /** Notify all contacts about a profile change (fire-and-forget via relay) */
  private async broadcastProfileUpdate(): Promise<void> {
    if (!this.storage || !this.outboxAdapter) return
    const did = this.identity.getDid()
    const doc = getYjsPersonalDoc()
    const name = doc.profile?.name ?? getDefaultDisplayName(did)

    const avatar = doc.profile?.avatar ?? undefined
    const sign = this.identity.sign.bind(this.identity)
    const contacts = await this.storage.getContacts()
    for (const contact of contacts) {
      const envelope: MessageEnvelope = {
        v: 1,
        id: crypto.randomUUID(),
        type: "profile-update" as MessageType,
        fromDid: did,
        toDid: contact.did,
        createdAt: new Date().toISOString(),
        encoding: "json",
        payload: JSON.stringify({ did, name, ...(avatar ? { avatar } : {}) }),
        signature: "",
      }
      await signEnvelope(envelope, sign)
      this.outboxAdapter.send(envelope).catch(() => {})
    }
  }

  /** Sync all contact profiles from discovery server (called on init, parallel) */
  private async syncContactProfiles(): Promise<void> {
    if (!this.storage) return
    const contacts = await this.storage.getContacts()
    const storage = this.storage
    await Promise.allSettled(contacts.map(async (contact) => {
      const result = await this.discovery.resolveProfile(contact.did)
      const profile = result.profile
      if (!profile?.name) return

      const needsUpdate =
        (contact.name || null) !== (profile.name || null) ||
        (contact.avatar || null) !== (profile.avatar || null) ||
        (contact.bio || null) !== (profile.bio || null)

      if (needsUpdate) {
        await storage.updateContact({
          ...contact,
          name: profile.name,
          ...(profile.avatar ? { avatar: profile.avatar } : {}),
          ...(profile.bio ? { bio: profile.bio } : {}),
        })
      }
    }))
  }

  /** Retry all pending discovery publish operations (profile, verifications, attestations) */
  private async syncDiscoveryPending(): Promise<void> {
    const did = this.identity.getDid()
    await this.discovery.syncPending(did, this.identity, async () => {
      const doc = getYjsPersonalDoc()
      const profile: PublicProfile = {
        did,
        name: doc.profile?.name ?? getDefaultDisplayName(did),
        ...(doc.profile?.bio ? { bio: doc.profile.bio } : {}),
        ...(doc.profile?.avatar ? { avatar: doc.profile.avatar } : {}),
        updatedAt: new Date().toISOString(),
      }
      return { profile }
    })
  }

  // ==================== Internal: Space/Group mapping ====================

  private updateGroupsFromSpaces(spaces: SpaceInfo[]): void {
    // All shared spaces are groups — WoT and RLS spaces are fully compatible
    // Track private space ID + filter it from visible groups
    const privateSpace = spaces.find((s) => s.appTag === "rls-private")
    if (privateSpace) {
      this.privateSpaceId = privateSpace.id
    }

    const realGroups = spaces
      .filter((s) => s.type === "shared" && s.appTag !== "rls-private")
      .map((s) => this.spaceToGroup(s))

    this.groupsCache = realGroups

    // Update the reactive observable (inherited from BaseConnector)
    this.groupsObservable.set([...this.groupsCache])

    // Keep currentGroup observable in sync (group metadata may have changed)
    if (this.currentGroupId) {
      this.currentGroupObservable.set(
        this.groupsCache.find((g) => g.id === this.currentGroupId) ?? null
      )
    }

    // Update member observables for any group that has active subscribers
    for (const groupId of this.memberObservables.keys()) {
      void this.notifyMemberObservers(groupId)
    }

    // Notify observers when in overview mode (null) so items refresh
    if (this.currentGroupId === null) {
      this.notifyAllObservers()
    }
  }

  private spaceToGroup(space: SpaceInfo): Group {
    return {
      id: space.id,
      name: space.name ?? "Unnamed Space",
      members: space.members,
      data: {
        scope: "group",
        modules: space.modules ?? DEFAULT_MODULES,
        ...(space.image ? { image: space.image } : {}),
      },
    }
  }

  // ==================== Internal: Handle management ====================

  private async openCurrentHandle(): Promise<void> {
    if (!this.replication || !this.currentGroupId) return

    try {
      this.currentHandle = await this.replication.openSpace<RlsSpaceDoc>(this.currentGroupId)

      // Listen for remote updates -> refresh observables
      this.handleRemoteUnsub = this.currentHandle!.onRemoteUpdate(() => {
        this.notifyAllObservers()
      })
    } catch (err) {
      console.error("[WotConnector] Failed to open space:", err)
      this.currentHandle = null
    }
  }

  private closeCurrentHandle(): void {
    this.handleRemoteUnsub?.()
    this.handleRemoteUnsub = null
    this.currentHandle?.close()
    this.currentHandle = null
    this.invalidateItemCache()
  }

  private getCurrentDoc(): RlsSpaceDoc | null {
    if (!this.currentHandle) return null
    try {
      return this.currentHandle.getDoc()
    } catch {
      return null
    }
  }

  // ==================== Internal: Observers ====================

  private notifyAllObservers(): void {
    this.invalidateItemCache()
    if (this.notifyScheduled) return
    this.notifyScheduled = true
    queueMicrotask(() => {
      this.notifyScheduled = false
      this.notifyAllObserversNow()
    })
  }

  private invalidateItemCache(): void {
    this.itemCache = null
  }

  private getCachedItems(): Item[] {
    if (!this.itemCache) {
      if (this.currentGroupId === null && this.crossGroupIndex) {
        this.itemCache = [...this.crossGroupIndex.getAll().values()].map((e) => e.item)
      } else {
        const doc = this.getCurrentDoc()
        this.itemCache = doc ? Object.values(doc.items ?? {}).map(deserializeItem) : []
      }
    }
    return this.itemCache
  }

  private notifyAllObserversNow(): void {
    const isPersonal = this.currentGroupId === null
    const doc = isPersonal ? null : this.getCurrentDoc()
    const allItems = this.getCachedItems()
    const hasData = isPersonal ? this.crossGroupIndex != null : doc != null

    // Update item list observables
    for (const [key, obs] of this.itemObservables) {
      const filter: ItemFilter = JSON.parse(key)
      if (!hasData) {
        obs.set([])
      } else {
        const filtered = allItems.filter((item) => matchesFilter(item, filter))
        obs.set(applyPagination(filtered, filter.limit, filter.offset))
      }
    }

    // Update single-item observables
    for (const [id, obs] of this.itemByIdObservables) {
      if (!hasData) {
        obs.set(null)
      } else if (isPersonal && this.crossGroupIndex) {
        const entry = this.crossGroupIndex.getAll().get(id)
        obs.set(entry?.item ?? null)
      } else if (doc) {
        const serialized = doc.items?.[id]
        obs.set(serialized ? deserializeItem(serialized) : null)
      } else {
        obs.set(null)
      }
    }

    // Update related-items observables
    for (const [key, obs] of this.relatedObservables) {
      const params = this.relatedObservableParams.get(key)
      if (params) {
        const related = findRelatedItems(params.itemId, allItems, params.predicate, params.options)
        obs.set(related)
      }
    }
  }

  // ==================== Contacts ====================

  override async getContacts(): Promise<ContactInfo[]> {
    return this.contactsObs.current
  }

  override observeContacts(): Observable<ContactInfo[]> {
    return this.contactsObs
  }

  override async addContact(id: string, name?: string): Promise<ContactInfo> {
    const now = new Date().toISOString()

    // Try Discovery lookup for name/publicKey/avatar
    let publicKey: string | undefined
    let resolvedName = name
    let avatar: string | undefined
    let bio: string | undefined
    try {
      const result = await this.discovery.resolveProfile(id)
      if (result.profile) {
        resolvedName = resolvedName ?? result.profile.name ?? undefined
        avatar = result.profile.avatar ?? undefined
        bio = result.profile.bio ?? undefined
        publicKey = this.getEncryptionPublicKeyMultibase(result)
      }
    } catch {
      // Discovery unavailable — add with what we have
    }

    const contact: ContactInfo = {
      id,
      publicKey,
      name: resolvedName,
      avatar,
      bio,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    }

    if (this.storage) {
      await this.storage.addContact({
        did: id,
        publicKey: publicKey ?? "",
        name: resolvedName,
        status: "pending",
        avatar,
        bio,
        createdAt: now,
        updatedAt: now,
      })
    }

    return contact
  }

  override async activateContact(id: string): Promise<void> {
    if (this.storage) {
      const existing = await this.storage.getContact(id)
      if (existing) {
        existing.status = "active"
        existing.updatedAt = new Date().toISOString()
        await this.storage.updateContact(existing)
      }
    }
  }

  override async updateContactName(id: string, name: string): Promise<void> {
    if (this.storage) {
      const existing = await this.storage.getContact(id)
      if (existing) {
        existing.name = name
        existing.updatedAt = new Date().toISOString()
        await this.storage.updateContact(existing)
      }
    }
  }

  override async removeContact(id: string): Promise<void> {
    if (this.storage) {
      await this.storage.removeContact(id)
    }
  }

  // ==================== Messaging ====================

  override getRelayState(): Observable<RelayState> {
    return this.relayStateObs
  }

  override getOutboxPendingCount(): Observable<number> {
    return this.outboxCountObs
  }

  // ==================== Confirmation writing ====================

  override async issueConfirmation(input: ConfirmationIssueInput): Promise<ConfirmationView> {
    const { subjectId, claim, tags } = input
    const attestation = await this.attestationWorkflow.createAttestation({
      issuer: this.identity,
      subjectDid: subjectId,
      claim,
      tags,
    })
    const did = attestation.from
    const id = attestation.id
    const now = attestation.createdAt

    // Store as attestation in PersonalDoc
    changeYjsPersonalDoc((doc: any) => {
      if (!doc.attestations) doc.attestations = {} as any
      doc.attestations[id] = {
        id,
        attestationId: id,
        fromDid: did,
        toDid: subjectId,
        claim,
        tagsJson: tags ? JSON.stringify(tags) : null,
        context: null,
        createdAt: now,
        vcJws: attestation.vcJws,
      } as any
      if (!doc.attestationMetadata) doc.attestationMetadata = {} as any
      doc.attestationMetadata[id] = {
        attestationId: id,
        accepted: true,
        acceptedAt: now,
        deliveryStatus: "queued",
      } as any
    })
    this.syncConfirmationsFromPersonalDoc()

    // Send attestation via relay
    if (this.outboxAdapter) {
      const envelope: MessageEnvelope = {
        v: 1,
        id,
        type: "attestation" as MessageType,
        fromDid: did,
        toDid: subjectId,
        createdAt: now,
        encoding: "json",
        payload: JSON.stringify(attestation),
        signature: attestation.vcJws,
      }
      this.outboxAdapter.send(envelope).then((receipt) => {
        const status = receipt.reason === "queued-in-outbox" ? "queued" : "delivered"
        changeYjsPersonalDoc((doc: any) => {
          if (doc.attestationMetadata?.[id]) {
            doc.attestationMetadata[id].deliveryStatus = status
          }
        })
        this.syncConfirmationsFromPersonalDoc()
      }).catch(() => {
        changeYjsPersonalDoc((doc: any) => {
          if (doc.attestationMetadata?.[id]) {
            doc.attestationMetadata[id].deliveryStatus = "failed"
          }
        })
        this.syncConfirmationsFromPersonalDoc()
      })
    }

    return {
      id,
      issuerId: did,
      subjectId,
      claim,
      ...(tags ? { tags } : {}),
      schema: "wot:attestation",
      createdAt: now,
      trustLevel: "signed-attested",
      source: "wot",
      isAccepted: true,
    }
  }

  override async setConfirmationAccepted(id: string, accepted: boolean): Promise<void> {
    changeYjsPersonalDoc((doc: any) => {
      if (doc.attestationMetadata?.[id]) {
        doc.attestationMetadata[id].accepted = accepted
        doc.attestationMetadata[id].acceptedAt = accepted ? new Date().toISOString() : null
      }
    })
    // Metadata-only changes do not trigger the verifications/attestations
    // watchers, so refresh the confirmation projection explicitly. Other
    // metadata-only update paths call this at their own mutation sites.
    this.syncConfirmationsFromPersonalDoc()
  }

  // ==================== Encounter verification ====================

  override async createVerificationChallenge(): Promise<VerificationChallenge> {
    const displayName = getYjsPersonalDoc()?.profile?.name ?? getDefaultDisplayName(this.identity.getDid())
    const { code, challenge } = await this.verificationWorkflow.createChallenge(this.identity, displayName)
    const nonce = challenge.nonce
    this.pendingChallenge = { code, nonce }
    return { code, nonce }
  }

  override async prepareVerificationResponse(challengeCode: string): Promise<EncounterPeerInfo> {
    const parsed = JSON.parse(atob(challengeCode))
    const peerId = parsed.fromDid as string
    let peerName = parsed.fromName as string | undefined
    let peerAvatar: string | undefined

    // Resolve avatar from local contacts first, then discovery
    const contact = this.contactsObs.current.find((c) => c.id === peerId)
    if (contact) {
      peerName = peerName ?? contact.name ?? undefined
      peerAvatar = contact.avatar ?? undefined
    }
    if (!peerAvatar) {
      try {
        const result = await this.discovery.resolveProfile(peerId)
        peerAvatar = result.profile?.avatar ?? undefined
        peerName = peerName ?? result.profile?.name ?? undefined
      } catch { /* ignore */ }
    }

    return { peerId, peerName, peerAvatar }
  }

  override async confirmVerificationResponse(challengeCode: string): Promise<void> {
    const did = this.identity.getDid()

    // Parse to get the peer's info
    const parsed = JSON.parse(atob(challengeCode))
    const peerDid = parsed.fromDid
    const peerName = parsed.fromName as string | undefined
    const peerPublicKey = parsed.fromPublicKey as string | undefined
    const nonce = parsed.nonce

    // Create our verification of the peer (from=us, to=peer)
    const verification = await this.verificationWorkflow.createVerificationFor(this.identity, peerDid, nonce)

    // Add contact if not exists, activate if pending
    const now = new Date().toISOString()
    let resolvedName = peerName
    let avatar: string | undefined
    let bio: string | undefined
    let publicKey = peerPublicKey
    try {
      const result = await this.discovery.resolveProfile(peerDid)
      if (result.profile) {
        resolvedName = resolvedName ?? result.profile.name ?? undefined
        avatar = result.profile.avatar ?? undefined
        bio = result.profile.bio ?? undefined
        publicKey = publicKey ?? this.getEncryptionPublicKeyMultibase(result)
      }
    } catch { /* Discovery unavailable */ }

    // Store verification + add/activate contact in PersonalDoc
    changeYjsPersonalDoc((doc: any) => {
      if (!doc.verifications) doc.verifications = {} as any
      doc.verifications[verification.id] = {
        id: verification.id,
        fromDid: verification.from,
        toDid: verification.to,
        timestamp: verification.timestamp,
        proofJson: JSON.stringify(verification.proof),
        locationJson: null,
      } as any

      // Add or activate the contact
      if (!doc.contacts) doc.contacts = {} as any
      if (!doc.contacts[peerDid]) {
        doc.contacts[peerDid] = {
          did: peerDid,
          publicKey: publicKey ?? "",
          name: resolvedName ?? null,
          avatar: avatar ?? null,
          bio: bio ?? null,
          status: "active",
          createdAt: now,
          updatedAt: now,
        } as any
      } else {
        doc.contacts[peerDid].status = "active"
        doc.contacts[peerDid].updatedAt = now
        if (resolvedName && !doc.contacts[peerDid].name) doc.contacts[peerDid].name = resolvedName as any
      }
    })

    // Send verification to peer via relay
    if (this.outboxAdapter) {
      const envelope: MessageEnvelope = {
        v: 1,
        id: verification.id,
        type: "verification",
        fromDid: did,
        toDid: peerDid,
        createdAt: now,
        encoding: "json",
        payload: JSON.stringify(verification),
        signature: verification.proof.proofValue,
      }
      this.outboxAdapter.send(envelope).catch(() => {}) // Non-blocking — outbox handles retry
    }

    // Sync confirmations so the verification we just wrote is in confirmation projection
    this.syncConfirmationsFromPersonalDoc()
    // Check if mutual (we just sent ours, peer's may already exist)
    this.checkMutualVerification(peerDid)
  }

  override async counterVerify(targetId: string): Promise<void> {
    const did = this.identity.getDid()
    const nonce = crypto.randomUUID()
    const verification = await this.verificationWorkflow.createVerificationFor(this.identity, targetId, nonce)
    const now = new Date().toISOString()

    // Resolve peer profile + add/activate contact
    let resolvedName: string | undefined
    let avatar: string | undefined
    let bio: string | undefined
    let publicKey: string | undefined
    try {
      const result = await this.discovery.resolveProfile(targetId)
      if (result.profile) {
        resolvedName = result.profile.name ?? undefined
        avatar = result.profile.avatar ?? undefined
        bio = result.profile.bio ?? undefined
        publicKey = this.getEncryptionPublicKeyMultibase(result)
      }
    } catch { /* Discovery unavailable */ }

    changeYjsPersonalDoc((doc: any) => {
      if (!doc.verifications) doc.verifications = {} as any
      doc.verifications[verification.id] = {
        id: verification.id,
        fromDid: verification.from,
        toDid: verification.to,
        timestamp: verification.timestamp,
        proofJson: JSON.stringify(verification.proof),
        locationJson: null,
      } as any

      // Add or activate contact
      if (!doc.contacts) doc.contacts = {} as any
      if (!doc.contacts[targetId]) {
        doc.contacts[targetId] = {
          did: targetId,
          publicKey: publicKey ?? "",
          name: resolvedName ?? null,
          avatar: avatar ?? null,
          bio: bio ?? null,
          status: "active",
          createdAt: now,
          updatedAt: now,
        } as any
      } else {
        doc.contacts[targetId].status = "active"
        doc.contacts[targetId].updatedAt = now
      }
    })

    // Send via relay
    if (this.outboxAdapter) {
      const envelope: MessageEnvelope = {
        v: 1,
        id: verification.id,
        type: "verification",
        fromDid: did,
        toDid: targetId,
        createdAt: now,
        encoding: "json",
        payload: JSON.stringify(verification),
        signature: verification.proof.proofValue,
      }
      this.outboxAdapter.send(envelope).catch(() => {})
    }

    // Sync confirmations so the counter-verification we just wrote is in confirmation projection
    this.syncConfirmationsFromPersonalDoc()
    // Check if mutual (we just counter-verified, so both sides exist now)
    this.checkMutualVerification(targetId)
  }

  override getVerificationStatus(contactId: string): VerificationDirection {
    const did = this.identity.getDid()
    const verifications = this.confirmationsObs.current.filter(isVerificationConfirmation)
    const outgoing = verifications.some((c) => c.issuerId === did && c.subjectId === contactId)
    const incoming = verifications.some((c) => c.issuerId === contactId && c.subjectId === did)
    if (outgoing && incoming) return "mutual"
    if (outgoing) return "outgoing"
    if (incoming) return "incoming"
    return "none"
  }

  // ==================== Confirmations (generic projection) ====================

  override async getConfirmations(): Promise<ConfirmationView[]> {
    return this.confirmationsObs.current
  }

  override observeConfirmations(): Observable<ConfirmationView[]> {
    return this.confirmationsObs
  }

  // ==================== Incoming Events ====================

  onIncomingEvent(callback: (event: IncomingEvent) => void): () => void {
    this.eventCallbacks.add(callback)
    return () => { this.eventCallbacks.delete(callback) }
  }

  private emitEvent(event: IncomingEvent): void {
    for (const cb of this.eventCallbacks) {
      try { cb(event) } catch { /* ignore callback errors */ }
    }
  }

  private async handleIncomingMessage(envelope: MessageEnvelope): Promise<void> {
    const did = this.identity.getDid()

    if (envelope.type === "verification" && envelope.toDid === did) {
      // Incoming verification — verify signature, save, emit event
      try {
        const verification = JSON.parse(envelope.payload)
        if (!verification.id || !verification.from || !verification.to || !verification.proof) return

        const isValid = await this.verificationWorkflow.verifySignature(verification)
        if (!isValid) return

        // Save to PersonalDoc
        changeYjsPersonalDoc((doc: any) => {
          if (!doc.verifications) doc.verifications = {} as any
          doc.verifications[verification.id] = {
            id: verification.id,
            fromDid: verification.from,
            toDid: verification.to,
            timestamp: verification.timestamp,
            proofJson: JSON.stringify(verification.proof),
            locationJson: null,
          } as any
        })
        this.syncConfirmationsFromPersonalDoc()

        // Check if this matches our pending challenge nonce (= they scanned our QR)
        const nonce = this.pendingChallenge?.nonce
        if (nonce && verification.id.includes(nonce)) {
          this.pendingChallenge = null // Nonce consumed

          // Resolve peer info (local contacts first, discovery as fallback)
          const knownContact = this.contactsObs.current.find((c) => c.id === verification.from)
          let peerName = knownContact?.name ?? undefined
          let peerAvatar = knownContact?.avatar ?? undefined
          if (!peerName) {
            try {
              const result = await this.discovery.resolveProfile(verification.from)
              peerName = result.profile?.name ?? undefined
              peerAvatar = result.profile?.avatar ?? undefined
            } catch { /* ignore */ }
          }

          this.emitEvent({
            type: "incoming-verification",
            fromId: verification.from,
            fromName: peerName,
            fromAvatar: peerAvatar,
            challengeCode: envelope.payload, // Pass for counter-verify
          })
        }

        // Check for mutual verification
        this.checkMutualVerification(verification.from)
      } catch { /* ignore malformed */ }
    }

    if (envelope.type === "space-invite" && envelope.toDid === did) {
      try {
        const payload = JSON.parse(envelope.payload)
        let inviterName: string | undefined
        const contact = this.contactsObs.current.find((c) => c.id === envelope.fromDid)
        inviterName = contact?.name ?? undefined
        if (!inviterName) {
          try {
            const result = await this.discovery.resolveProfile(envelope.fromDid)
            inviterName = result.profile?.name ?? undefined
          } catch { /* ignore */ }
        }

        this.emitEvent({
          type: "space-invite",
          fromId: envelope.fromDid,
          fromName: inviterName,
          spaceId: payload.spaceId,
          spaceName: payload.spaceInfo?.name ?? payload.spaceName ?? "Unnamed Space",
          spaceImage: payload.spaceInfo?.image ?? undefined,
        })
      } catch { /* ignore malformed */ }
    }

    if (envelope.type === "attestation" && envelope.toDid === did) {
      try {
        const attestation = JSON.parse(envelope.payload)
        if (!attestation.id || !attestation.from || !attestation.to || !attestation.vcJws) return
        if (!(await this.attestationWorkflow.verifyAttestation(attestation))) return

        // Store in PersonalDoc
        changeYjsPersonalDoc((doc: any) => {
          if (!doc.attestations) doc.attestations = {} as any
          doc.attestations[attestation.id] = {
            id: attestation.id,
            attestationId: attestation.id,
            fromDid: attestation.from,
            toDid: attestation.to,
            claim: attestation.claim,
            tagsJson: attestation.tags ? JSON.stringify(attestation.tags) : null,
            context: attestation.context ?? null,
            createdAt: attestation.createdAt,
            vcJws: attestation.vcJws,
          } as any
          if (!doc.attestationMetadata) doc.attestationMetadata = {} as any
          doc.attestationMetadata[attestation.id] = {
            attestationId: attestation.id,
            accepted: false,
            acceptedAt: null,
            deliveryStatus: null,
          } as any
        })

        // Send ACK (fire-and-forget)
        if (this.outboxAdapter) {
          const ackEnvelope: MessageEnvelope = {
            v: 1,
            id: `ack-${attestation.id}`,
            type: "attestation-ack" as MessageType,
            fromDid: did,
            toDid: attestation.from,
            createdAt: new Date().toISOString(),
            encoding: "json",
            payload: JSON.stringify({ attestationId: attestation.id }),
            signature: "",
          }
          signEnvelope(ackEnvelope, this.identity.sign.bind(this.identity))
            .then((signed) => this.outboxAdapter!.send(signed))
            .catch(() => {})
        }

        // Emit event for UI
        const contact = this.contactsObs.current.find((c) => c.id === attestation.from)
        this.emitEvent({
          type: "incoming-claim",
          fromId: attestation.from,
          fromName: contact?.name,
          claimId: attestation.id,
        })
      } catch { /* ignore malformed */ }
    }

    if (envelope.type === "attestation-ack" && envelope.toDid === did) {
      try {
        const { attestationId } = JSON.parse(envelope.payload)
        if (!attestationId) return

        // Update delivery status in PersonalDoc
        changeYjsPersonalDoc((doc: any) => {
          if (doc.attestationMetadata?.[attestationId]) {
            doc.attestationMetadata[attestationId].deliveryStatus = "acknowledged"
          }
        })
        this.syncConfirmationsFromPersonalDoc()
      } catch { /* ignore malformed */ }
    }

    if (envelope.type === "profile-update") {
      try {
        // Verify signature — reject spoofed profile updates
        const isValid = await verifyEnvelope(envelope)
        if (!isValid) return

        const payload = JSON.parse(envelope.payload)
        if (payload.name && this.storage) {
          const contacts = await this.storage.getContacts()
          const contact = contacts.find((c: any) => c.did === envelope.fromDid)
          if (contact) {
            const needsUpdate =
              (contact.name || null) !== (payload.name || null) ||
              (contact.avatar || null) !== (payload.avatar || null)
            if (needsUpdate) {
              await this.storage.updateContact({
                ...contact,
                name: payload.name,
                ...(payload.avatar ? { avatar: payload.avatar } : {}),
              })
            }
          }
        }
      } catch { /* ignore */ }
    }
  }

  private async checkMutualVerification(peerId: string): Promise<void> {
    const did = this.identity.getDid()
    const verifications = this.confirmationsObs.current.filter(isVerificationConfirmation)
    const outgoing = verifications.some((c) => c.issuerId === did && c.subjectId === peerId)
    const incoming = verifications.some((c) => c.issuerId === peerId && c.subjectId === did)

    if (outgoing && incoming) {
      const contact = this.contactsObs.current.find((c) => c.id === peerId)
      let peerAvatar = contact?.avatar
      let peerName = contact?.name
      // Contact may have just been added without avatar — resolve from discovery
      if (!peerAvatar) {
        try {
          const result = await this.discovery.resolveProfile(peerId)
          peerAvatar = result.profile?.avatar ?? undefined
          peerName = peerName ?? result.profile?.name ?? undefined
        } catch { /* ignore */ }
      }
      this.emitEvent({
        type: "mutual-verification",
        fromId: peerId,
        fromName: peerName,
        fromAvatar: peerAvatar,
      })
    }
  }

  // ==================== Internal: Confirmation sync ====================

  private syncConfirmationsFromPersonalDoc(): void {
    let doc: ReturnType<typeof getYjsPersonalDoc>
    try {
      doc = getYjsPersonalDoc()
    } catch {
      // PersonalDoc not ready yet
      return
    }

    const verifications = doc.verifications ?? {}
    const attestations = doc.attestations ?? {}
    const metadata = doc.attestationMetadata ?? {}

    this.confirmationsObs.set(
      mapPersonalDocConfirmations({
        verifications: verifications as Record<string, { id: string; fromDid: string; toDid: string; timestamp: string }>,
        attestations: attestations as Record<string, { id: string; fromDid: string; toDid: string; claim: string; tagsJson: string | null; createdAt: string }>,
        attestationMetadata: metadata as Record<string, { attestationId: string; accepted: boolean }>,
      }),
    )

  }

  // (syncContactsFromPersonalDoc removed — contacts are now reactive via YjsStorageAdapter.watchContacts())

  private syncProfileObservable(): void {
    try {
      const did = this.identity.getDid()
      const doc = getYjsPersonalDoc()
      const profile = doc?.profile
      const name = profile?.name ?? getDefaultDisplayName(did)
      const avatar = profile?.avatar ?? undefined
      this.profileObs.set({
        id: did,
        type: "person",
        createdAt: profile?.createdAt ?? new Date().toISOString(),
        createdBy: did,
        data: {
          name,
          bio: profile?.bio ?? undefined,
          avatar,
        },
      })
      this.currentUserObs.set({ id: did, displayName: name, avatarUrl: avatar })
      // Own profile changed → refresh member observables (own displayName in member lists)
      for (const groupId of this.memberObservables.keys()) {
        void this.notifyMemberObservers(groupId)
      }
    } catch {
      // PersonalDoc not ready yet
    }
  }

  // ==================== Internal: Cleanup ====================

  private async cleanupOldIdentity(): Promise<void> {
    // Delete old IndexedDB databases to prevent data leaks between identities
    const dbNames = [
      // Yjs databases
      "wot-yjs-compact-store",
      "rls-yjs-space-compact-store",
      // Legacy Automerge databases (cleanup from migration)
      "automerge-personal",
      "automerge-repo",
      "rls-space-compact-store",
      "rls-space-sync-states",
      "wot-compact-store",
      "wot-sync-states",
    ]
    for (const name of dbNames) {
      try {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(name)
          req.onsuccess = () => resolve()
          req.onerror = () => resolve()
          req.onblocked = () => resolve()
        })
      } catch { /* best effort */ }
    }
  }
}

// ==================== Helpers ====================

function safeLocalStorage(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
