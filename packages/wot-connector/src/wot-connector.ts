import type {
  CreateItemInput,
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
  ActivityEntry,
  ActivityLogCapable,
  ScopedActivityLogCapable,
  ScopedActivityEntry,
  NotificationState,
  NotificationStateCapable,
  NotificationStatePatch,
} from "@real-life-stack/data-interface"
import {
  deriveActivitySummary,
  BaseConnector,
  createObservable,
  deriveContext,
  matchesFilter,
  findRelatedItems,
  applyPagination,
  itemDisplayTitle,
  moduleHintsFor,
  maxTs,
  pruneReadEntryKeys,
  type ReactiveObservable,
} from "@real-life-stack/data-interface"

import {
  PersonalDocSpaceMetadataStorage,
  OfflineFirstDiscoveryAdapter,
  GraphCacheService,
  InMemoryPublishStateStore,
  InMemoryGraphCacheStore,
  VerificationWorkflow,
  AttestationWorkflow,
  IdentityWorkflow,
  WebCryptoProtocolCryptoAdapter,
  CompactStorageManager,
  TracedCompactStorageManager,
  getMetrics,
  getDefaultDisplayName,
  signEnvelope,
  verifyEnvelope,
} from "@real-life/wot-core"
import { HttpDiscoveryAdapter } from "@real-life/wot-core/adapters/discovery/http"
import { WebSocketMessagingAdapter } from "@real-life/wot-core/adapters/messaging/websocket"
import {
  IndexedDbIdentitySeedVault,
  IndexedDBDocLogStore,
  IndexedDBKeyManagementAdapter,
  IndexedDBMemberUpdatePendingStore,
  IndexedDBMessageIdHistory,
} from "@real-life/wot-core/adapters/storage/indexeddb"
import {
  decodeBase64Url,
  encryptionKeyMultibaseFromDidDocument,
  isDidcommMessage,
  parseQrChallenge,
  x25519MultibaseToPublicKeyBytes,
} from "@real-life/wot-core/protocol"
import type {
  Attestation,
  SpaceInfo,
  MessageEnvelope,
  IncomingSpaceInvite,
  PublicProfile,
  PublicIdentitySession,
  DeliveryReceipt,
} from "@real-life/wot-core/types"
import type {
  DocLogStore,
  KeyManagementPort,
  MemberUpdatePendingStore,
  MessageIdHistoryPort,
  MessagingAdapter,
  OutboxStore,
  SpaceHandle,
  WireMessage,
} from "@real-life/wot-core/ports"
import {
  YjsReplicationAdapter,
  YjsStorageAdapter,
  getYjsPersonalDoc,
  resetYjsPersonalDoc,
  onYjsPersonalDocChange,
  changeYjsPersonalDoc,
  flushYjsPersonalDoc,
} from "@real-life/adapter-yjs"
import type { YjsCompactStore } from "@real-life/adapter-yjs"

import type {
  WotConnectorConfig,
  WotConnectorRuntimeOverrides,
  WotSyncState,
  RlsSpaceDoc,
  SerializedItem,
  ClosableOutboxStore,
  ClosableYjsCompactStore,
} from "./types.js"
import { serializeItem, deserializeItem } from "./serialization.js"
import { CrossGroupIndex } from "./CrossGroupIndex.js"
import { projectAttestationConfirmations } from "./confirmations.js"
import {
  LocalOutboxStore,
  hasAttestationCorrelations,
} from "./local-outbox-store.js"
import {
  WorkQueueStore,
  type WorkQueue,
  type WorkQueueItem,
} from "./work-queue-store.js"
import {
  createOutboxMessagingRuntime,
  observeDocLogPending,
  type OutboxMessagingRuntime,
} from "./messaging-runtime.js"
import { InboxReceptionHost } from "./inbox-reception-host.js"
import { initNamespacedYjsPersonalDoc } from "./personal-doc-persistence.js"
import {
  ACTIVE_DID_STORAGE_KEY,
  identityDatabaseName,
  wipeIdentityPersistence,
} from "./identity-persistence.js"
import {
  attestationFromVerifiedVc,
  messageIdForAttestation,
  sendAttestationInbox,
  sendAttestationReceipt,
} from "./attestation-wire.js"

// --- Constants ---

const RLS_SPACE_TYPE = "rls"
const DEFAULT_MODULES = ["feed", "kanban", "calendar", "map"]
const CONTACT_PROFILE_REFRESH_INTERVAL_MS = 10_000
const CONTACT_PROFILE_FULL_RESOLVE_INTERVAL_MS = 5 * 60_000
const CONTACT_PROFILE_REFRESH_CONCURRENCY = 3
// Overview mode: setCurrentGroup(null) = show all items from all spaces

type DeliveryStatus = "sending" | "queued" | "delivered" | "acknowledged" | "failed"
const DELIVERY_STATUS_RANK: Record<Exclude<DeliveryStatus, "failed">, number> = {
  sending: 0,
  queued: 1,
  delivered: 2,
  acknowledged: 3,
}
const TERMINAL_DELIVERY_STATUSES = new Set<DeliveryStatus>([
  "delivered",
  "acknowledged",
  "failed",
])

function compareActivity(a: ActivityEntry, b: ActivityEntry): number {
  return b.ts.localeCompare(a.ts) || b.actor.localeCompare(a.actor) || b.id.localeCompare(a.id)
}

function projectPersonItem(
  id: string,
  createdAt: string,
  displayName: string,
  bio?: string | null,
  avatar?: string | null,
): Item {
  const data: Record<string, unknown> = {
    displayName,
    ...(bio !== undefined && bio !== null ? { bio } : {}),
    ...(avatar ? { avatarUrl: avatar } : {}),
  }
  return {
    id,
    "@context": deriveContext("person", data),
    type: "person",
    createdAt,
    createdBy: id,
    data,
  }
}

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

export class WotConnector extends BaseConnector implements ActivityLogCapable, ScopedActivityLogCapable, NotificationStateCapable {
  private config: WotConnectorConfig
  private runtimeOverrides: WotConnectorRuntimeOverrides
  private identity: WorkflowBackedIdentity
  private httpDiscovery: HttpDiscoveryAdapter
  private discovery: OfflineFirstDiscoveryAdapter
  private publishStateStore: InMemoryPublishStateStore
  private graphCacheStore: InMemoryGraphCacheStore
  private graphCacheService: GraphCacheService
  private protocolCrypto = new WebCryptoProtocolCryptoAdapter()
  private verificationWorkflow = new VerificationWorkflow({ crypto: this.protocolCrypto })
  private attestationWorkflow = new AttestationWorkflow({ crypto: this.protocolCrypto })

  // Adapters (initialized after auth)
  private transportAdapter: MessagingAdapter | null = null
  private outboxAdapter: OutboxMessagingRuntime | null = null
  private outboxStore: ClosableOutboxStore | null = null
  private workQueue: WorkQueue | null = null
  private replication: YjsReplicationAdapter | null = null
  private storage: YjsStorageAdapter | null = null
  private inboxReception: InboxReceptionHost | null = null
  private docLogStore: DocLogStore | null = null
  private keyManagement: KeyManagementPort | null = null
  private memberUpdateStore: MemberUpdatePendingStore | null = null
  private messageIdHistory: MessageIdHistoryPort | null = null
  private spaceCompactStore: ClosableYjsCompactStore | null = null
  private durableStores: Array<{ close(): void | Promise<void> }> = []

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
  private privateSpaceReconcile: Promise<void> = Promise.resolve()
  private contactsUnsub: (() => void) | null = null
  private attestationsUnsub: (() => void) | null = null

  // Observables (stable references — backing changes on group switch)
  private authStateObs: ReactiveObservable<AuthState>
  private contactsObs: ReactiveObservable<ContactInfo[]>
  private confirmationsObs: ReactiveObservable<ConfirmationView[]>
  private relayStateObs: ReactiveObservable<RelayState>
  private outboxCountObs: ReactiveObservable<number>
  private syncStateObs: ReactiveObservable<WotSyncState>
  private profileObs: ReactiveObservable<Item | null>
  private currentUserObs: ReactiveObservable<User | null>
  private syncPendingObs: ReactiveObservable<boolean>
  /** Activity observables are keyed by their requested limit. */
  private activityObservables = new Map<string, ReactiveObservable<ActivityEntry[]>>()
  private scopedActivityObservables = new Map<string, ReactiveObservable<ScopedActivityEntry[]>>()
  /** Each keyed refresh may only publish the newest request's resolved view. */
  private scopedActivityRefreshGeneration = new Map<string, number>()
  private notificationStateObs = createObservable<NotificationState>({ readEntryKeys: {}, mutedGroupIds: {} })
  private notificationStateUnsub: (() => void) | null = null
  /** A hook observed the state at least once — re-login must rebind the doc subscription. */
  private notificationStateObserved = false
  private activityDirty = false
  /** One active reconciliation plus at most one trailing run per space. */
  private activityReconciliations = new Map<string, { queued: boolean; handle: SpaceHandle<RlsSpaceDoc> }>()
  private scopedRefreshScheduled = false
  /** Distinguishes A→B→A switches: only the newest open request may touch state. */
  private handleOpenGeneration = 0
  private profileUnsub: (() => void) | null = null
  private groupsCache: Group[] = []
  private outboxCountUnsub: (() => void) | null = null
  private workQueueCountUnsub: (() => void) | null = null
  private inboxAttestationUnsub: (() => void) | null = null
  private inboxReceiptUnsub: (() => void) | null = null
  private deliveryReceiptUnsub: (() => void) | null = null
  private spaceInviteUnsub: (() => void) | null = null
  private discoveryRetryCleanup: (() => void) | null = null
  private contactProfileRefreshTimer: ReturnType<typeof setInterval> | null = null
  private contactProfileRefreshInFlight: Promise<void> | null = null
  private contactProfileRefreshGeneration = 0
  private contactProfileLastFullResolveAt = new Map<string, number>()
  private lastSyncStateLog: string | null = null
  private syncStateRefresh: Promise<void> = Promise.resolve()
  private workQueueTimer: ReturnType<typeof setTimeout> | null = null
  /** Monotone Scheduling-Revision (Review B3): nur der NEUESTE Read darf den Timer stoppen/armen. */
  private workQueueScheduleRevision = 0
  private workDrainInFlight: Promise<void> | null = null
  private workDrainGeneration: number | null = null
  private runtimeGeneration = 0
  private deliveryMessageIds = new Map<string, string>()
  private inFlightDeliveryMessageIds = new Set<string>()
  private pendingDeliveryReceipts = new Map<string, DeliveryReceipt>()

  // Incoming event listeners
  private eventCallbacks = new Set<(event: IncomingEvent) => void>()
  /** Events aus dem Init-Fenster (vor App-Subscribe), Replay beim ersten onIncomingEvent. */
  private bufferedEvents: IncomingEvent[] = []

  // Item observables keyed by JSON.stringify(filter)
  private itemObservables = new Map<string, ReactiveObservable<Item[]>>()
  private itemByIdObservables = new Map<string, ReactiveObservable<Item | null>>()
  private relatedObservables = new Map<string, ReactiveObservable<Item[]>>()
  private relatedObservableParams = new Map<string, { itemId: string; predicate?: string; options?: RelatedItemsOptions }>()

  constructor(config: WotConnectorConfig, runtimeOverrides: WotConnectorRuntimeOverrides = {}) {
    super()
    this.config = config
    this.runtimeOverrides = runtimeOverrides
    this.identity = new WorkflowBackedIdentity()
    this.httpDiscovery = new HttpDiscoveryAdapter(config.profilesUrl)
    this.publishStateStore = new InMemoryPublishStateStore()
    this.graphCacheStore = new InMemoryGraphCacheStore()
    this.discovery = new OfflineFirstDiscoveryAdapter(this.httpDiscovery, this.publishStateStore, this.graphCacheStore)
    this.graphCacheService = new GraphCacheService(this.discovery, this.graphCacheStore)
    this.authStateObs = createObservable<AuthState>({ status: "loading" })
    // Contacts load async from local storage during init; start unloaded so the
    // UI can tell "loading contacts" from "loaded, no contacts" (markLoaded after
    // the initial read below).
    this.contactsObs = createObservable<ContactInfo[]>([], false)
    this.confirmationsObs = createObservable<ConfirmationView[]>([])
    this.relayStateObs = createObservable<RelayState>("disconnected")
    this.outboxCountObs = createObservable<number>(0)
    this.syncStateObs = createObservable<WotSyncState>({ logPending: 0, outboxPending: 0, workPending: 0 })
    this.profileObs = createObservable<Item | null>(null)
    this.currentUserObs = createObservable<User | null>(null)
    this.syncPendingObs = createObservable<boolean>(false)
    // Groups load asynchronously from the local space docs (unlike the
    // synchronous Mock/Local connectors). Override the BaseConnector default so
    // the groups observable starts UNLOADED — markLoaded() fires once the
    // initial local spaces are read in init() (see updateGroupsFromSpaces). This
    // lets the UI tell "still loading groups" from "loaded, zero groups" (e.g.
    // the no-access notice for a deep-linked space a user with no groups can't see).
    this.groupsObservable = createObservable<Group[]>([], false)
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
    this.invalidateRuntimeGeneration()
    this.closeCurrentHandle()
    this.crossGroupUnsub?.()
    this.crossGroupIndex?.stop()
    this.activityReconciliations.clear()
    this.crossGroupIndex = null
    this.privateSpaceId = null
    this.spacesSubscriptionUnsub?.()
    this.personalDocUnsub?.()
    this.contactsUnsub?.()
    this.attestationsUnsub?.()
    this.profileUnsub?.()
    this.outboxCountUnsub?.()
    this.inboxAttestationUnsub?.()
    this.inboxReceiptUnsub?.()
    this.deliveryReceiptUnsub?.()
    this.spaceInviteUnsub?.()
    this.spaceInviteUnsub = null
    this.discoveryRetryCleanup?.()
    this.discoveryRetryCleanup = null
    this.stopContactProfileRefresh()
    this.stopWorkQueueTimer?.()
    try { this.inboxReception?.stop() } catch { /* best-effort teardown */ }
    // Jeder awaited Schritt einzeln geguardet (CodeRabbit #143): ein
    // fehlschlagender Adapter darf die restliche Freigabe nicht verhindern.
    try { await this.replication?.stop() } catch (error) { console.warn("[WotConnector] dispose: replication.stop fehlgeschlagen", error) }
    try { await this.outboxAdapter?.disconnect() } catch (error) { console.warn("[WotConnector] dispose: outbox.disconnect fehlgeschlagen", error) }
    try { await resetYjsPersonalDoc() } catch (error) { console.warn("[WotConnector] dispose: personalDoc.reset fehlgeschlagen", error) }
    try { await this.closeRuntimeStores() } catch (error) { console.warn("[WotConnector] dispose: runtimeStores.close fehlgeschlagen", error) }

    for (const obs of this.itemObservables.values()) obs.destroy()
    for (const obs of this.itemByIdObservables.values()) obs.destroy()
    this.itemObservables.clear()
    this.itemByIdObservables.clear()
    for (const obs of this.relatedObservables.values()) obs.destroy()
    this.relatedObservables.clear()
    for (const obs of this.activityObservables.values()) obs.destroy()
    this.activityObservables.clear()
    for (const obs of this.scopedActivityObservables.values()) obs.destroy()
    this.scopedActivityObservables.clear()
    this.scopedActivityRefreshGeneration.clear()
    this.notificationStateUnsub?.()
    this.notificationStateUnsub = null
    this.notificationStateObs.destroy()
    this.authStateObs.destroy()
    this.contactsObs.destroy()
    this.confirmationsObs.destroy()
    this.relayStateObs.destroy()
    this.outboxCountObs.destroy()
    this.syncStateObs.destroy()
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
    // Runtime-Autorität VOR jeder Identity-Mutation entziehen (B1a).
    this.invalidateRuntimeAuthority()
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
   * several awaited disconnects and the DID-scoped persistence wipe —
   * any of which could reject and skip it. This guarantees the seed is removed,
   * so a half-finished biometric setup can be rolled back without lockout risk.
   */
  async deleteStoredIdentity(): Promise<void> {
    await this.identity.deleteStoredIdentity()
  }

  override async logout(): Promise<void> {
    // Inline for the established method-level logout seam, which deliberately
    // binds the real method to a narrow object without the private helpers.
    this.runtimeGeneration = (this.runtimeGeneration ?? 0) + 1
    const did = this.identity.getDid()
    this.closeCurrentHandle()
    this.crossGroupUnsub?.()
    this.crossGroupIndex?.stop()
    this.crossGroupIndex = null
    this.privateSpaceId = null
    this.spacesSubscriptionUnsub?.()
    this.personalDocUnsub?.()
    this.inboxAttestationUnsub?.()
    this.inboxAttestationUnsub = null
    this.inboxReceiptUnsub?.()
    this.inboxReceiptUnsub = null
    this.deliveryReceiptUnsub?.()
    this.deliveryReceiptUnsub = null
    this.spaceInviteUnsub?.()
    this.spaceInviteUnsub = null
    this.discoveryRetryCleanup?.()
    this.discoveryRetryCleanup = null
    this.stopContactProfileRefresh()
    this.stopWorkQueueTimer?.()
    this.inboxReception?.stop()
    this.inboxReception = null
    // Teardown-Resilienz (CodeRabbit #143): KEIN Schritt darf Seed-Löschung,
    // Persistenz-Wipe oder Auth-Reset verhindern. Adapter-/Store-Fehler werden
    // geloggt und übersprungen; Fehler der privacy-kritischen Schritte (Wipe,
    // Seed-Delete) werden gesammelt und NACH dem Auth-Reset geworfen.
    const criticalFailures: unknown[] = []
    const guarded = async (step: string, critical: boolean, fn: () => Promise<unknown> | unknown): Promise<void> => {
      try {
        await fn()
      } catch (error) {
        console.warn(`[WotConnector] logout: ${step} fehlgeschlagen — Restabbau läuft weiter`, error)
        if (critical) criticalFailures.push(error)
      }
    }

    await guarded("replication.stop", false, () => this.replication?.stop())
    await guarded("outbox.disconnect", false, () => this.outboxAdapter?.disconnect())

    this.contactsUnsub?.()
    this.contactsUnsub = null
    this.attestationsUnsub?.()
    this.attestationsUnsub = null
    this.profileUnsub?.()
    this.profileUnsub = null
    this.outboxCountUnsub?.()
    this.outboxCountUnsub = null
    this.storage = null

    this.transportAdapter = null
    this.outboxAdapter = null
    this.replication = null
    this.currentGroupId = null
    this.currentGroupObservable.set(null)
    this.groupsCache = []
    this.groupsObservable.set([])

    // Reset auth-scoped WoT observables so the logged-out or identity-switched
    // UI cannot keep rendering stale confirmations, contacts, relay state, or
    // pending-outbox counts from the previous session.
    this.confirmationsObs.set([])
    this.contactsObs.set([])
    this.bufferedEvents.length = 0 // keine Events über Identitätsgrenzen replayen
    this.outboxCountObs.set(0)
    // Preserve the shape of observers created before workPending was added;
    // connector-owned observers always take the additive branch.
    this.syncStateObs.set("workPending" in this.syncStateObs.current
      ? { logPending: 0, outboxPending: 0, workPending: 0 }
      : { logPending: 0, outboxPending: 0 } as WotSyncState)
    this.relayStateObs.set("disconnected")
    this.profileObs.set(null)
    this.syncPendingObs.set(false)

    await guarded("personalDoc.reset", false, () => resetYjsPersonalDoc())
    await guarded("runtimeStores.close", false, () => this.closeRuntimeStores())
    await guarded("persistence.wipe", true, () => wipeIdentityPersistence(did))
    await guarded("seed.delete", true, () => this.identity.deleteStoredIdentity())

    // Clear identity switch marker + DID-gebundene Pending-Saves
    try { localStorage.removeItem(ACTIVE_DID_STORAGE_KEY) } catch { /* ignore */ }
    try { localStorage.removeItem(`rls-wot-pending-verification-save:${did}`) } catch { /* ignore */ }

    this.currentUserObs.set(null)
    this.authStateObs.set({ status: "unauthenticated" })

    // Activity is identity-scoped too. Clear it synchronously so subscribers
    // cannot retain entries from the just-disposed identity — even when the
    // criticalFailures throw below rejects before an async refresh would land.
    this.activityDirty = false
    for (const observable of this.activityObservables.values()) observable.set([])
    // Stable observable contract (reaktivitaet.md): hooks keep their
    // references across logout/re-login — EMPTY the instances, never drop
    // them from the maps (destroying belongs to dispose() only).
    for (const observable of this.scopedActivityObservables?.values() ?? []) observable.set([])
    this.scopedActivityRefreshGeneration?.clear()
    this.notificationStateUnsub?.()
    this.notificationStateUnsub = null
    this.notificationStateObs?.set({ readEntryKeys: {}, mutedGroupIds: {} })
    this.notifyAllObservers()

    if (criticalFailures.length > 0) {
      // UI ist ausgeloggt (Resets + notify liefen), aber lokale Daten sind evtl.
      // nicht vollständig entfernt — das MUSS beim Aufrufer sichtbar werden.
      const error = new Error("logout: lokale Daten wurden nicht vollständig entfernt")
      ;(error as Error & { failures?: unknown[] }).failures = criticalFailures
      throw error
    }
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
    // OfflineFirstDiscoveryAdapter turns network failure into a dirty profile
    // that syncPending() retries on init/online/visibility. Awaiting here makes
    // sure the dirty marker exists before the UI considers the update complete.
    await this.publishProfile()
    void this.broadcastProfileUpdate().catch(() => {})
    return (await this.getCurrentUser())!
  }

  override async updateMyProfile(updates: Partial<Record<string, unknown>>): Promise<Item> {
    const user = await this.updateProfile({
      name: updates.name as string | undefined,
      bio: updates.bio as string | undefined,
      avatar: updates.avatar as string | undefined,
    })
    return (await this.getMyProfile()) ?? projectPersonItem(
      user.id,
      new Date().toISOString(),
      user.displayName || getDefaultDisplayName(user.id),
      undefined,
      user.avatarUrl,
    )
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

  override isProfileSyncPending(): Observable<boolean> {
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
    const previousGroupId = this.currentGroupId
    // closeCurrentHandle must clean up the old reconciliation state, before the
    // selected id changes.
    this.closeCurrentHandle(previousGroupId)
    this.currentGroupId = id
    this.currentGroupObservable.set(this.getCurrentGroup())

    if (id === null) {
      // Overview mode reads from CrossGroupIndex — no handle needed
      this.handleReady = Promise.resolve()
      this.notifyAllObservers(true)
    } else if (this.replication) {
      this.handleReady = this.openCurrentHandle().then(() => this.notifyAllObservers(true))
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
      this.notifyAllObservers(true)
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
      // Starts unloaded; markLoaded() once the first members fetch settles so
      // consumers can tell "still loading members" from "loaded, no members".
      const obs = createObservable<User[]>([], false)
      this.memberObservables.set(groupId, obs)
      // Load initial members
      void this.getMembers(groupId)
        .then((members) => obs.set(members))
        .catch((err) => console.error("[WotConnector] observeMembers initial load failed", err))
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
    // 0.3.0 membership API: addMember builds the ECIES inbox space-invite,
    // requires the adapter's configured brokerUrls, and sends member updates.
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
      const entry = this.crossGroupIndex.getUniqueById(id)
      return entry?.item ?? null
    }
    const doc = this.getCurrentDoc()
    if (!doc) return null

    const serialized = doc.items?.[id]
    if (!serialized) return null
    return deserializeItem(serialized)
  }

  override async createItem(item: CreateItemInput): Promise<Item> {
    await this.handleReady

    // In overview mode, create in private space
    if (this.currentGroupId === null) {
      await this.queuePrivateSpaceReconcile({ createIfMissing: true })
      if (!this.privateSpaceId || !this.replication) {
        throw new Error("Private space not available")
      }
      const privateHandle = await this.replication.openSpace<RlsSpaceDoc>(this.privateSpaceId)
      try {
        return this.createItemOnHandle(privateHandle, item, this.privateSpaceId)
      } finally {
        privateHandle.close()
      }
    }

    const handle = this.currentHandle
    if (!handle) throw new Error("No active group selected")
    return this.createItemOnHandle(handle, item, this.currentGroupId)
  }

  private createItemOnHandle(
    handle: SpaceHandle<RlsSpaceDoc>,
    item: CreateItemInput,
    spaceId: string,
  ): Item {
    this.requireActivityActor()
    let result: Item | null = null
    let created = false

    handle.transact((doc) => {
      if (!doc.items) doc.items = {}
      if (item.id !== undefined && doc.items[item.id]) {
        result = deserializeItem(doc.items[item.id])
        return
      }

      let id = item.id
      if (id === undefined) {
        do {
          id = crypto.randomUUID()
        } while (doc.items[id])
      }
      const newItem: Item = {
        ...item,
        id,
        createdAt: new Date().toISOString(),
      }
      doc.items[id] = serializeItem(newItem)
      this.appendActivity(doc, "create", newItem)
      result = newItem
      created = true
    })

    if (!result) throw new Error("Item transaction did not produce a result")
    if (created) {
      this.crossGroupIndex?.reindexGroup(spaceId)
      this.notifyAllObservers(true)
    }
    return result
  }

  override async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    await this.handleReady

    const handle = await this.resolveHandleForItem(id)

    this.requireActivityActor()
    handle.transact((doc) => {
      const existing = doc.items[id]
      if (!existing) throw new Error(`Item ${id} not found`)

      if (updates.type) existing.type = updates.type
      if (updates.data) {
        // `updates.data` is the item's COMPLETE new data (callers rebuild it from
        // the existing data — the editor mapper and the kanban reorder both spread
        // it), so reconcile the CRDT map TO it: drop keys that are gone, then
        // set/update the rest. A plain field-by-field merge can never remove a
        // field, so a date/place the user cleared in the edit form would stick.
        // Matches the replace semantics of the local/mock connectors. Deep-clone
        // object values to avoid CRDT cross-reference errors.
        for (const key of Object.keys(existing.data)) {
          if (!(key in updates.data)) delete existing.data[key]
        }
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
      this.appendActivity(doc, "update", deserializeItem(existing))
    })

    // Reindex the affected group so CrossGroupIndex reflects local writes
    // (handle.onRemoteUpdate only fires for origin === 'remote')
    if (this.crossGroupIndex) {
      const spaceId = this.currentGroupId ?? this.crossGroupIndex.getItemGroupId(id)
      if (spaceId) this.crossGroupIndex.reindexGroup(spaceId)
    }

    this.notifyAllObservers(true)
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

    this.requireActivityActor()
    handle.transact((doc) => {
      const existing = doc.items[id]
      if (!existing) return
      this.appendActivity(doc, "delete", deserializeItem(existing))
      delete doc.items[id]
    })

    if (this.crossGroupIndex && spaceIdForReindex) {
      this.crossGroupIndex.reindexGroup(spaceIdForReindex)
    }

    this.notifyAllObservers(true)
  }

  // ==================== Item-Group Assignment (ItemGroupCapable) ====================

  /** The user's personal/private space — the "share with nobody" target. Items
   *  created in overview mode land here; pass this id to moveItemToGroup to make
   *  an item private. */
  getPersonalGroupId(): string | null {
    return this.privateSpaceId
  }

  getItemGroupId(itemId: string): string | null {
    if (this.currentHandle && this.currentGroupId) {
      const doc = this.currentHandle.getDoc()
      if (doc.items?.[itemId]) return this.currentGroupId
    }
    return this.crossGroupIndex?.getItemGroupId(itemId) ?? null
  }

  async moveItemToGroup(itemId: string, targetGroupId: string): Promise<void> {
    await this.handleReady
    if (!this.replication) throw new Error("Not connected")

    this.requireActivityActor()
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
      this.appendActivity(doc, "create", deserializeItem(serialized))
    })

    // Delete from source
    sourceHandle.transact((doc) => {
      this.appendActivity(doc, "delete", deserializeItem(serialized))
      delete doc.items[itemId]
    })

    // Reindex both groups
    this.crossGroupIndex?.reindexGroup(sourceGroupId)
    this.crossGroupIndex?.reindexGroup(targetGroupId)

    this.notifyAllObservers(true)
  }

  async getActivity(options?: { limit?: number }): Promise<ActivityEntry[]> {
    await this.handleReady
    const docs = this.currentGroupId === null && this.crossGroupIndex
      ? this.crossGroupIndex.getDocuments()
      : this.currentHandle ? [this.currentHandle.getDoc()] : []
    const entries = docs.flatMap((doc) => Object.values(doc.activity ?? {}))
      .filter((entry) => entry.action === "create" || entry.action === "update" || entry.action === "delete")
      .sort(compareActivity)
    return options?.limit === undefined ? entries : entries.slice(0, Math.max(0, options.limit))
  }

  observeActivity(options?: { limit?: number }): Observable<ActivityEntry[]> {
    const key = `${options?.limit ?? ""}`
    let observable = this.activityObservables.get(key)
    if (!observable) {
      observable = createObservable<ActivityEntry[]>([])
      this.activityObservables.set(key, observable)
      void this.getActivity(options).then((entries) => observable!.set(entries))
    }
    return observable
  }

  async getScopedActivity(options?: { limit?: number }): Promise<ScopedActivityEntry[]> {
    await this.handleReady
    const documents = this.crossGroupIndex?.getGroupDocuments() ?? (this.currentHandle ? [{ groupId: this.currentGroupId ?? "__personal__", doc: this.currentHandle.getDoc(), members: this.currentHandle.info().members }] : [])
    const resolved = await Promise.all(documents.flatMap(({ groupId, doc, members }) =>
      Object.values(doc.activity ?? {})
        .filter((entry) => entry.action === "create" || entry.action === "update" || entry.action === "delete")
        .map((entry) => this.resolveScopedActivity(groupId, doc, members, entry)),
    ))
    resolved.sort((a, b) => compareActivity(a.entry, b.entry))
    return options?.limit === undefined ? resolved : resolved.slice(0, Math.max(0, options.limit))
  }

  observeScopedActivity(options?: { limit?: number }): Observable<ScopedActivityEntry[]> {
    const key = `${options?.limit ?? ""}`
    let observable = this.scopedActivityObservables.get(key)
    if (!observable) {
      observable = createObservable<ScopedActivityEntry[]>([])
      this.scopedActivityObservables.set(key, observable)
      this.refreshScopedActivity(key, observable, options)
    }
    return observable
  }

  private refreshScopedActivity(key: string, observable: ReactiveObservable<ScopedActivityEntry[]>, options?: { limit?: number }): void {
    const generation = (this.scopedActivityRefreshGeneration.get(key) ?? 0) + 1
    this.scopedActivityRefreshGeneration.set(key, generation)
    void this.getScopedActivity(options).then((entries) => {
      if (this.scopedActivityRefreshGeneration.get(key) === generation && this.scopedActivityObservables.get(key) === observable) observable.set(entries)
    })
  }

  async getNotificationState(): Promise<NotificationState> {
    return this.readNotificationState()
  }

  observeNotificationState(): Observable<NotificationState> {
    this.notificationStateObserved = true
    if (!this.notificationStateUnsub) {
      this.notificationStateUnsub = onYjsPersonalDocChange(() => this.notificationStateObs.set(this.readNotificationState()))
    }
    this.notificationStateObs.set(this.readNotificationState())
    return this.notificationStateObs
  }

  async updateNotificationState(patch: NotificationStatePatch): Promise<void> {
    await this.handleReady
    const deviceId = await this.getOrCreateNotificationDeviceId()
    changeYjsPersonalDoc((doc: any) => {
      const raw = doc.notificationState ?? (doc.notificationState = {})
      raw.lastSeenByDevice ??= {}
      raw.readUpToByDevice ??= {}
      raw.readEntryKeys ??= {}
      raw.mutedGroupIds ??= {}
      if (patch.op === "markSeen") raw.lastSeenByDevice[deviceId] = maxTs(raw.lastSeenByDevice[deviceId], patch.ts)
      if (patch.op === "markAllReadUpTo") raw.readUpToByDevice[deviceId] = maxTs(raw.readUpToByDevice[deviceId], patch.ts)
      // These are shared Yjs maps.  Assigning the record itself turns into a
      // delete-and-rewrite with adapter-yjs, so only ever touch addressed keys.
      if (patch.op === "markRead") for (const [key, ts] of Object.entries(patch.keys)) raw.readEntryKeys[key] = maxTs(raw.readEntryKeys[key], ts)
      if (patch.op === "mute") raw.mutedGroupIds[patch.groupId] = true
      if (patch.op === "unmute") delete raw.mutedGroupIds[patch.groupId]
      const ownState: NotificationState = { readUpToTs: raw.readUpToByDevice[deviceId], readEntryKeys: { ...raw.readEntryKeys }, mutedGroupIds: { ...raw.mutedGroupIds } }
      const prunedKeys = pruneReadEntryKeys(ownState)
      for (const key of prunedKeys) delete raw.readEntryKeys[key]
      if (ownState.readUpToTs) raw.readUpToByDevice[deviceId] = ownState.readUpToTs
    })
    this.notificationStateObs.set(this.readNotificationState())
  }

  private async resolveScopedActivity(groupId: string, doc: RlsSpaceDoc, members: string[], entry: ActivityEntry): Promise<ScopedActivityEntry> {
    const target = doc.items?.[entry.targetId] ? deserializeItem(doc.items[entry.targetId]!) : undefined
    let subject: ScopedActivityEntry["subject"] = null
    if (entry.action === "delete") subject = { id: entry.targetId, type: entry.targetType, ...(entry.summary ? { title: entry.summary } : {}) }
    else if (target) {
      const parentId = target.type === "reaction" || target.type === "comment"
        ? target.relations?.find((relation) => relation.predicate === "reactsTo" || relation.predicate === "commentOn")?.target.replace(/^item:/, "")
        : undefined
      const parent = parentId ? (doc.items?.[parentId] ? deserializeItem(doc.items[parentId]!) : undefined) : target
      if (parent) subject = { id: parent.id, type: parent.type, createdBy: parent.createdBy, ...(itemDisplayTitle(parent) ? { title: itemDisplayTitle(parent) } : {}), moduleHints: moduleHintsFor(parent) }
    }
    const isPersonal = groupId === this.privateSpaceId
    const actor = (isPersonal || members.includes(entry.actor)) ? await this.getUser(entry.actor) ?? { id: entry.actor } : null
    return { groupId, entry, targetExists: Boolean(target), subject, ...(isPersonal ? { isPersonal: true } : {}), actor }
  }

  private readNotificationState(): NotificationState {
    const raw = (getYjsPersonalDoc() as any)?.notificationState
    const max = (values: Record<string, string> | undefined): string | undefined => Object.values(values ?? {}).reduce<string | undefined>((result, value) => !result || value > result ? value : result, undefined)
    return { ...(max(raw?.lastSeenByDevice) ? { lastSeenTs: max(raw.lastSeenByDevice) } : {}), ...(max(raw?.readUpToByDevice) ? { readUpToTs: max(raw.readUpToByDevice) } : {}), readEntryKeys: { ...(raw?.readEntryKeys ?? {}) }, mutedGroupIds: { ...(raw?.mutedGroupIds ?? {}) } }
  }

  /** Deliberately resolves on every mutation: a restored clone receives a new slot. */
  private async getOrCreateNotificationDeviceId(): Promise<string> {
    if (!this.docLogStore) throw new Error("Notification state requires an initialized DocLogStore")
    return this.docLogStore.resolveConnectDeviceId()
  }

  private requireActivityActor(): string {
    const actor = this.currentUserObs.current?.id
    if (!actor) throw new Error("Authentication required")
    return actor
  }

  private appendActivity(doc: RlsSpaceDoc, action: ActivityEntry["action"], item: Item): void {
    const entries = doc.activity ?? (doc.activity = {})
    const entry: ActivityEntry = {
      id: crypto.randomUUID(), ts: new Date().toISOString(), actor: this.requireActivityActor(), action,
      targetId: item.id, targetType: item.type,
      summary: deriveActivitySummary(item, (id) => (doc.items[id] ? deserializeItem(doc.items[id]) : undefined)),
    }
    entries[entry.id] = entry
    for (const oldest of Object.values(entries).sort(compareActivity).slice(500)) delete entries[oldest.id]
    this.activityDirty = true
  }

  /** Repairs the eventual soft cap after remote CRDT merges; it is log-free. */
  private scheduleActivityReconciliation(spaceId: string, handle: SpaceHandle<RlsSpaceDoc>): void {
    const existing = this.activityReconciliations.get(spaceId)
    if (existing) {
      existing.queued = true
      existing.handle = handle
      return
    }
    const state = { queued: false, handle }
    this.activityReconciliations.set(spaceId, state)
    const run = () => {
      if (this.activityReconciliations.get(spaceId) !== state) return
      if (Object.keys(state.handle.getDoc().activity ?? {}).length <= 500) {
        if (state.queued) {
          state.queued = false
          queueMicrotask(run)
        } else {
          this.activityReconciliations.delete(spaceId)
        }
        return
      }
      let pruned = false
      state.handle.transact((doc) => {
        const entries = doc.activity
        if (!entries || Object.keys(entries).length <= 500) return
        for (const oldest of Object.values(entries).sort(compareActivity).slice(500)) delete entries[oldest.id]
        pruned = true
      })
      if (pruned) this.notifyAllObservers(true)
      if (state.queued) {
        state.queued = false
        queueMicrotask(run)
      } else {
        this.activityReconciliations.delete(spaceId)
      }
    }
    queueMicrotask(run)
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
      // Starts unloaded; markLoaded() once getItem settles so consumers can tell
      // "still loading" from "loaded, not found" (null) — e.g. the module-less
      // item redirect must not resolve before the item is actually known.
      obs = createObservable<Item | null>(null, false)
      this.itemByIdObservables.set(id, obs)
      void this.getItem(id)
        .then((item) => obs!.set(item))
        .catch((err) => console.error("[WotConnector] observeItem initial load failed", err))
        .finally(() => obs!.markLoaded())
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

    // Re-login on the same connector instance: hooks still hold the stable
    // notification-state observable — rebind the PersonalDoc subscription
    // that logout() tore down, so their references stay live.
    if (this.notificationStateObserved && !this.notificationStateUnsub) {
      this.notificationStateUnsub = onYjsPersonalDocChange(() => this.notificationStateObs.set(this.readNotificationState()))
      this.notificationStateObs.set(this.readNotificationState())
    }

    if (this.replication || this.outboxAdapter || this.docLogStore) {
      await this.teardownRuntimeForIdentitySwitch()
    }

    // Identity switch cleanup
    const prevDid = safeLocalStorage(ACTIVE_DID_STORAGE_KEY)
    if (prevDid && prevDid !== did) {
      await this.cleanupOldIdentity(prevDid)
    }
    try { localStorage.setItem(ACTIVE_DID_STORAGE_KEY, did) } catch { /* ignore */ }

    // Stable deviceId: the durable log owns the nonce namespace. Resolve it
    // before constructing the transport and reuse the exact same ID everywhere.
    const rawDocLogStore = this.runtimeOverrides.docLogStore
      ?? new IndexedDBDocLogStore(identityDatabaseName("docLog", did))
    await rawDocLogStore.init()
    const deviceId = await rawDocLogStore.resolveConnectDeviceId()
    this.docLogStore = observeDocLogPending(rawDocLogStore, () => this.queueSyncStateRefresh())

    this.keyManagement = this.runtimeOverrides.keyManagement
      ?? new IndexedDBKeyManagementAdapter(identityDatabaseName("keyManagement", did))
    this.memberUpdateStore = this.runtimeOverrides.memberUpdateStore
      ?? new IndexedDBMemberUpdatePendingStore(identityDatabaseName("memberUpdatePending", did))
    this.messageIdHistory = this.runtimeOverrides.messageIdHistory
      ?? new IndexedDBMessageIdHistory(identityDatabaseName("messageIdHistory", did))

    const closeCandidates: unknown[] = [
      rawDocLogStore,
      this.keyManagement,
      this.memberUpdateStore,
      this.messageIdHistory,
    ]
    this.durableStores = closeCandidates.filter(
      (store): store is { close(): void | Promise<void> } =>
        typeof (store as { close?: unknown } | null)?.close === "function",
    )

    const localOutbox = this.runtimeOverrides.outboxStore
      ?? new LocalOutboxStore(identityDatabaseName("outbox", did))
    if ("open" in localOutbox && typeof localOutbox.open === "function") {
      await localOutbox.open()
    }
    this.outboxStore = localOutbox
    if (hasAttestationCorrelations(localOutbox)) {
      for (const correlation of await localOutbox.getAttestationCorrelations()) {
        this.deliveryMessageIds.set(correlation.messageId, correlation.attestationId)
      }
    }

    // Sync-003 WebSocket auth. Heartbeat values are intentionally omitted:
    // core's 15s interval / 5s timeout defaults are the production contract.
    this.transportAdapter = this.runtimeOverrides.messaging
      ?? new WebSocketMessagingAdapter(this.config.relayUrl, {
        deviceId,
        signBrokerAuthTranscript: (bytes: Uint8Array) => this.identity.signEd25519(bytes),
      })
    this.outboxAdapter = createOutboxMessagingRuntime({
      messaging: this.transportAdapter,
      outboxStore: localOutbox,
      trace: this.runtimeOverrides.traceMessaging,
    })

    // Register state and inbox ownership BEFORE connect: the broker can deliver
    // its initial queue immediately after authentication.
    this.outboxAdapter.onStateChange((state) => {
      this.relayStateObs.set(state as RelayState)
      getMetrics().setRelayStatus(state === "connected", this.config.relayUrl, 0)
      if (state === "connected") {
        this.syncDiscoveryPending().catch(() => {})
        this.queueSyncStateRefresh()
        void this.drainPendingWork().catch((error) => {
          console.warn("[WotConnector] Reconnect work-queue drain deferred", error)
        })
      }
    })
    this.deliveryReceiptUnsub = this.outboxAdapter.onReceipt((receipt) => {
      void this.applyTransportDeliveryReceipt(receipt)
    })

    this.inboxReception = new InboxReceptionHost({
      messaging: this.outboxAdapter,
      identity: this.identity,
      crypto: this.protocolCrypto,
      messageIdHistory: this.messageIdHistory,
    })
    this.inboxReception.start()

    const personalDocFns = {
      getPersonalDoc: getYjsPersonalDoc,
      changePersonalDoc: changeYjsPersonalDoc,
      onPersonalDocChange: onYjsPersonalDocChange,
    }

    // PersonalDoc uses the SAME durable log store and SAME deviceId as the
    // broker registration and Space replication. No Vault is wired in this slice.
    await initNamespacedYjsPersonalDoc(
      this.identity,
      this.outboxAdapter,
      { docLogStore: this.docLogStore, deviceId },
    )

    // OutboxMessagingAdapter.connect() immediately starts a fire-and-forget
    // flush. Make the PersonalDoc projection writable before that can emit a
    // terminal receipt, then replay anything a defensive transport emitted
    // during handler registration.
    this.storage = new YjsStorageAdapter(did)

    // Work that needs PersonalDoc-backed attestations is opened only after the
    // storage projection is ready (#144 ordering). It is device-local and
    // DID-scoped, like the generic outbox.
    const workQueue = this.runtimeOverrides.workQueue
      ?? new WorkQueueStore(identityDatabaseName("work-queue", did))
    if (workQueue.open) await workQueue.open()
    this.workQueue = workQueue
    if (workQueue.watchPendingCount) {
      this.workQueueCountUnsub = workQueue.watchPendingCount().subscribe(() => {
        this.queueSyncStateRefresh()
      })
    }

    await this.retryPendingDeliveryReceipts()
    await this.drainPendingVerificationSaves()
    await this.drainPendingWork()
    await this.outboxAdapter.connect(did)

    const spaceMetadataStorage = new PersonalDocSpaceMetadataStorage(personalDocFns)
    this.spaceCompactStore = this.runtimeOverrides.compactStore
      ?? new TracedCompactStorageManager(
        new CompactStorageManager(identityDatabaseName("spaceCompact", did)),
      )
    if ("open" in this.spaceCompactStore && typeof this.spaceCompactStore.open === "function") {
      await this.spaceCompactStore.open()
    }

    this.replication = this.runtimeOverrides.replication ?? new YjsReplicationAdapter({
      identity: this.identity,
      messaging: this.outboxAdapter,
      keyManagement: this.keyManagement,
      memberUpdateStore: this.memberUpdateStore,
      messageIdHistory: this.messageIdHistory,
      metadataStorage: spaceMetadataStorage,
      compactStore: this.spaceCompactStore,
      brokerUrls: [this.config.relayUrl],
      flushPersonalDoc: flushYjsPersonalDoc,
      docLogStore: this.docLogStore,
      deviceId,
      enableLogSync: true,
    })
    // Membership inbox ownership lives in the replication adapter. Subscribe
    // before start(), because the relay may deliver a queued invite immediately.
    this.spaceInviteUnsub = this.replication.onSpaceInvite((invite) => {
      void this.handleIncomingSpaceInvite(invite).catch((error) => {
        console.warn("[WotConnector] Failed to project incoming space invite", error)
      })
    })
    await this.replication.start()

    if (localOutbox.watchPendingCount) {
      this.outboxCountUnsub = localOutbox.watchPendingCount().subscribe((count: number) => {
        this.outboxCountObs.set(count)
        this.queueSyncStateRefresh()
        void this.pruneDeliveryCorrelations().catch(() => {})
      })
    }
    this.outboxCountObs.set(await localOutbox.count())
    await this.pruneDeliveryCorrelations()
    await this.refreshSyncState()

    // Transitional non-membership messages (currently profile-update) remain
    // separate from inbox/1.0. Membership is owned by YjsReplicationAdapter.
    this.outboxAdapter.onMessage(async (message: WireMessage) => {
      if (!isDidcommMessage(message)) await this.handleIncomingMessage(message as MessageEnvelope)
    })

    this.inboxAttestationUnsub = this.inboxReception.onAttestation((delivery) =>
      this.handleIncomingAttestation(delivery.vcJws, delivery.senderDid),
    )
    this.inboxReceiptUnsub = this.inboxReception.onAttestationReceipt((receipt) =>
      this.handleIncomingAttestationReceipt(receipt.jti, receipt.senderDid),
    )

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
        p.then(() => {
          void this.queuePrivateSpaceReconcile({ createIfMissing: false })
            .catch((err) => console.error("[WotConnector] private space reconciliation failed", err))
        }).catch(() => {})
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
    // Initial local contacts read done.
    this.contactsObs.markLoaded()

    // Trust-002 verifications are attestations with the signed
    // WotVerification VC type. watchAllVerifications() is intentionally empty.
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
      {
        // Overview includes every visible space, including the private/personal
        // document used for overview-created items.
        groupFilter: (info) => info.type === "shared" || info.type === "personal",
        onHandle: (spaceId, handle) => {
          this.scheduleActivityReconciliation(spaceId, handle)
          const remoteUnsub = handle.onRemoteUpdate(() => this.scheduleActivityReconciliation(spaceId, handle))
          return () => {
            remoteUnsub()
            this.activityReconciliations.delete(spaceId)
          }
        },
      },
    )
    this.crossGroupIndex.start()
    this.crossGroupUnsub = this.crossGroupIndex.onChange(() => {
      // Scoped activity is deliberately workspace-independent; a background
      // group changing must refresh it even while another space is active.
      this.notifyAllObservers(true)
    })

    // 11. Watch spaces for reactive group list
    const spacesSubscribable = this.replication.watchSpaces()
    this.spacesSubscriptionUnsub = spacesSubscribable.subscribe((spaces: SpaceInfo[]) => {
      this.updateGroupsFromSpaces(spaces)
    })
    // Load initial spaces — the local space docs have been read at this point,
    // so the groups observable is now "loaded" (even if the user has zero spaces).
    this.updateGroupsFromSpaces(spacesSubscribable.getValue())
    this.groupsObservable.markLoaded()

    // 12. Ensure private space exists (hidden space for personal items)
    await this.queuePrivateSpaceReconcile({ createIfMissing: true })

    // 13. Refresh contact summaries immediately and every 10s (the Demo
    // live-refresh cadence), with overlap protection and throttled full profiles.
    this.startContactProfileRefresh()

    // 14. Retry dirty discovery publishes on mount/online/visibility, matching
    // the Demo's OfflineFirstDiscoveryAdapter integration.
    this.installDiscoveryRetryTriggers()
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
        type: "profile-update",
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

  /**
   * Refresh active contact projections from discovery.
   *
   * The cheap batch endpoint detects name changes every 10 seconds. Full profile
   * resolves only run for changed names, new contacts, or after five minutes.
   * Trade-off: because the 0.3.0 summary has no avatar/bio fields, avatar- or
   * bio-only changes can take up to five minutes to reach ContactInfo and User.
   */
  private async refreshContactProfiles(generation = this.contactProfileRefreshGeneration): Promise<void> {
    const storage = this.storage
    if (!storage) return

    const contacts = (await storage.getContacts()).filter((contact) => contact.status === "active")
    if (generation !== this.contactProfileRefreshGeneration || contacts.length === 0) return

    const contactDids = contacts.map((contact) => contact.did)
    await this.graphCacheService.refreshContactSummaries(contactDids)
    if (generation !== this.contactProfileRefreshGeneration) return

    const summaries = await this.graphCacheStore.getEntries(contactDids)
    const refreshStartedAt = Date.now()
    for (let i = 0; i < contacts.length; i += CONTACT_PROFILE_REFRESH_CONCURRENCY) {
      if (generation !== this.contactProfileRefreshGeneration) return
      const batch = contacts.slice(i, i + CONTACT_PROFILE_REFRESH_CONCURRENCY)
      await Promise.allSettled(batch.map(async (contact) => {
        const summary = summaries.get(contact.did)
        const lastFullResolveAt = this.contactProfileLastFullResolveAt.get(contact.did)
        const summaryNameChanged =
          summary?.name !== undefined && (contact.name ?? null) !== summary.name
        const fullResolveDue =
          lastFullResolveAt === undefined ||
          refreshStartedAt - lastFullResolveAt >= CONTACT_PROFILE_FULL_RESOLVE_INTERVAL_MS
        if (!summaryNameChanged && !fullResolveDue) return

        const result = await this.discovery.resolveProfile(contact.did)
        if (generation !== this.contactProfileRefreshGeneration) return
        this.contactProfileLastFullResolveAt.set(contact.did, Date.now())

        const profile = result.profile
        if (!profile && !summary?.name) return

        if (profile) {
          const [attestations, verifications] = await Promise.all([
            this.graphCacheStore.getCachedAttestations(contact.did).catch(() => []),
            this.graphCacheStore.getCachedVerifications(contact.did).catch(() => []),
          ])
          if (generation !== this.contactProfileRefreshGeneration) return
          await this.graphCacheStore.cacheEntry(contact.did, {
            profile,
            attestations,
            verifications,
            didDocument: result.didDocument ?? null,
          })
        }

        const nextName = profile?.name ?? summary?.name ?? contact.name
        // A resolved profile is authoritative even when avatar/bio are absent:
        // undefined clears stale PersonalDoc fields through YjsStorageAdapter.
        const nextAvatar = profile ? profile.avatar : contact.avatar
        const nextBio = profile ? profile.bio : contact.bio
        const needsUpdate =
          (contact.name || null) !== (nextName || null) ||
          (contact.avatar || null) !== (nextAvatar || null) ||
          (contact.bio || null) !== (nextBio || null)

        if (needsUpdate && generation === this.contactProfileRefreshGeneration) {
          await storage.updateContact({
            ...contact,
            name: nextName ?? undefined,
            avatar: nextAvatar,
            bio: nextBio,
            updatedAt: new Date().toISOString(),
          })
        }
      }))
    }
  }

  private requestContactProfileRefresh(): void {
    if (this.contactProfileRefreshInFlight) return
    const generation = this.contactProfileRefreshGeneration
    let refresh: Promise<void>
    refresh = this.refreshContactProfiles(generation)
      .catch((error) => {
        console.warn("[WotConnector] Contact profile refresh failed", error)
      })
      .finally(() => {
        if (this.contactProfileRefreshInFlight === refresh) {
          this.contactProfileRefreshInFlight = null
        }
      })
    this.contactProfileRefreshInFlight = refresh
  }

  private startContactProfileRefresh(): void {
    this.stopContactProfileRefresh()
    this.requestContactProfileRefresh()
    this.contactProfileRefreshTimer = setInterval(() => {
      this.requestContactProfileRefresh()
    }, CONTACT_PROFILE_REFRESH_INTERVAL_MS)
  }

  private stopContactProfileRefresh(): void {
    this.contactProfileRefreshGeneration += 1
    if (this.contactProfileRefreshTimer) clearInterval(this.contactProfileRefreshTimer)
    this.contactProfileRefreshTimer = null
    this.contactProfileRefreshInFlight = null
    this.contactProfileLastFullResolveAt.clear()
  }

  private installDiscoveryRetryTriggers(): void {
    this.discoveryRetryCleanup?.()

    const retry = () => {
      void this.syncDiscoveryPending().catch(() => {})
      this.requestContactProfileRefresh()
    }
    retry()

    const handleOnline = () => retry()
    const handleVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") retry()
    }

    if (typeof window !== "undefined") window.addEventListener("online", handleOnline)
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisible)
    this.discoveryRetryCleanup = () => {
      if (typeof window !== "undefined") window.removeEventListener("online", handleOnline)
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisible)
    }
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
    const privateSpace = this.selectCanonicalPrivateSpace(spaces)
    if (privateSpace) this.privateSpaceId = privateSpace.id
    void this.queuePrivateSpaceReconcile({ createIfMissing: false })
      .catch((err) => console.error("[WotConnector] private space reconciliation failed", err))

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

  private queuePrivateSpaceReconcile(options: { createIfMissing: boolean }): Promise<void> {
    this.privateSpaceReconcile = this.privateSpaceReconcile
      .catch(() => {})
      .then(() => this.reconcilePrivateSpaces(options))
    return this.privateSpaceReconcile
  }

  private async reconcilePrivateSpaces(options: { createIfMissing: boolean }): Promise<void> {
    if (!this.replication) return

    const spaces = this.replication.watchSpaces().getValue()
    const privateSpaces = this.getPrivateSpaces(spaces)

    if (privateSpaces.length === 0) {
      if (!options.createIfMissing) {
        this.privateSpaceId = null
        return
      }

      const initialDoc = { _type: RLS_SPACE_TYPE, items: {} } as RlsSpaceDoc
      const created = await this.replication.createSpace("shared", initialDoc, {
        name: "Privat",
        appTag: "rls-private",
        modules: DEFAULT_MODULES,
      })
      this.privateSpaceId = created.id
      this.crossGroupIndex?.reindexGroup(created.id)
      return
    }

    const canonical = this.selectCanonicalPrivateSpace(privateSpaces)
    if (!canonical) return

    const previousPrivateSpaceId = this.privateSpaceId
    this.privateSpaceId = canonical.id

    const duplicateIds = privateSpaces
      .map((space) => space.id)
      .filter((id) => id !== canonical.id)

    if (duplicateIds.length > 0) {
      await this.migratePrivateSpaceDuplicates(canonical.id, duplicateIds)
      return
    }

    if (previousPrivateSpaceId !== canonical.id && this.currentGroupId === null) {
      this.notifyAllObservers()
    }
  }

  private getPrivateSpaces(spaces: SpaceInfo[]): SpaceInfo[] {
    return spaces.filter((space) => space.type === "shared" && space.appTag === "rls-private")
  }

  private selectCanonicalPrivateSpace(spaces: SpaceInfo[]): SpaceInfo | null {
    return this.getPrivateSpaces(spaces)
      .sort((a, b) => this.compareSpaceIds(a.id, b.id))[0] ?? null
  }

  private compareSpaceIds(a: string, b: string): number {
    if (a === b) return 0
    return a < b ? -1 : 1
  }

  private async migratePrivateSpaceDuplicates(canonicalId: string, duplicateIds: string[]): Promise<void> {
    if (!this.replication) return

    const targetHandle = await this.replication.openSpace<RlsSpaceDoc>(canonicalId)
    let changed = false

    for (const duplicateId of duplicateIds) {
      const sourceHandle = await this.replication.openSpace<RlsSpaceDoc>(duplicateId)
      const sourceDocSnapshot = sourceHandle.getDoc()
      const sourceItems = sourceDocSnapshot.items ?? {}
      const entries = Object.entries(sourceItems) as Array<[string, SerializedItem]>
      // A duplicate can be item-empty but still carry history of deleted items.
      if (entries.length > 0 || Object.keys(sourceDocSnapshot.activity ?? {}).length > 0) {
        const migratedIds = new Set<string>()
        targetHandle.transact((targetDoc: RlsSpaceDoc) => {
          if (!targetDoc.items) targetDoc.items = {}
          const idRemap = new Map<string, string>()

          for (const [itemId, serialized] of entries) {
            const targetItemId = targetDoc.items[itemId]
              ? `${itemId}-private-${crypto.randomUUID()}`
              : itemId
            idRemap.set(itemId, targetItemId)
          }

          for (const [itemId, serialized] of entries) {
            const targetItemId = idRemap.get(itemId)!
            targetDoc.items[targetItemId] = this.cloneSerializedItem(serialized, targetItemId, idRemap)
            migratedIds.add(itemId)
          }

          // The ENTIRE activity history migrates (also entries whose items are
          // already deleted — Regel 7 keeps those readable); only targetIds of
          // migrated items get remapped. The merged map is pruned to the
          // normative 500 cap in the SAME transact (Regel 4).
          const sourceActivity = sourceHandle.getDoc().activity ?? {}
          for (const [entryId, entry] of Object.entries(sourceActivity)) {
            if (targetDoc.activity?.[entryId]) continue
            const activity = targetDoc.activity ?? (targetDoc.activity = {})
            const remapped = idRemap.get(entry.targetId)
            activity[entryId] = remapped ? { ...entry, targetId: remapped } : { ...entry }
          }
          const merged = targetDoc.activity
          if (merged) {
            for (const oldest of Object.values(merged).sort(compareActivity).slice(500)) {
              delete merged[oldest.id]
            }
          }
        })

        sourceHandle.transact((sourceDoc: RlsSpaceDoc) => {
          for (const itemId of migratedIds) {
            delete sourceDoc.items[itemId]
          }
          // The whole history moved to the canonical space.
          if (sourceDoc.activity) {
            for (const entryId of Object.keys(sourceDoc.activity)) delete sourceDoc.activity[entryId]
          }
        })
      }

      // `leaveSpace()` is the replication layer's public local teardown path.
      // It removes this replica and its metadata; it neither removes members nor
      // rotates keys. For non-empty duplicates it runs only after both writes above.
      await this.replication.leaveSpace(duplicateId)
      changed = true
    }

    if (!changed) return

    this.crossGroupIndex?.reindexGroup(canonicalId)
    this.notifyAllObservers(true)
  }

  private cloneSerializedItem(
    item: SerializedItem,
    id: string,
    idRemap: Map<string, string> = new Map(),
  ): SerializedItem {
    const clone = JSON.parse(JSON.stringify(item)) as SerializedItem
    if (clone.relations?.length) {
      clone.relations = clone.relations.map((relation) => ({
        ...relation,
        target: this.remapRelationTarget(relation.target, idRemap),
      }))
    }
    return {
      ...clone,
      id,
    } as SerializedItem
  }

  private remapRelationTarget(target: string, idRemap: Map<string, string>): string {
    // Only `item:<id>` targets reference a local item that may have been
    // re-keyed during migration. `global:<userId/DID>` is a user reference (not
    // an item) and `space:.../item:...` points into another space — both must
    // stay stable, never remapped to a freshly created duplicate item id.
    const match = /^item:(.+)$/.exec(target)
    if (!match) return target

    const remappedId = idRemap.get(match[1])
    return remappedId ? `item:${remappedId}` : target
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
    // A rapid A→B(→A) switch can settle A's openSpace AFTER the scope moved
    // on — neither success NOR failure of a stale request may touch state.
    // The generation token (not just the group id) distinguishes A→B→A.
    const requestedGroupId = this.currentGroupId
    const generation = ++this.handleOpenGeneration

    try {
      const handle = await this.replication.openSpace<RlsSpaceDoc>(requestedGroupId)
      if (generation !== this.handleOpenGeneration || this.currentGroupId !== requestedGroupId) {
        handle.close()
        return
      }
      this.currentHandle = handle
      this.scheduleActivityReconciliation(requestedGroupId, handle)

      // Listen for remote updates -> refresh observables
      this.handleRemoteUnsub = handle.onRemoteUpdate(() => {
        if (this.currentHandle && this.currentGroupId) this.scheduleActivityReconciliation(this.currentGroupId, this.currentHandle)
        this.notifyAllObservers(true)
      })
    } catch (err) {
      console.error("[WotConnector] Failed to open space:", err)
      if (generation === this.handleOpenGeneration && this.currentGroupId === requestedGroupId) {
        this.currentHandle = null
      }
    }
  }

  private closeCurrentHandle(groupId = this.currentGroupId): void {
    // Closing is itself a scope decision: any in-flight openSpace() request
    // predates it and must never re-install a handle (dispose/logout window).
    this.handleOpenGeneration++
    this.handleRemoteUnsub?.()
    this.handleRemoteUnsub = null
    this.currentHandle?.close()
    if (groupId) this.activityReconciliations.delete(groupId)
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

  private notifyAllObservers(activityMayHaveChanged = false): void {
    this.invalidateItemCache()
    this.activityDirty ||= activityMayHaveChanged
    if (this.activityDirty && this.activityObservables.size > 0) {
      this.activityDirty = false
      for (const [key, observable] of this.activityObservables) {
        const limit = key === "" ? undefined : Number(key)
        void this.getActivity(limit === undefined ? undefined : { limit }).then((entries) => observable.set(entries))
      }
    }
    if (activityMayHaveChanged && this.scopedActivityObservables.size > 0 && !this.scopedRefreshScheduled) {
      // Active-space remote updates arrive over TWO paths (current handle +
      // CrossGroupIndex reindex) — coalesce to one resolution per microtask.
      this.scopedRefreshScheduled = true
      queueMicrotask(() => {
        this.scopedRefreshScheduled = false
        for (const [key, observable] of this.scopedActivityObservables) {
          const limit = key === "" ? undefined : Number(key)
          this.refreshScopedActivity(key, observable, limit === undefined ? undefined : { limit })
        }
      })
    }
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
        const entry = this.crossGroupIndex.getUniqueById(id)
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

  /** Connector-specific observability until core exposes richer sync counters. */
  observeSyncState(): Observable<WotSyncState> {
    return this.syncStateObs
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
    if (!this.storage) throw new Error("Not authenticated")
    await this.storage.saveAttestation(attestation)
    await this.storage.setAttestationAccepted(attestation.id, true)
    this.syncConfirmationsFromPersonalDoc()
    void this.deliverAttestation(attestation).catch(() => {})

    return {
      id: attestation.id,
      issuerId: attestation.from,
      subjectId,
      claim,
      ...(tags ? { tags } : {}),
      schema: "wot:attestation",
      createdAt: attestation.createdAt,
      trustLevel: "signed-attested",
      source: "wot",
      isAccepted: true,
    }
  }

  override async setConfirmationAccepted(id: string, accepted: boolean): Promise<void> {
    if (!this.storage) throw new Error("Not authenticated")
    await this.storage.setAttestationAccepted(id, accepted)
    // Metadata-only changes do not trigger the attestation watcher.
    this.syncConfirmationsFromPersonalDoc()
  }

  // ==================== Encounter verification ====================

  override async createVerificationChallenge(): Promise<VerificationChallenge> {
    const displayName = getYjsPersonalDoc()?.profile?.name ?? getDefaultDisplayName(this.identity.getDid())
    const { rawJson, challenge } = await this.verificationWorkflow.createOnlineQrChallenge(
      this.identity,
      displayName,
      { broker: this.config.relayUrl },
    )
    return { code: rawJson, nonce: challenge.nonce }
  }

  override async prepareVerificationResponse(challengeCode: string): Promise<EncounterPeerInfo> {
    const parsed = parseQrChallenge(challengeCode)
    if (parsed.did === this.identity.getDid()) throw new Error("Cannot verify own identity")
    const peerId = parsed.did
    let peerName = parsed.name
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
    if (!this.storage) throw new Error("Not authenticated")
    const challenge = parseQrChallenge(challengeCode)
    if (challenge.did === this.identity.getDid()) throw new Error("Cannot verify own identity")
    const verification = await this.verificationWorkflow.createVerificationAttestation({
      issuer: this.identity,
      subjectDid: challenge.did,
      challengeNonce: challenge.nonce,
    })
    await this.upsertActiveContact(challenge.did, challenge.name)
    await this.storage.saveAttestation(verification)
    this.syncConfirmationsFromPersonalDoc()
    void this.deliverAttestation(verification, decodeBase64Url(challenge.enc)).catch(() => {})
    this.checkMutualVerification(challenge.did)
  }

  override async counterVerify(targetId: string): Promise<void> {
    if (!this.storage) throw new Error("Not authenticated")
    const did = this.identity.getDid()
    const original = (await this.storage.getReceivedAttestations())
      .filter((attestation) =>
        attestation.from === targetId &&
        attestation.to === did &&
        attestation.isVerification === true &&
        !attestation.inResponseTo,
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
    if (!original) throw new Error("No incoming verification attestation found")

    const counter = await this.verificationWorkflow.createCounterVerificationAttestation({
      issuer: this.identity,
      subjectDid: targetId,
      inResponseTo: original.id,
    })
    await this.upsertActiveContact(targetId)
    await this.storage.saveAttestation(counter)
    this.syncConfirmationsFromPersonalDoc()
    void this.deliverAttestation(counter).catch(() => {})
    this.checkMutualVerification(targetId)
  }

  private async deliverAttestation(
    attestation: Attestation,
    recipientEncryptionPublicKey?: Uint8Array,
    generation = this.runtimeGeneration,
    claimedWorkId?: string,
  ): Promise<boolean> {
    const queue = this.workQueue
    const workId = claimedWorkId ?? `deliver-attestation:${attestation.id}`

    // The obligation is durable before configuration checks, key discovery or
    // any send-path side effect. A drain upserts the same deterministic ID.
    if (queue) {
      await queue.enqueue({
        id: workId,
        kind: "deliver-attestation",
        payload: { attestationId: attestation.id },
      })
      if (!this.isRuntimeCurrent(generation, queue)) return false
      this.noteWorkQueueChanged(false)
    }

    if (!this.outboxAdapter) {
      const error = new Error("Messaging not configured")
      if (!queue) throw error
      await this.failWorkItem(queue, workId, Date.now(), generation)
      if (this.isRuntimeCurrent(generation, queue)) this.noteWorkQueueChanged()
      return false
    }

    let recipientKey = recipientEncryptionPublicKey
    if (!recipientKey) {
      if (!this.isRuntimeCurrent(generation, queue)) return false
      try {
        recipientKey = await this.resolveRecipientEncryptionKey(attestation.to) ?? undefined
      } catch {
        // Runtime overrides may throw even though the production resolver
        // normalizes discovery errors to null.
      }
      if (!this.isRuntimeCurrent(generation, queue)) return false
    }
    if (!recipientKey) {
      if (!queue) throw new Error(`No encryption key published for ${attestation.to}`)
      try {
        if (!this.isRuntimeCurrent(generation, queue)) return false
        await this.setDeliveryStatus(attestation.id, "queued")
        if (!this.isRuntimeCurrent(generation, queue)) return false
      } catch (error) {
        // The durable work is the recovery source; a transient projection
        // failure must not turn missing key discovery back into a lost throw.
        if (this.isRuntimeCurrent(generation, queue)) {
          console.warn("[WotConnector] Queued delivery status deferred", error)
        }
      }
      if (!this.isRuntimeCurrent(generation, queue)) return false
      const dropped = await this.failWorkItem(queue, workId, Date.now(), generation)
      if (dropped && this.isRuntimeCurrent(generation, queue)) {
        // Attempt-Cap hat die letzte Retry-Autorität verworfen: der Ausgang
        // MUSS sichtbar terminal sein — failed, crash-fest geflusht (es gibt
        // keinen Record mehr, der einen queued-Zustand je auflösen würde).
        try {
          await this.setDeliveryStatus(attestation.id, "failed")
          await this.flushPersonalDocDurably()
        } catch (error) {
          console.warn("[WotConnector] Cap-Terminal-Flush deferred", error)
        }
      }
      if (this.isRuntimeCurrent(generation, queue)) this.noteWorkQueueChanged()
      return false
    }

    if (!this.isRuntimeCurrent(generation, queue)) return false
    try {
      await this.setDeliveryStatus(attestation.id, "sending")
    } catch (error) {
      if (!queue) throw error
      if (!this.isRuntimeCurrent(generation, queue)) return false
      const dropped = await this.failWorkItem(queue, workId, Date.now(), generation)
      if (dropped && this.isRuntimeCurrent(generation, queue)) {
        // Attempt-Cap hat die letzte Retry-Autorität verworfen: der Ausgang
        // MUSS sichtbar terminal sein — failed, crash-fest geflusht (es gibt
        // keinen Record mehr, der einen queued-Zustand je auflösen würde).
        try {
          await this.setDeliveryStatus(attestation.id, "failed")
          await this.flushPersonalDocDurably()
        } catch (error) {
          console.warn("[WotConnector] Cap-Terminal-Flush deferred", error)
        }
      }
      if (this.isRuntimeCurrent(generation, queue)) this.noteWorkQueueChanged()
      return false
    }
    if (!this.isRuntimeCurrent(generation, queue)) return false
    const messageId = messageIdForAttestation(attestation.id)
    let delivery: Awaited<ReturnType<typeof sendAttestationInbox>>
    try {
      if (!this.isRuntimeCurrent(generation, queue)) return false
      await this.registerDeliveryCorrelation(messageId, attestation.id)
      if (!this.isRuntimeCurrent(generation, queue)) return false
      this.inFlightDeliveryMessageIds.add(messageId)
      if (!this.isRuntimeCurrent(generation, queue)) return false
      delivery = await sendAttestationInbox({
        identity: this.identity,
        attestation,
        recipientEncryptionPublicKey: recipientKey,
        messaging: this.outboxAdapter,
        crypto: this.protocolCrypto,
        messageId,
        ensureCurrent: () => this.isRuntimeCurrent(generation, queue),
      })
      if (!this.isRuntimeCurrent(generation, queue)) return false
    } catch (error) {
      if (!this.isRuntimeCurrent(generation, queue)) return false
      // Gleiche Durability-Barriere wie im Receipt-Pfad: `failed` erst crash-fest
      // flushen, dann die Korrelation räumen — sonst bleibt das #144-Fenster in
      // diesem terminalen Pfad offen (Reset vor dem 2s-Debounce → Status zurück
      // auf queued, Mapping weg). Flush-Fehler: Korrelation behalten.
      try {
        const persisted = await this.setDeliveryStatus(attestation.id, "failed")
        if (!this.isRuntimeCurrent(generation, queue)) return false
        if (persisted) {
          await this.flushPersonalDocDurably()
          if (!this.isRuntimeCurrent(generation, queue)) return false
          await this.clearDeliveryCorrelation(messageId).catch(() => {})
          if (!this.isRuntimeCurrent(generation, queue)) return false
        }
      } catch (flushError) {
        if (this.isRuntimeCurrent(generation, queue)) {
          console.warn("[WotConnector] Failed-Flush deferred — Korrelation bleibt", flushError)
        }
      }
      if (!queue) throw error
      if (!this.isRuntimeCurrent(generation, queue)) return false
      const dropped = await this.failWorkItem(queue, workId, Date.now(), generation)
      if (dropped && this.isRuntimeCurrent(generation, queue)) {
        // Attempt-Cap hat die letzte Retry-Autorität verworfen: der Ausgang
        // MUSS sichtbar terminal sein — failed, crash-fest geflusht (es gibt
        // keinen Record mehr, der einen queued-Zustand je auflösen würde).
        try {
          await this.setDeliveryStatus(attestation.id, "failed")
          await this.flushPersonalDocDurably()
        } catch (error) {
          console.warn("[WotConnector] Cap-Terminal-Flush deferred", error)
        }
      }
      if (this.isRuntimeCurrent(generation, queue)) this.noteWorkQueueChanged()
      return false
    }

    try {
      if (!this.isRuntimeCurrent(generation, queue)) return false
      this.inFlightDeliveryMessageIds.delete(messageId)
      if (delivery.envelope.id !== messageId) {
        if (!this.isRuntimeCurrent(generation, queue)) return false
        await this.clearDeliveryCorrelation(messageId)
        if (!this.isRuntimeCurrent(generation, queue)) return false
        await this.registerDeliveryCorrelation(delivery.envelope.id, attestation.id)
        if (!this.isRuntimeCurrent(generation, queue)) return false
      }
      if (!this.isRuntimeCurrent(generation, queue)) return false
      await this.applyTransportDeliveryReceipt(delivery.receipt)
      if (!this.isRuntimeCurrent(generation, queue)) return false
    } catch (error) {
      if (!queue) throw error
      if (!this.isRuntimeCurrent(generation, queue)) return false
      const dropped = await this.failWorkItem(queue, workId, Date.now(), generation)
      if (dropped && this.isRuntimeCurrent(generation, queue)) {
        // Attempt-Cap hat die letzte Retry-Autorität verworfen: der Ausgang
        // MUSS sichtbar terminal sein — failed, crash-fest geflusht (es gibt
        // keinen Record mehr, der einen queued-Zustand je auflösen würde).
        try {
          await this.setDeliveryStatus(attestation.id, "failed")
          await this.flushPersonalDocDurably()
        } catch (error) {
          console.warn("[WotConnector] Cap-Terminal-Flush deferred", error)
        }
      }
      if (this.isRuntimeCurrent(generation, queue)) this.noteWorkQueueChanged()
      return false
    }
    if (queue) {
      await this.completeWorkItem(queue, workId, generation)
      if (this.isRuntimeCurrent(generation, queue)) this.noteWorkQueueChanged()
    }
    return true
  }

  private async resolveRecipientEncryptionKey(did: string): Promise<Uint8Array | null> {
    try {
      const result = await this.discovery.resolveProfile(did)
      const multibase = encryptionKeyMultibaseFromDidDocument(result.didDocument)
      return multibase ? x25519MultibaseToPublicKeyBytes(multibase) : null
    } catch {
      return null
    }
  }

  private async upsertActiveContact(did: string, preferredName?: string): Promise<void> {
    if (!this.storage) throw new Error("Not authenticated")
    const now = new Date().toISOString()
    let name = preferredName
    let avatar: string | undefined
    let bio: string | undefined
    let publicKey = ""
    try {
      const result = await this.discovery.resolveProfile(did)
      name = name || result.profile?.name || undefined
      avatar = result.profile?.avatar || undefined
      bio = result.profile?.bio || undefined
      publicKey = this.getEncryptionPublicKeyMultibase(result) ?? ""
    } catch { /* Discovery is optional for the QR-backed first delivery. */ }

    const existing = await this.storage.getContact(did)
    if (existing) {
      await this.storage.updateContact({
        ...existing,
        status: "active",
        updatedAt: now,
        ...(name && !existing.name ? { name } : {}),
        ...(avatar && !existing.avatar ? { avatar } : {}),
        ...(bio && !existing.bio ? { bio } : {}),
        ...(publicKey && !existing.publicKey ? { publicKey } : {}),
      })
      return
    }
    await this.storage.addContact({
      did,
      publicKey,
      name,
      avatar,
      bio,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
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
    // Gepufferte Init-Zeit-Events nachliefern (z.B. incoming-verification aus
    // dem Pending-Save-Drain): init() läuft, BEVOR die App ihren Listener
    // registriert — ohne Replay ginge der counterVerify-Dialog verloren (#147).
    if (this.bufferedEvents.length > 0) {
      const backlog = this.bufferedEvents.splice(0)
      for (const event of backlog) {
        try { callback(event) } catch { /* ignore callback errors */ }
      }
    }
    // Durable ausstehende Verifikations-Aktionen (Vertrag #147) nachliefern.
    void this.announcePendingVerificationActions().catch((error) => {
      console.warn("[WotConnector] Pending-Verification-Announce fehlgeschlagen", error)
    })
    return () => { this.eventCallbacks.delete(callback) }
  }

  private emitEvent(event: IncomingEvent): void {
    if (this.eventCallbacks.size === 0) {
      // Kein Subscriber (Init-Fenster): puffern statt ins Leere emittieren.
      // Bounded, damit ein nie-subscribender Konsument keinen Leak erzeugt.
      this.bufferedEvents.push(event)
      if (this.bufferedEvents.length > 32) this.bufferedEvents.shift()
      return
    }
    for (const cb of this.eventCallbacks) {
      try { cb(event) } catch { /* ignore callback errors */ }
    }
  }

  /**
   * Project a verified, already-applied adapter invite into RLS. The adapter has
   * imported keys/metadata and accepted the space before emitting this event;
   * RLS therefore only refreshes its Group projection and opens the existing
   * invite UI flow.
   */
  private async handleIncomingSpaceInvite(invite: IncomingSpaceInvite): Promise<void> {
    if (!this.replication) return

    this.updateGroupsFromSpaces(await this.replication.getSpaces())
    const group = this.groupsCache.find((candidate) => candidate.id === invite.spaceId)

    let inviterName = this.contactsObs.current.find((contact) => contact.id === invite.fromDid)?.name
    if (!inviterName) {
      inviterName = (await this.graphCacheStore.getEntry(invite.fromDid))?.name
    }
    if (!inviterName) {
      try {
        inviterName = (await this.discovery.resolveProfile(invite.fromDid)).profile?.name ?? undefined
      } catch { /* optional display metadata */ }
    }

    this.emitEvent({
      type: "space-invite",
      fromId: invite.fromDid,
      fromName: inviterName,
      spaceId: invite.spaceId,
      spaceName: group?.name ?? invite.spaceName ?? "Unnamed Space",
      spaceImage: typeof group?.data?.image === "string" ? group.data.image : undefined,
    })
  }

  private async handleIncomingMessage(envelope: MessageEnvelope): Promise<void> {
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

  private async handleIncomingAttestation(vcJws: string, senderDid: string): Promise<void> {
    if (!this.storage) throw new Error("Storage not ready")

    let payload: Awaited<ReturnType<AttestationWorkflow["verifyAttestationVcJws"]>>
    try {
      payload = await this.attestationWorkflow.verifyAttestationVcJws(vcJws)
    } catch (error) {
      // Pure VC verification failure is deterministic: conclude without storing.
      console.debug("[wot-connector] incoming attestation rejected (invalid VC-JWS):", error)
      return
    }
    const attestation = attestationFromVerifiedVc(payload, vcJws)

    // Bind the verified VC to the authenticated Inner-JWS sender and local DID.
    if (payload.iss !== senderDid || attestation.from !== senderDid) return
    if (attestation.to !== this.identity.getDid()) return

    let acceptedInitialVerification = false
    if (attestation.isVerification === true) {
      const decision = payload.inResponseTo
        ? await this.verificationWorkflow.acceptVerifiedCounterVerification(this.identity, payload)
        : await this.verificationWorkflow.acceptVerifiedVerificationAttestation(this.identity, payload)
      if (decision.decision !== "accept-in-person" && decision.decision !== "accept-mutual-in-person") {
        return
      }
      acceptedInitialVerification = decision.decision === "accept-in-person"
      // Write-Verlust-Schutz (CodeRabbit #143): das Accept-Gate hat soeben
      // Nonce/Pending-Counter konsumiert — schlägt der Save unten fehl, wäre
      // die Redelivery ein Replay und die Attestation für immer verloren.
      // Deshalb wird die AKZEPTIERTE VC hier durabel als Pending-Save
      // vorgemerkt (und nach erfolgreichem Save wieder entfernt); der Drain
      // beim nächsten Init holt den Save nach. KEINE Redelivery-Heilung über
      // das konsumierte Gate — die würde anders signierte VCs Dritter
      // durchlassen (Loop-Review-Finding).
      this.recordPendingVerificationSave(attestation.id, vcJws, senderDid)
    }

    const existing = await this.storage.getAttestation(attestation.id)
    if (!existing) await this.storage.saveAttestation(attestation)
    if (attestation.isVerification === true) {
      // Vertrag (#147): der Record bleibt als AUSSTEHENDE AKTION bestehen, bis
      // die UI den incoming-verification-Dialog tatsächlich übernommen hat —
      // hier wird nur die Daten-Hälfte (Save durabel) markiert.
      this.markPendingVerificationSaved(attestation.id)
    }
    await this.finalizeIncomingAttestation(attestation, acceptedInitialVerification)
  }

  /**
   * Post-Save-Abschluss eines eingehenden Attestats: Projektion, App-Receipt,
   * UI-Events (incoming-verification → counterVerify-Dialog!) und Mutual-Check.
   * Geteilt zwischen Live-Empfang und Pending-Save-Drain — der Drain darf nicht
   * nur die Daten retten, sondern muss auch den Flow reproduzieren (sonst
   * erscheint nach einem Neustart nie der Dialog; Loop-Review #147-Kontext).
   */
  private async finalizeIncomingAttestation(
    attestation: Attestation,
    acceptedInitialVerification: boolean,
  ): Promise<void> {
    const generation = this.runtimeGeneration
    this.syncConfirmationsFromPersonalDoc()

    // App-level second tick: encrypted inbox/1.0 receipt, never transport ack.
    await this.enqueueAndSendReceiptAck(attestation, generation)
    if (!this.isRuntimeCurrent(generation)) return

    const contact = this.contactsObs.current.find((entry) => entry.id === attestation.from)
    if (attestation.isVerification === true) {
      await this.deliverVerificationAction(attestation, acceptedInitialVerification)
      this.checkMutualVerification(attestation.from)
      return
    }

    this.emitEvent({
      type: "incoming-claim",
      fromId: attestation.from,
      fromName: contact?.name,
      claimId: attestation.id,
    })
  }

  private async enqueueAndSendReceiptAck(
    attestation: Attestation,
    generation = this.runtimeGeneration,
  ): Promise<void> {
    const queue = this.workQueue
    if (!queue) {
      // Compatibility for narrow method-level consumers. Authenticated
      // production runtimes always construct the durable queue first.
      void this.attemptUnqueuedReceiptAck(attestation, generation)
      return
    }

    const workId = `receipt-ack:${attestation.id}`
    if (!this.isRuntimeCurrent(generation, queue)) return
    await queue.enqueue({
      id: workId,
      kind: "receipt-ack",
      payload: { jti: attestation.id },
    })
    if (!this.isRuntimeCurrent(generation, queue)) return
    // Refresh observability now, but do not arm the due-now timer while the
    // immediate attempt owns this obligation. A crash still leaves it due.
    this.noteWorkQueueChanged(false)
    // In-Session-Ownership (Copilot #148): der Direktversuch CLAIMT sein Item —
    // ein parallel laufender Drain überspringt es dann. Verliert der Direkt-
    // versuch den Claim (Drain war schneller), gehört die Pflicht dem Drain:
    // kein paralleler Zweitversand.
    const claimApi = queue as WorkQueue & { claimImmediate?: (id: string) => boolean }
    if (claimApi.claimImmediate && !claimApi.claimImmediate(workId)) return
    void this.attemptReceiptAck(queue, workId, attestation, generation)
  }

  private async attemptUnqueuedReceiptAck(
    attestation: Attestation,
    generation: number,
  ): Promise<void> {
    if (!this.isRuntimeCurrent(generation)) return
    try {
      await this.sendReceiptAck(attestation, generation)
    } catch (error) {
      if (this.isRuntimeCurrent(generation)) {
        console.debug("[wot-connector] attestation receipt send failed (best-effort):", error)
      }
    }
  }

  private async attemptReceiptAck(
    queue: WorkQueue,
    workId: string,
    attestation: Attestation,
    generation: number,
  ): Promise<void> {
    if (!this.isRuntimeCurrent(generation, queue)) return
    try {
      const sent = await this.sendReceiptAck(attestation, generation)
      if (sent === false || !this.isRuntimeCurrent(generation, queue)) return
    } catch (error) {
      if (!this.isRuntimeCurrent(generation, queue)) return
      await this.failWorkItem(queue, workId, Date.now(), generation)
      if (!this.isRuntimeCurrent(generation, queue)) return
      console.debug("[wot-connector] attestation receipt send deferred:", error)
      this.noteWorkQueueChanged()
      return
    }

    if (!this.isRuntimeCurrent(generation, queue)) return
    await this.completeWorkItem(queue, workId, generation)
    if (this.isRuntimeCurrent(generation, queue)) this.noteWorkQueueChanged()
  }

  private async sendReceiptAck(
    attestation: Attestation,
    generation = this.runtimeGeneration,
  ): Promise<boolean> {
    if (!this.outboxAdapter) throw new Error("Messaging not configured")
    if (!this.isRuntimeCurrent(generation)) return false
    const recipientKey = await this.resolveRecipientEncryptionKey(attestation.from)
    if (!this.isRuntimeCurrent(generation)) return false
    if (!recipientKey) throw new Error(`No encryption key published for ${attestation.from}`)
    if (!this.isRuntimeCurrent(generation)) return false
    await sendAttestationReceipt({
      identity: this.identity,
      issuerDid: attestation.from,
      jti: attestation.id,
      recipientEncryptionPublicKey: recipientKey,
      messaging: this.outboxAdapter,
      crypto: this.protocolCrypto,
      ensureCurrent: () => this.isRuntimeCurrent(generation),
    })
    if (!this.isRuntimeCurrent(generation)) return false
    return true
  }

  private async handleIncomingAttestationReceipt(jti: string, senderDid: string): Promise<void> {
    if (!this.storage) throw new Error("Storage not ready")
    const attestation = await this.storage.getAttestation(jti)
    // Forgery hardening: only the signed attestation's subject may acknowledge it.
    if (!attestation || attestation.to !== senderDid) {
      console.debug("[wot-connector] receipt from unexpected sender ignored")
      return
    }
    await this.setDeliveryStatus(jti, "acknowledged")
    try {
      // Durability-Barriere: acknowledged erst crash-fest flushen, dann die
      // Korrelationen räumen — sonst verliert ein sofortiger Neustart beides.
      await this.flushPersonalDocDurably()
    } catch (error) {
      console.warn("[WotConnector] Acknowledged-Flush deferred — Korrelation bleibt", error)
      return
    }
    await this.clearDeliveryCorrelationsForAttestation(jti).catch(() => {})
  }

  private async registerDeliveryCorrelation(messageId: string, attestationId: string): Promise<void> {
    this.deliveryMessageIds.set(messageId, attestationId)
    if (this.outboxStore && hasAttestationCorrelations(this.outboxStore)) {
      await this.outboxStore.setAttestationCorrelation(messageId, attestationId)
    }
  }

  /**
   * Durability-Barriere für Delivery-Status: setDeliveryStatus schreibt ins
   * Yjs-PersonalDoc, das erst nach ~2s Debounce in IndexedDB landet. Die
   * Korrelation wird dagegen SOFORT durabel gelöscht — ein Neustart im Fenster
   * verlöre den Status unwiederbringlich. Deshalb: erzwungener Flush VOR jeder
   * Korrelations-Löschung. Als Instanz-Methode, damit Tests sie stubben können.
   */
  private async flushPersonalDocDurably(): Promise<void> {
    await flushYjsPersonalDoc()
  }

  private async clearDeliveryCorrelation(messageId: string): Promise<void> {
    if (this.outboxStore && hasAttestationCorrelations(this.outboxStore)) {
      await this.outboxStore.clearAttestationCorrelation(messageId)
    }
    this.deliveryMessageIds.delete(messageId)
    this.inFlightDeliveryMessageIds.delete(messageId)
    this.pendingDeliveryReceipts.delete(messageId)
  }

  private async clearDeliveryCorrelationsForAttestation(attestationId: string): Promise<void> {
    const messageIds = [...this.deliveryMessageIds]
      .filter(([, correlatedAttestationId]) => correlatedAttestationId === attestationId)
      .map(([messageId]) => messageId)
    await Promise.all(messageIds.map((messageId) => this.clearDeliveryCorrelation(messageId)))
  }

  private async applyTransportDeliveryReceipt(receipt: DeliveryReceipt): Promise<void> {
    const attestationId = this.deliveryMessageIds.get(receipt.messageId)
    if (!attestationId) return

    const next = receipt.reason === "queued-in-outbox"
      ? "queued"
      : receipt.status === "failed" ? "failed" : "delivered"
    try {
      const persisted = await this.setDeliveryStatus(attestationId, next)
      if (!persisted) {
        this.pendingDeliveryReceipts.set(receipt.messageId, receipt)
        return
      }
      // Terminal-Status crash-fest machen, BEVOR unten die Korrelation fällt
      // (Yjs-Debounce ~2s; siehe flushPersonalDocDurably). `queued` ist
      // nicht-terminal und behält seine Korrelation → kein Flush nötig.
      if (receipt.reason !== "queued-in-outbox") {
        await this.flushPersonalDocDurably()
      }
    } catch (error) {
      // The transport callback must never turn a temporary PersonalDoc write
      // failure into an unhandled rejection or a lost terminal correlation.
      this.pendingDeliveryReceipts.set(receipt.messageId, receipt)
      console.warn("[WotConnector] Delivery receipt persistence deferred", error)
      return
    }

    if (receipt.reason === "queued-in-outbox") {
      this.pendingDeliveryReceipts.delete(receipt.messageId)
      return
    }

    // Atomicity boundary: the correlation is released only after the terminal
    // status is durably present in the PersonalDoc.
    await this.clearDeliveryCorrelation(receipt.messageId).catch((error) => {
      console.warn("[WotConnector] Delivery correlation cleanup deferred", error)
    })
  }

  /**
   * Durable Pending-Save-Vormerkung für akzeptierte Verifikations-VCs
   * (localStorage, DID-namespaced): das Accept-Gate ist one-shot — ein
   * fehlgeschlagener Save darf die akzeptierte VC nicht verlieren. Der Drain
   * beim Init verifiziert die VC erneut (Signatur + Bindung) und speichert nach.
   */
  private pendingVerificationSaveKey(): string {
    return `rls-wot-pending-verification-save:${this.identity.getDid()}`
  }

  /**
   * UI-Übernahme-Hälfte des Vertrags (#147): der incoming-verification-Dialog
   * (counterVerify-Angebot) wird NUR emittiert, wenn ein Listener registriert
   * ist — sonst bleibt der durable Record als ausstehende Aktion bestehen und
   * wird bei der Listener-Registrierung (announcePendingVerificationActions)
   * genau einmal nachgeliefert. Counter-Verifikationen brauchen keinen Dialog:
   * ihr Record wird nach dem Save direkt geräumt.
   */
  private async deliverVerificationAction(
    attestation: Attestation,
    acceptedInitialVerification: boolean,
  ): Promise<void> {
    if (!acceptedInitialVerification) {
      this.claimPendingVerificationAction(attestation.id)
      return
    }
    if (this.eventCallbacks.size === 0) return // Record bleibt — Nachlieferung beim Subscribe

    // Claim-Grenze (Vertrag #147, finale Form): erst ALLE awaits (Enrichment),
    // DANN Listener erneut prüfen, DANN synchron claimen, DANN ohne weiteres
    // await emittieren. Ein zu früher Claim würde die durable Aktion verlieren,
    // wenn Tab/Enrichment zwischen Claim und Emit sterben; ein Claim nach dem
    // Emit wäre nicht exactly-once. Parallele Announcer enrichen doppelt
    // (harmlos), aber nur der Claim-Gewinner emittiert.
    const contact = this.contactsObs.current.find((entry) => entry.id === attestation.from)
    let peerName = contact?.name
    let peerAvatar = contact?.avatar
    if (!peerName || !peerAvatar) {
      try {
        const result = await this.discovery.resolveProfile(attestation.from)
        peerName = peerName ?? result.profile?.name ?? undefined
        peerAvatar = peerAvatar ?? result.profile?.avatar ?? undefined
      } catch { /* optional profile enrichment */ }
    }
    if (this.eventCallbacks.size === 0) return // Listener weg → Record bleibt
    if (!this.claimPendingVerificationAction(attestation.id)) return
    this.emitEvent({
      type: "incoming-verification",
      fromId: attestation.from,
      fromName: peerName,
      fromAvatar: peerAvatar,
      challengeCode: attestation.vcJws,
    })
  }

  /** Bei Listener-Registrierung: gespeicherte, noch nicht übernommene Aktionen nachliefern. */
  private async announcePendingVerificationActions(): Promise<void> {
    if (!this.storage || this.eventCallbacks.size === 0) return
    for (const [id, entry] of Object.entries(this.readPendingVerificationSaves())) {
      if (!entry.saved) continue // Daten-Hälfte fehlt noch → nächster Drain kümmert sich
      try {
        const payload = await this.attestationWorkflow.verifyAttestationVcJws(entry.vcJws)
        const attestation = attestationFromVerifiedVc(payload, entry.vcJws)
        if (
          payload.iss !== entry.senderDid ||
          attestation.from !== entry.senderDid ||
          attestation.to !== this.identity.getDid() ||
          attestation.id !== id
        ) {
          this.clearPendingVerificationSave(id)
          continue
        }
        await this.deliverVerificationAction(attestation, !payload.inResponseTo)
      } catch (error) {
        console.warn("[WotConnector] Pending-Verification-Announce deferred", error)
      }
    }
  }

  private readPendingVerificationSaves(): Record<string, { vcJws: string; senderDid: string; saved?: boolean }> {
    try {
      return JSON.parse(localStorage.getItem(this.pendingVerificationSaveKey()) ?? "{}")
    } catch {
      return {}
    }
  }

  private recordPendingVerificationSave(id: string, vcJws: string, senderDid: string): void {
    try {
      const pending = this.readPendingVerificationSaves()
      pending[id] = { vcJws, senderDid }
      localStorage.setItem(this.pendingVerificationSaveKey(), JSON.stringify(pending))
    } catch { /* best-effort: ohne localStorage bleibt nur das Exception-Fenster */ }
  }

  /** Daten-Hälfte des Vertrags erfüllt: Save ist durabel, Aktion bleibt offen. */
  private markPendingVerificationSaved(id: string): void {
    try {
      const pending = this.readPendingVerificationSaves()
      if (!(id in pending)) return
      pending[id] = { ...pending[id], saved: true }
      localStorage.setItem(this.pendingVerificationSaveKey(), JSON.stringify(pending))
    } catch { /* best-effort */ }
  }

  /**
   * CLAIM (Vertrags-Primitiv, #147): atomares check-and-delete des Records —
   * synchron, daher im Single-Thread-JS race-frei gegen parallele Announcer/
   * Drains (React-Strict-Mode: subscribe A → cleanup → subscribe B startet
   * zwei Announce-Läufe; nur wer den Claim gewinnt, darf emittieren).
   * Gibt true genau EINMAL pro Record zurück.
   */
  private claimPendingVerificationAction(id: string): boolean {
    try {
      const pending = this.readPendingVerificationSaves()
      if (!(id in pending)) return false
      delete pending[id]
      const key = this.pendingVerificationSaveKey()
      if (Object.keys(pending).length === 0) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify(pending))
      return true
    } catch {
      return false
    }
  }

  private clearPendingVerificationSave(id: string): void {
    try {
      const pending = this.readPendingVerificationSaves()
      if (!(id in pending)) return
      delete pending[id]
      const key = this.pendingVerificationSaveKey()
      if (Object.keys(pending).length === 0) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify(pending))
    } catch { /* best-effort */ }
  }

  /** Init-Drain: verlorene Saves akzeptierter Verifikations-VCs nachholen. */
  private async drainPendingVerificationSaves(): Promise<void> {
    if (!this.storage) return
    for (const [id, entry] of Object.entries(this.readPendingVerificationSaves())) {
      try {
        // Volle Re-Verifikation (Signatur + Sender-/Empfänger-Bindung) — das
        // Gate wird NICHT erneut geprüft: der Record existiert nur für VCs,
        // die es bereits bestanden haben.
        const payload = await this.attestationWorkflow.verifyAttestationVcJws(entry.vcJws)
        const attestation = attestationFromVerifiedVc(payload, entry.vcJws)
        if (
          payload.iss !== entry.senderDid ||
          attestation.from !== entry.senderDid ||
          attestation.to !== this.identity.getDid() ||
          attestation.id !== id
        ) {
          this.clearPendingVerificationSave(id)
          continue
        }
        if (!(await this.storage.getAttestation(id))) {
          await this.storage.saveAttestation(attestation)
        }
        this.markPendingVerificationSaved(id)
        // Flow reproduzieren, nicht nur Daten retten (#147): finalize liefert
        // den Dialog, WENN ein Listener da ist — sonst bleibt der Record als
        // ausstehende Aktion und announcePendingVerificationActions() liefert
        // ihn bei der Listener-Registrierung genau einmal nach. initial ⇔
        // !inResponseTo (Records existieren nur für Gate-akzeptierte VCs).
        await this.finalizeIncomingAttestation(attestation, !payload.inResponseTo)
      } catch (error) {
        console.warn("[WotConnector] Pending-Verification-Save-Drain deferred", error)
      }
    }
    this.syncConfirmationsFromPersonalDoc()
  }

  private async drainPendingWork(): Promise<void> {
    const generation = this.runtimeGeneration
    // A new runtime must not wait for and then return behind an obsolete drain.
    // Same-generation callers wait, then perform a fresh pass for work that may
    // have been enqueued while the previous pass was active.
    while (this.workDrainInFlight && this.workDrainGeneration === generation) {
      await this.workDrainInFlight
      if (!this.isRuntimeCurrent(generation)) return
    }
    const queue = this.workQueue
    const storage = this.storage
    if (!queue || !storage || !this.isRuntimeCurrent(generation, queue)) return

    const run = this.runPendingWorkDrain(queue, storage, generation)
    this.workDrainInFlight = run
    this.workDrainGeneration = generation
    try {
      await run
    } finally {
      if (this.workDrainInFlight === run) {
        this.workDrainInFlight = null
        this.workDrainGeneration = null
      }
      if (this.isRuntimeCurrent(generation, queue)) this.noteWorkQueueChanged()
    }
  }

  private async runPendingWorkDrain(
    queue: WorkQueue,
    storage: YjsStorageAdapter,
    generation: number,
  ): Promise<void> {
    if (!this.isRuntimeCurrent(generation, queue, storage)) return
    const items = await queue.claimDue(Date.now())
    if (!this.isRuntimeCurrent(generation, queue, storage)) return
    for (const item of items) {
      if (!this.isRuntimeCurrent(generation, queue, storage)) return
      try {
        const attestationId = this.workAttestationId(item)
        if (!attestationId) {
          if (!this.isRuntimeCurrent(generation, queue, storage)) return
          await this.completeWorkItem(queue, item.id, generation)
          if (!this.isRuntimeCurrent(generation, queue, storage)) return
          continue
        }
        const attestation = await storage.getAttestation(attestationId)
        if (!this.isRuntimeCurrent(generation, queue, storage)) return
        if (!attestation) {
          if (!this.isRuntimeCurrent(generation, queue, storage)) return
          await this.completeWorkItem(queue, item.id, generation)
          if (!this.isRuntimeCurrent(generation, queue, storage)) return
          continue
        }

        if (item.kind === "deliver-attestation") {
          if (!this.isRuntimeCurrent(generation, queue, storage)) return
          const delivered = await this.deliverAttestation(attestation, undefined, generation, item.id)
          if (!this.isRuntimeCurrent(generation, queue, storage)) return
          // Production delivery settles its deterministic item itself. Narrow
          // test/runtime seams returning void retain the drain-owned lifecycle.
          if (delivered === true || delivered === false) continue
        } else {
          if (!this.isRuntimeCurrent(generation, queue, storage)) return
          const sent = await this.sendReceiptAck(attestation, generation)
          if (!this.isRuntimeCurrent(generation, queue, storage)) return
          if (sent === false) return
        }
        if (!this.isRuntimeCurrent(generation, queue, storage)) return
        await this.completeWorkItem(queue, item.id, generation)
        if (!this.isRuntimeCurrent(generation, queue, storage)) return
      } catch (error) {
        if (!this.isRuntimeCurrent(generation, queue, storage)) return
        const dropped = await this.failWorkItem(queue, item.id, Date.now(), generation)
        if (!this.isRuntimeCurrent(generation, queue, storage)) return
        if (dropped && item.kind === "deliver-attestation") {
          const attestationId = this.workAttestationId(item)
          if (attestationId) {
            try {
              if (!this.isRuntimeCurrent(generation, queue, storage)) return
              const persisted = await this.setDeliveryStatus(attestationId, "failed")
              if (!this.isRuntimeCurrent(generation, queue, storage)) return
              if (persisted) {
                await this.flushPersonalDocDurably()
                if (!this.isRuntimeCurrent(generation, queue, storage)) return
              }
            } catch (statusError) {
              if (this.isRuntimeCurrent(generation, queue, storage)) {
                console.warn("[WotConnector] Final work failure status deferred", statusError)
              }
            }
          }
        }
        if (this.isRuntimeCurrent(generation, queue, storage)) {
          console.debug(`[wot-connector] ${item.kind} deferred:`, error)
        }
      }
    }
  }

  private workAttestationId(item: WorkQueueItem): string | null {
    const value = item.kind === "deliver-attestation"
      ? item.payload.attestationId
      : item.payload.jti
    return typeof value === "string" ? value : null
  }

  private async completeWorkItem(
    queue: WorkQueue,
    id: string,
    generation = this.runtimeGeneration,
  ): Promise<void> {
    if (!this.isRuntimeCurrent(generation, queue)) return
    try {
      await queue.complete(id)
    } catch (error) {
      // Work already succeeded. Completion may be retried at-least-once, but a
      // local bookkeeping fault must never crash message reception or init.
      if (this.isRuntimeCurrent(generation, queue)) {
        console.warn("[WotConnector] Work completion deferred", error)
      }
    }
  }

  private async failWorkItem(
    queue: WorkQueue,
    id: string,
    now: number,
    generation = this.runtimeGeneration,
  ): Promise<boolean> {
    if (!this.isRuntimeCurrent(generation, queue)) return false
    try {
      return await queue.fail(id, now) === true
    } catch (error) {
      if (this.isRuntimeCurrent(generation, queue)) {
        console.warn("[WotConnector] Work failure bookkeeping deferred", error)
      }
      return false
    }
  }

  private async retryPendingDeliveryReceipts(): Promise<void> {
    if (!this.storage) return
    for (const receipt of [...this.pendingDeliveryReceipts.values()]) {
      await this.applyTransportDeliveryReceipt(receipt)
    }
  }

  private async pruneDeliveryCorrelations(): Promise<void> {
    if (!this.outboxStore || !this.storage) return
    const pendingMessageIds = new Set(
      (await this.outboxStore.getPending()).map((entry) => entry.envelope.id),
    )
    const doc = getYjsPersonalDoc()
    for (const [messageId, attestationId] of this.deliveryMessageIds) {
      if (pendingMessageIds.has(messageId) || this.inFlightDeliveryMessageIds.has(messageId)) continue
      const status = doc.attestationMetadata?.[attestationId]?.deliveryStatus as DeliveryStatus | undefined
      if (status && TERMINAL_DELIVERY_STATUSES.has(status)) {
        await this.clearDeliveryCorrelation(messageId).catch(() => {})
      }
    }
  }

  private async setDeliveryStatus(attestationId: string, next: DeliveryStatus): Promise<boolean> {
    if (!this.storage) return false
    const doc = getYjsPersonalDoc()
    const current = doc.attestationMetadata?.[attestationId]?.deliveryStatus as DeliveryStatus | null | undefined
    if (current === next) return true
    if (current === "acknowledged") return true
    // `failed` ist nur aus nicht-zugestellten Zuständen erreichbar: ein spätes
    // Failed-Receipt (z.B. nach fehlgeschlagenem Korrelations-Cleanup) darf
    // einen bereits zugestellten Status nicht degradieren (CodeRabbit #143).
    if (next === "failed" && current === "delivered") return true
    if (next !== "failed" && current && current !== "failed" && DELIVERY_STATUS_RANK[next] <= DELIVERY_STATUS_RANK[current]) {
      return true
    }
    await this.storage.setDeliveryStatus(attestationId, next)
    return true
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
    if (!this.storage) return
    let doc: ReturnType<typeof getYjsPersonalDoc>
    try {
      doc = getYjsPersonalDoc()
    } catch {
      // PersonalDoc not ready yet
      return
    }

    const attestations = this.storage.watchAllAttestations().getValue()
    this.confirmationsObs.set(projectAttestationConfirmations(
      attestations,
      doc.attestationMetadata as Record<string, { attestationId: string; accepted: boolean }>,
    ))

  }

  // (syncContactsFromPersonalDoc removed — contacts are now reactive via YjsStorageAdapter.watchContacts())

  private syncProfileObservable(): void {
    try {
      const did = this.identity.getDid()
      const doc = getYjsPersonalDoc()
      const profile = doc?.profile
      const name = profile?.name || getDefaultDisplayName(did)
      const avatar = profile?.avatar ?? undefined
      this.profileObs.set(projectPersonItem(
        did,
        profile?.createdAt ?? new Date().toISOString(),
        name,
        profile?.bio,
        avatar,
      ))
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

  private noteWorkQueueChanged(schedule = true): void {
    // Lightweight runtime seams may provide queue behavior without the
    // connector's observability/timer lifecycle.
    if (!("workQueueTimer" in this) || !this.syncStateObs) return
    this.queueSyncStateRefresh()
    if (schedule) {
      void this.schedulePendingWorkDrain().catch((error) => {
        console.warn("[WotConnector] Work-queue timer scheduling deferred", error)
      })
    }
  }

  private async schedulePendingWorkDrain(): Promise<void> {
    const generation = this.runtimeGeneration
    const queue = this.workQueue
    if (!queue?.getNextDueAt) return
    const revision = ++this.workQueueScheduleRevision
    const nextDueAt = await queue.getNextDueAt()
    if (!this.isRuntimeCurrent(generation, queue)) return
    // Nur der neueste Scheduler-Read besitzt den Timer: ein veralteter (z.B.
    // spät auflösender null-)Read darf einen frisch gearmten Timer nicht löschen.
    if (revision !== this.workQueueScheduleRevision) return
    this.stopWorkQueueTimer()
    if (nextDueAt === null) return
    const delay = Math.min(Math.max(0, nextDueAt - Date.now()), 2_147_483_647)
    this.workQueueTimer = setTimeout(() => {
      if (!this.isRuntimeCurrent(generation, queue)) return
      this.workQueueTimer = null
      void this.drainPendingWork().catch((error) => {
        if (this.isRuntimeCurrent(generation, queue)) {
          console.warn("[WotConnector] Work-queue drain deferred", error)
        }
      })
    }, delay)
  }

  private stopWorkQueueTimer(): void {
    if (this.workQueueTimer !== null && this.workQueueTimer !== undefined) {
      clearTimeout(this.workQueueTimer)
    }
    this.workQueueTimer = null
  }

  private queueSyncStateRefresh(): void {
    this.syncStateRefresh = this.syncStateRefresh
      .catch(() => {})
      .then(() => this.refreshSyncState())
  }

  private async refreshSyncState(): Promise<void> {
    // Review S1: Referenzen + Generation VOR den Awaits erfassen und vor der
    // Publikation validieren — ein vor dem Logout gestarteter Refresh darf den
    // Zero-State nicht mit alten Counts überschreiben.
    const generation = this.runtimeGeneration
    const docLogStore = this.docLogStore
    const outboxStore = this.outboxStore
    const workQueue = this.workQueue
    const logPending = docLogStore ? (await docLogStore.getPending()).length : 0
    const outboxPending = outboxStore ? await outboxStore.count() : 0
    const workPending = workQueue ? await workQueue.count() : 0
    if (
      generation !== this.runtimeGeneration ||
      docLogStore !== this.docLogStore ||
      outboxStore !== this.outboxStore ||
      workQueue !== this.workQueue
    ) return
    const current = this.syncStateObs.current
    const exposeWorkPending = this.workQueue !== null || "workPending" in current
    if (
      current.logPending !== logPending ||
      current.outboxPending !== outboxPending ||
      (exposeWorkPending && current.workPending !== workPending)
    ) {
      this.syncStateObs.set(exposeWorkPending
        ? { logPending, outboxPending, workPending }
        : { logPending, outboxPending } as WotSyncState)
    }
    this.outboxCountObs.set(outboxPending)
    const line = `[wot-connector] sync-state: logPending=${logPending} outbox=${outboxPending} work=${workPending}`
    if (line !== this.lastSyncStateLog) {
      this.lastSyncStateLog = line
      console.info(line)
    }
  }

  private async teardownRuntimeForIdentitySwitch(): Promise<void> {
    this.invalidateRuntimeGeneration()
    this.inboxAttestationUnsub?.()
    this.inboxReceiptUnsub?.()
    this.deliveryReceiptUnsub?.()
    this.spaceInviteUnsub?.()
    this.outboxCountUnsub?.()
    this.discoveryRetryCleanup?.()
    this.stopContactProfileRefresh()
    this.stopWorkQueueTimer()
    this.inboxReception?.stop()
    this.inboxAttestationUnsub = null
    this.inboxReceiptUnsub = null
    this.deliveryReceiptUnsub = null
    this.spaceInviteUnsub = null
    this.outboxCountUnsub = null
    this.discoveryRetryCleanup = null
    this.inboxReception = null
    await this.replication?.stop()
    await this.outboxAdapter?.disconnect()
    await resetYjsPersonalDoc()
    await this.closeRuntimeStores()
    this.replication = null
    this.outboxAdapter = null
    this.transportAdapter = null
    this.storage = null
  }

  private async closeRuntimeStores(): Promise<void> {
    this.invalidateRuntimeGeneration()
    // Jeder Close einzeln geguardet: ein fehlschlagender Store darf die übrigen
    // Closes (und damit den nachfolgenden Wipe) nicht verhindern.
    const compact = this.spaceCompactStore
    if (compact) try { await compact.close() } catch { /* best-effort teardown */ }
    const outbox = this.outboxStore
    if (outbox) try { await outbox.close() } catch { /* best-effort teardown */ }
    this.stopWorkQueueTimer()
    this.workQueueCountUnsub?.()
    this.workQueueCountUnsub = null
    const workQueue = this.workQueue
    this.workQueue = null
    if (workQueue) try { await workQueue.close() } catch { /* best-effort teardown */ }
    for (const store of this.durableStores.splice(0)) {
      try { await store.close() } catch { /* best-effort teardown */ }
    }
    this.spaceCompactStore = null
    this.outboxStore = null
    this.docLogStore = null
    this.keyManagement = null
    this.memberUpdateStore = null
    this.messageIdHistory = null
    this.deliveryMessageIds.clear()
    this.inFlightDeliveryMessageIds.clear()
    this.pendingDeliveryReceipts.clear()
    this.lastSyncStateLog = null
  }

  private async cleanupOldIdentity(did: string): Promise<void> {
    this.invalidateRuntimeGeneration()
    try { localStorage.removeItem(`rls-wot-pending-verification-save:${did}`) } catch { /* ignore */ }
    await wipeIdentityPersistence(did)
  }

  private invalidateRuntimeGeneration(): void {
    this.runtimeGeneration = (this.runtimeGeneration ?? 0) + 1
  }

  /**
   * Entzieht ALLER laufenden Arbeit die Runtime-Autorität (Review B1a): MUSS
   * vor jeder Identity-Mutation (unlock/create) geschehen, damit kein
   * In-flight-Send über die Identitätsgrenze signiert oder sendet.
   */
  private invalidateRuntimeAuthority(): void {
    this.runtimeGeneration++
    this.stopWorkQueueTimer()
  }

  private isRuntimeCurrent(
    generation: number,
    queue?: WorkQueue | null,
    storage?: YjsStorageAdapter,
  ): boolean {
    return this.runtimeGeneration === generation
      && (queue === undefined || this.workQueue === queue)
      && (storage === undefined || this.storage === storage)
  }
}

// ==================== Helpers ====================

function safeLocalStorage(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
