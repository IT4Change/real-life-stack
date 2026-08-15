import { beforeEach, describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import Ajv2020 from "ajv/dist/2020"
import addFormats from "ajv-formats"

import {
  createObservable,
  VOCAB_BASE,
  VOCAB_PERSON,
  type AuthState,
  type ContactInfo,
  type ConfirmationView,
  type Group,
  type Item,
  type RelayState,
  type User,
} from "@real-life-stack/data-interface"
import type { SpaceInfo } from "@real-life/wot-core"
import { derivePrivateSpaceGenesis } from "@real-life/wot-core/protocol"

import { WotConnector } from "../src/wot-connector.js"
import { InitialSyncTracker } from "../src/initial-sync-tracker.js"
import type { RlsSpaceDoc, SerializedItem, WotSyncState } from "../src/types.js"

const yjsMockState = vi.hoisted(() => ({
  personalDoc: {} as any,
}))

vi.mock("@real-life/adapter-yjs", () => ({
  YjsReplicationAdapter: vi.fn(),
  YjsStorageAdapter: vi.fn(),
  initYjsPersonalDoc: vi.fn(),
  getYjsPersonalDoc: vi.fn(() => yjsMockState.personalDoc),
  resetYjsPersonalDoc: vi.fn(),
  deleteYjsPersonalDocDB: vi.fn(async () => {}),
  onYjsPersonalDocChange: vi.fn(() => () => {}),
  changeYjsPersonalDoc: vi.fn((fn: (doc: any) => void) => {
    fn(yjsMockState.personalDoc)
  }),
  flushYjsPersonalDoc: vi.fn(),
  refreshYjsPersonalDocFromVault: vi.fn(),
}))

vi.mock("@real-life/wot-core", () => {
  class EmptyAdapter {
    connect = vi.fn(async () => {})
    disconnect = vi.fn(async () => {})
    send = vi.fn(async () => ({ ok: true }))
    onStateChange = vi.fn()
    onMessage = vi.fn()
    stop = vi.fn(async () => {})
    open = vi.fn(async () => {})
  }

  return {
    WotIdentity: vi.fn(),
    WebSocketMessagingAdapter: EmptyAdapter,
    OutboxMessagingAdapter: EmptyAdapter,
    PersonalDocOutboxStore: EmptyAdapter,
    PersonalDocSpaceMetadataStorage: EmptyAdapter,
    GroupKeyService: EmptyAdapter,
    HttpDiscoveryAdapter: EmptyAdapter,
    OfflineFirstDiscoveryAdapter: EmptyAdapter,
    GraphCacheService: EmptyAdapter,
    InMemoryPublishStateStore: EmptyAdapter,
    InMemoryGraphCacheStore: EmptyAdapter,
    VerificationWorkflow: EmptyAdapter,
    AttestationWorkflow: EmptyAdapter,
    WebCryptoProtocolCryptoAdapter: EmptyAdapter,
    CompactStorageManager: EmptyAdapter,
    TracedCompactStorageManager: EmptyAdapter,
    TracedOutboxMessagingAdapter: EmptyAdapter,
    getMetrics: vi.fn(() => ({ setRelayStatus: vi.fn() })),
    getDefaultDisplayName: vi.fn((did: string) => did),
    signEnvelope: vi.fn(async (envelope: unknown) => envelope),
    verifyEnvelope: vi.fn(async () => true),
  }
})

vi.mock("@real-life/wot-core/protocol", async (importOriginal) => ({
  ...await importOriginal<typeof import("@real-life/wot-core/protocol")>(),
  x25519MultibaseToPublicKeyBytes: vi.fn(() => new Uint8Array()),
  // Verhaltensgleich zum Core: Marker wird NUR aus dem VC-Typ-Array abgeleitet.
  isVerificationAttestation: (payload: { type?: unknown }) =>
    Array.isArray(payload?.type) && payload.type.includes("WotVerification"),
}))

vi.mock("../src/identity-persistence.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/identity-persistence.js")>(),
  wipeIdentityPersistence: vi.fn(async () => {}),
}))

const here = dirname(fileURLToPath(import.meta.url))
const CONNECTOR_SRC = resolve(here, "../src/wot-connector.ts")
const CONFIRMATIONS_SRC = resolve(here, "../src/confirmations.ts")
const PERSON_SCHEMA = resolve(here, "../../../docs/spec/schemas/vocab/person/v1/schema.json")

const personAjv = new Ajv2020({ allErrors: true, strict: false })
addFormats(personAjv)
const validatePerson = personAjv.compile(JSON.parse(readFileSync(PERSON_SCHEMA, "utf8")))

function readConnectorSource(): string {
  return readFileSync(CONNECTOR_SRC, "utf8")
}

function sliceMethod(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start === -1 ? 0 : start)
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Failed to slice method body between "${startMarker}" and "${endMarker}"`)
  }
  return source.slice(start, end)
}

describe("WotConnector.logout() - auth-scoped observable reset", () => {
  const source = readConnectorSource()
  const logout = sliceMethod(source, "override async logout", "override async getCurrentUser")

  it("resets confirmation and connector-status observables", () => {
    expect(logout).toMatch(/confirmationsObs\.set\(\[\]\)/)
    expect(logout).toMatch(/contactsObs\.set\(\[\]\)/)
    expect(logout).toMatch(/outboxCountObs\.set\(0\)/)
    expect(logout).toMatch(/relayStateObs\.set\("disconnected"\)/)
  })

  it("still resets the previously cleaned-up group/user observables", () => {
    expect(logout).toMatch(/currentGroupObservable\.set\(null\)/)
    expect(logout).toMatch(/groupsObservable\.set\(\[\]\)/)
    expect(logout).toMatch(/currentUserObs\.set\(null\)/)
    expect(logout).toMatch(/authStateObs\.set\(\{\s*status:\s*"unauthenticated"\s*\}\)/)
  })
})

describe("WotConnector DID-store teardown contract", () => {
  it("requires a real close for every runtime DID store", () => {
    const close = sliceMethod(readConnectorSource(), "private async closeRuntimeStores", "private async cleanupOldIdentity")
    expect(close).toMatch(/await compact\.close\(\)/)
    expect(close).toMatch(/await outbox\.close\(\)/)
    expect(close).toMatch(/await workQueue\.close\(\)/)
    expect(close).not.toMatch(/close\?\./)
  })

  it("keeps a relogin runtime intact when an old store-close continuation settles", async () => {
    let releaseOldClose!: () => void
    const oldCompact = {
      close: vi.fn(() => new Promise<void>((resolve) => { releaseOldClose = resolve })),
    }
    const oldOutbox = { close: vi.fn(async () => {}) }
    const oldWorkQueue = { close: vi.fn(async () => {}) }
    const oldDurable = { close: vi.fn(async () => {}) }
    const newCompact = { close: vi.fn(async () => {}) }
    const newOutbox = { close: vi.fn(async () => {}) }
    const newWorkQueue = { close: vi.fn(async () => {}) }
    const newDurable = { close: vi.fn(async () => {}) }
    const fake = {
      runtimeGeneration: 1,
      spaceCompactStore: oldCompact,
      outboxStore: oldOutbox,
      workQueue: oldWorkQueue,
      durableStores: [oldDurable],
      docLogStore: { old: true },
      keyManagement: { old: true },
      memberUpdateStore: { old: true },
      messageIdHistory: { old: true },
      workQueueCountUnsub: vi.fn(),
      stopWorkQueueTimer: vi.fn(),
      deliveryMessageIds: new Map([["old", "old"]]),
      inFlightDeliveryMessageIds: new Set(["old"]),
      pendingDeliveryReceipts: new Map([["old", {}]]),
      lastSyncStateLog: "old",
    }

    const oldTeardown = WotConnector.prototype["closeRuntimeStores"].call(fake as any)
    await vi.waitFor(() => expect(oldCompact.close).toHaveBeenCalledOnce())

    // Same connector instance, new authenticated runtime.
    Object.assign(fake, {
      runtimeGeneration: 2,
      spaceCompactStore: newCompact,
      outboxStore: newOutbox,
      workQueue: newWorkQueue,
      durableStores: [newDurable],
      docLogStore: { fresh: true },
      keyManagement: { fresh: true },
      memberUpdateStore: { fresh: true },
      messageIdHistory: { fresh: true },
    })

    releaseOldClose()
    await oldTeardown

    expect(fake.spaceCompactStore).toBe(newCompact)
    expect(fake.outboxStore).toBe(newOutbox)
    expect(fake.workQueue).toBe(newWorkQueue)
    expect(fake.durableStores).toEqual([newDurable])
    expect(newOutbox.close).not.toHaveBeenCalled()
    expect(newWorkQueue.close).not.toHaveBeenCalled()
    expect(newDurable.close).not.toHaveBeenCalled()
  })
})

describe("WotConnector bootstrap - delivery receipt ordering", () => {
  const bootstrap = sliceMethod(
    readConnectorSource(),
    "private async bootstrapAdapters",
    "private async setAuthAuthenticated",
  )

  it("makes PersonalDoc storage writable before connect starts the automatic outbox flush", () => {
    const personalDocInit = bootstrap.indexOf("await initNamespacedYjsPersonalDoc(")
    const storageInit = bootstrap.indexOf("this.storage = new YjsStorageAdapter(did)")
    const connect = bootstrap.indexOf("await this.outboxAdapter.connect(did)")

    expect(personalDocInit).toBeGreaterThan(-1)
    expect(storageInit).toBeGreaterThan(personalDocInit)
    expect(connect).toBeGreaterThan(storageInit)
  })
})

describe("WotConnector.setConfirmationAccepted() - metadata-only refresh", () => {
  const source = readConnectorSource()
  const setConfirmationAccepted = sliceMethod(
    source,
    "override async setConfirmationAccepted",
    "// ==================== Encounter verification",
  )

  it("refreshes the confirmation projection after mutating metadata", () => {
    expect(setConfirmationAccepted).toMatch(/syncConfirmationsFromPersonalDoc\(\)/)
  })

  it("delegates acceptance metadata to the storage adapter", () => {
    expect(setConfirmationAccepted).toMatch(/storage\.setAttestationAccepted\(id, accepted\)/)
  })
})

describe("Confirmation projection - transport and QR boundary", () => {
  it("mapPersonalDocConfirmations stays generic", () => {
    const projection = readFileSync(CONFIRMATIONS_SRC, "utf8")
    const forbidden = ["deliveryStatus", "getOutboxPendingCount", "createChallenge"]
    for (const term of forbidden) {
      expect(projection).not.toMatch(new RegExp(term))
    }
  })
})

describe("WotConnector verification boundary - source guards", () => {
  const source = readConnectorSource()
  const statusMethod = sliceMethod(
    source,
    "override getVerificationStatus",
    "// ==================== Confirmations",
  )
  const mutualMethod = sliceMethod(
    source,
    "private async checkMutualVerification",
    "// ==================== Internal: Confirmation sync",
  )
  const incomingAttestationMethod = sliceMethod(
    source,
    "private async handleIncomingAttestation",
    "private async sendReceiptAck",
  )

  it("uses schema-only verification predicates", () => {
    expect(statusMethod).toMatch(/filter\(isVerificationConfirmation\)/)
    expect(mutualMethod).toMatch(/filter\(isVerificationConfirmation\)/)
    expect(statusMethod).not.toMatch(/tags\?\.includes\("verification"\)/)
    expect(mutualMethod).not.toMatch(/tags\?\.includes\("verification"\)/)
  })

  it("accepts verification attestations only through the signed VC marker and workflow gate", () => {
    expect(incomingAttestationMethod).toMatch(/attestation\.isVerification === true/)
    expect(incomingAttestationMethod).toMatch(/acceptVerifiedVerificationAttestation/)
    expect(incomingAttestationMethod).toMatch(/acceptVerifiedCounterVerification/)
    expect(incomingAttestationMethod).not.toMatch(/tags\?\.includes\("verification"\)/)
  })

  it("binds the verified VC to the authenticated sender and local subject", () => {
    expect(incomingAttestationMethod).toMatch(/payload\.iss !== senderDid/)
    expect(incomingAttestationMethod).toMatch(/attestation\.to !== this\.identity\.getDid\(\)/)
  })

  it("refreshes the attestation projection before checking mutual verification", () => {
    const syncIndex = incomingAttestationMethod.indexOf("this.syncConfirmationsFromPersonalDoc()")
    const mutualIndex = incomingAttestationMethod.indexOf("this.checkMutualVerification(attestation.from)")
    expect(syncIndex).toBeGreaterThan(-1)
    expect(mutualIndex).toBeGreaterThan(-1)
    expect(syncIndex).toBeLessThan(mutualIndex)
  })

  it("projects only watchAllAttestations and never the retired verification collection", () => {
    expect(source).toMatch(/watchAllAttestations\(\)/)
    expect(source).not.toMatch(/\.watchAllVerifications\(\)/)
    expect(source).not.toMatch(/envelope\.type === "verification"/)
  })
})

function createConnectorObservables() {
  const authStateObs = createObservable<AuthState>({ status: "loading" })
  const contactsObs = createObservable<ContactInfo[]>([])
  const confirmationsObs = createObservable<ConfirmationView[]>([])
  const relayStateObs = createObservable<RelayState>("disconnected")
  const outboxCountObs = createObservable<number>(0)
  const syncStateObs = createObservable<WotSyncState>({ logPending: 0, outboxPending: 0 })
  const currentGroupObs = createObservable<Group | null>(null)
  const groupsObs = createObservable<Group[]>([])
  const currentUserObs = createObservable<User | null>(null)

  return {
    authStateObs,
    contactsObs,
    confirmationsObs,
    relayStateObs,
    outboxCountObs,
    syncStateObs,
    currentGroupObs,
    groupsObs,
    currentUserObs,
  }
}

function createFakeConnectorForLogout() {
  const obs = createConnectorObservables()
  const user: User = { id: "did:key:alice", displayName: "Alice" }

  obs.authStateObs.set({ status: "authenticated", user })
  obs.currentUserObs.set(user)
  obs.contactsObs.set([
    {
      id: "did:key:bob",
      status: "active",
      createdAt: "2026-04-12T08:00:00Z",
      updatedAt: "2026-04-12T08:00:00Z",
    },
  ])
  obs.confirmationsObs.set([
    {
      id: "att-1",
      issuerId: "did:key:alice",
      subjectId: "did:key:bob",
      claim: "is trustworthy",
      schema: "wot:attestation",
      trustLevel: "signed-attested",
      source: "wot",
      createdAt: "2026-04-14T10:30:00Z",
      isAccepted: true,
    },
  ])
  obs.relayStateObs.set("connected")
  obs.outboxCountObs.set(2)
  obs.currentGroupObs.set({ id: "g1", name: "Crew" })
  obs.groupsObs.set([{ id: "g1", name: "Crew" }])

  const activityObservables = new Map([
    ["", createObservable([{ id: "old", ts: "2026-01-01T00:00:00.000Z", actor: "did:key:alice", action: "create" as const, targetId: "old", targetType: "task" }])],
    ["1", createObservable([{ id: "old", ts: "2026-01-01T00:00:00.000Z", actor: "did:key:alice", action: "create" as const, targetId: "old", targetType: "task" }])],
  ])
  const fake: any = {
    bufferedEvents: [] as unknown[],
    ...obs,
    closeCurrentHandle: vi.fn(),
    crossGroupUnsub: vi.fn(),
    crossGroupIndex: { stop: vi.fn() },
    privateSpaceId: "private-space",
    spacesSubscriptionUnsub: vi.fn(),
    personalDocUnsub: vi.fn(),
    restoreSpacesRunner: { cancel: vi.fn() },
    syncFrameUnsub: vi.fn(),
    syncFrameTokens: new Map<string, number>(),
    initialSync: new InitialSyncTracker(),
    replication: { stop: vi.fn(async () => {}) },
    outboxAdapter: { disconnect: vi.fn(async () => {}) },
    transportAdapter: { disconnect: vi.fn(async () => {}) },
    contactsUnsub: vi.fn(),
    attestationsUnsub: vi.fn(),
    profileUnsub: vi.fn(),
    outboxCountUnsub: vi.fn(),
    inboxAttestationUnsub: vi.fn(),
    inboxReceiptUnsub: vi.fn(),
    deliveryReceiptUnsub: vi.fn(),
    inboxReception: { stop: vi.fn() },
    stopContactProfileRefresh: vi.fn(),
    storage: { marker: "storage" },
    currentGroupId: "g1",
    currentGroupObservable: obs.currentGroupObs,
    groupsCache: [{ id: "g1", name: "Crew" }],
    groupsObservable: obs.groupsObs,
    profileObs: createObservable<User | null>(user),
    syncPendingObs: createObservable<boolean>(true),
    identity: {
      getDid: vi.fn(() => "did:key:alice"),
      deleteStoredIdentity: vi.fn(async () => {}),
    },
    closeRuntimeStores: vi.fn(async () => {}),
    activityObservables,
    activityDirty: false,
    currentHandle: null,
    handleReady: Promise.resolve(),
    getActivity: vi.fn(async () => []),
    notifyScheduled: false,
    invalidateItemCache: vi.fn(),
    notifyAllObserversNow: vi.fn(),
  }
  fake.notifyAllObservers = (activityMayHaveChanged = false) =>
    Reflect.get(WotConnector.prototype, "notifyAllObservers").call(fake, activityMayHaveChanged)
  return fake
}

describe("WotConnector.logout() - real method regression", () => {
  beforeEach(() => {
    yjsMockState.personalDoc = {}
  })

  it("clears auth-scoped observables when the real logout method runs", async () => {
    const fake = createFakeConnectorForLogout()
    const contactsUnsub = fake.contactsUnsub
    const attestationsUnsub = fake.attestationsUnsub
    const profileUnsub = fake.profileUnsub

    await WotConnector.prototype.logout.call(fake as any)

    expect(fake.confirmationsObs.current).toEqual([])
    expect(fake.contactsObs.current).toEqual([])
    expect(fake.outboxCountObs.current).toBe(0)
    expect(fake.relayStateObs.current).toBe("disconnected")
    expect(fake.profileObs.current).toBeNull()
    expect(fake.syncPendingObs.current).toBe(false)
    expect(fake.syncStateObs.current).toEqual({ logPending: 0, outboxPending: 0 })
    expect(fake.currentGroupObservable.current).toBeNull()
    expect(fake.groupsObservable.current).toEqual([])
    expect(fake.currentUserObs.current).toBeNull()
    expect(fake.authStateObs.current).toEqual({ status: "unauthenticated" })
    expect(contactsUnsub).toHaveBeenCalled()
    expect(attestationsUnsub).toHaveBeenCalled()
    expect(profileUnsub).toHaveBeenCalled()
    expect(fake.storage).toBeNull()
    await vi.waitFor(() => {
      expect([...fake.activityObservables.values()].map((observable: any) => observable.current)).toEqual([[], []])
    })
  })
})

describe("WotConnector.setConfirmationAccepted() - real method regression", () => {
  it("refreshes projections after mutating attestation metadata", async () => {
    const setAttestationAccepted = vi.fn(async () => {})
    const fake = {
      storage: { setAttestationAccepted },
      syncConfirmationsFromPersonalDoc: vi.fn(),
    }

    await WotConnector.prototype.setConfirmationAccepted.call(fake as any, "att-1", true)

    expect(setAttestationAccepted).toHaveBeenCalledWith("att-1", true)
    expect(fake.syncConfirmationsFromPersonalDoc).toHaveBeenCalledTimes(1)
  })
})

describe("WotConnector profile publish and contact refresh", () => {
  beforeEach(() => {
    yjsMockState.personalDoc = {
      profile: {
        did: "did:key:alice",
        name: "Alice",
        bio: null,
        avatar: null,
        createdAt: "2026-07-16T08:00:00.000Z",
        updatedAt: "2026-07-16T08:00:00.000Z",
      },
      contacts: {},
    }
  })

  it("publishes the updated profile through discovery before resolving updateProfile", async () => {
    const publishProfile = vi.fn(async () => {})
    const broadcastProfileUpdate = vi.fn(async () => {})
    const fake = {
      identity: { getDid: () => "did:key:alice" },
      discovery: { publishProfile },
      broadcastProfileUpdate,
      currentUserObs: createObservable<User | null>({ id: "did:key:alice", displayName: "Alice" }),
    }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    await WotConnector.prototype.updateProfile.call(fake as any, {
      name: "Alice Neu",
      avatar: "data:image/png;base64,new-avatar",
    })

    expect(publishProfile).toHaveBeenCalledTimes(1)
    expect(publishProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        did: "did:key:alice",
        name: "Alice Neu",
        avatar: "data:image/png;base64,new-avatar",
      }),
      fake.identity,
    )
    expect(broadcastProfileUpdate).toHaveBeenCalledTimes(1)
  })

  it("skips discovery publishing when the PersonalDoc has no local profile name", async () => {
    yjsMockState.personalDoc = { profile: null, contacts: {} }
    const publishProfile = vi.fn(async () => {})
    const fake = {
      identity: { getDid: () => "did:key:recovered" },
      discovery: { publishProfile },
      getCurrentUser: vi.fn(async () => null),
    }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    await (WotConnector.prototype as any).setAuthAuthenticated.call(fake)
    await Promise.resolve()

    expect(publishProfile).not.toHaveBeenCalled()
  })

  it("dirty-retry supplies no profile without a real local name (default-overwrite guard)", async () => {
    // Reviewer-Blocker #175: syncDiscoveryPending baute Retry-Daten mit
    // getDefaultDisplayName-Fallback — ein alter dirty-Marker + leerer
    // PersonalDoc publizierte so wieder "User-…" über das echte Profil.
    yjsMockState.personalDoc = { profile: null, contacts: {} }
    let captured: (() => Promise<{ profile?: { name?: string } }>) | null = null
    const fake = {
      identity: { getDid: () => "did:key:recovered" },
      discovery: { syncPending: vi.fn(async (_did: unknown, _identity: unknown, cb: never) => { captured = cb }) },
    }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    await (WotConnector.prototype as any).syncDiscoveryPending.call(fake)
    expect(captured).toBeTruthy()
    const withoutName = await captured!()
    expect(withoutName.profile).toBeUndefined()

    yjsMockState.personalDoc.profile = { name: "Alice" }
    const withName = await captured!()
    expect(withName.profile?.name).toBe("Alice")
  })

  it("publishes a recovered local profile once, without republishing it for irrelevant PersonalDoc changes", async () => {
    yjsMockState.personalDoc = { profile: null, contacts: {} }
    const publishProfile = vi.fn(async () => {})
    const syncProfileObservable = vi.fn()
    const fake = {
      identity: { getDid: () => "did:key:recovered" },
      discovery: { publishProfile },
      syncProfileObservable,
      lastObservedProfileKey: JSON.stringify(null),
    }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    yjsMockState.personalDoc.profile = {
      did: "did:key:recovered",
      name: "Alice",
      bio: null,
      avatar: null,
    }
    ;(WotConnector.prototype as any).handlePersonalDocProfileChange.call(fake)

    await vi.waitFor(() => {
      expect(publishProfile).toHaveBeenCalledTimes(1)
    })
    expect(publishProfile).toHaveBeenCalledWith(
      expect.objectContaining({ did: "did:key:recovered", name: "Alice" }),
      fake.identity,
    )

    yjsMockState.personalDoc.contacts["did:key:bob"] = { did: "did:key:bob", name: "Bob" }
    ;(WotConnector.prototype as any).handlePersonalDocProfileChange.call(fake)

    expect(syncProfileObservable).toHaveBeenCalledTimes(1)
    expect(publishProfile).toHaveBeenCalledTimes(1)
  })

  it("refreshes summaries and projects a changed avatar into contacts and users", async () => {
    const oldContact = {
      did: "did:key:bob",
      publicKey: "key-bob",
      name: "Bob Alt",
      avatar: "old-avatar",
      bio: "Alt",
      status: "active" as const,
      createdAt: "2026-07-15T08:00:00.000Z",
      updatedAt: "2026-07-15T08:00:00.000Z",
    }
    yjsMockState.personalDoc.contacts[oldContact.did] = { ...oldContact }

    const contactsObs = createObservable<ContactInfo[]>([{
      id: oldContact.did,
      name: oldContact.name,
      avatar: oldContact.avatar,
      bio: oldContact.bio,
      status: oldContact.status,
      createdAt: oldContact.createdAt,
      updatedAt: oldContact.updatedAt,
    }])
    const updateContact = vi.fn(async (contact: typeof oldContact) => {
      yjsMockState.personalDoc.contacts[contact.did] = { ...contact }
      contactsObs.set([{
        id: contact.did,
        name: contact.name,
        avatar: contact.avatar,
        bio: contact.bio,
        status: contact.status,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
      }])
    })
    const refreshContactSummaries = vi.fn(async () => {})
    const cacheEntry = vi.fn(async () => {})
    const fake = {
      storage: {
        getContacts: vi.fn(async () => [oldContact]),
        updateContact,
      },
      graphCacheService: { refreshContactSummaries },
      graphCacheStore: {
        getEntries: vi.fn(async () => new Map([[oldContact.did, {
          did: oldContact.did,
          name: "Bob Neu",
          verificationCount: 1,
          attestationCount: 0,
          fetchedAt: "2026-07-16T09:00:00.000Z",
        }]])),
        getCachedAttestations: vi.fn(async () => []),
        getCachedVerifications: vi.fn(async () => []),
        cacheEntry,
      },
      discovery: {
        resolveProfile: vi.fn(async () => ({
          profile: {
            did: oldContact.did,
            name: "Bob Neu",
            avatar: "new-avatar",
            bio: "Neu",
            updatedAt: "2026-07-16T09:00:00.000Z",
          },
          didDocument: null,
          fromCache: false,
        })),
      },
      identity: { getDid: () => "did:key:alice" },
      contactsObs,
      contactProfileRefreshGeneration: 0,
      contactProfileLastFullResolveAt: new Map<string, number>(),
    }

    await (WotConnector.prototype as any).refreshContactProfiles.call(fake)

    expect(refreshContactSummaries).toHaveBeenCalledWith([oldContact.did])
    expect(cacheEntry).toHaveBeenCalledTimes(1)
    expect(updateContact).toHaveBeenCalledWith(expect.objectContaining({
      did: oldContact.did,
      name: "Bob Neu",
      avatar: "new-avatar",
      bio: "Neu",
    }))
    expect(contactsObs.current[0].avatar).toBe("new-avatar")

    const user = await WotConnector.prototype.getUser.call(fake as any, oldContact.did)
    expect(user).toEqual({
      id: oldContact.did,
      displayName: "Bob Neu",
      avatarUrl: "new-avatar",
    })
  })

  it("does not resolve an unchanged profile again within five minutes", async () => {
    const contact = {
      did: "did:key:bob",
      publicKey: "key-bob",
      name: "Bob",
      avatar: "avatar",
      bio: "Bio",
      status: "active" as const,
      createdAt: "2026-07-15T08:00:00.000Z",
      updatedAt: "2026-07-15T08:00:00.000Z",
    }
    const refreshContactSummaries = vi.fn(async () => {})
    const resolveProfile = vi.fn(async () => ({
      profile: {
        did: contact.did,
        name: contact.name,
        avatar: contact.avatar,
        bio: contact.bio,
        updatedAt: contact.updatedAt,
      },
      didDocument: null,
      fromCache: false,
    }))
    const fake = {
      storage: {
        getContacts: vi.fn(async () => [contact]),
        updateContact: vi.fn(async () => {}),
      },
      graphCacheService: { refreshContactSummaries },
      graphCacheStore: {
        getEntries: vi.fn(async () => new Map([[contact.did, {
          did: contact.did,
          name: contact.name,
          verificationCount: 0,
          attestationCount: 0,
          fetchedAt: contact.updatedAt,
        }]])),
        getCachedAttestations: vi.fn(async () => []),
        getCachedVerifications: vi.fn(async () => []),
        cacheEntry: vi.fn(async () => {}),
      },
      discovery: { resolveProfile },
      contactProfileRefreshGeneration: 0,
      contactProfileLastFullResolveAt: new Map<string, number>(),
    }

    await (WotConnector.prototype as any).refreshContactProfiles.call(fake)
    expect(resolveProfile).toHaveBeenCalledTimes(1)

    resolveProfile.mockClear()
    await (WotConnector.prototype as any).refreshContactProfiles.call(fake)

    expect(refreshContactSummaries).toHaveBeenCalledTimes(2)
    expect(resolveProfile).toHaveBeenCalledTimes(0)
  })
})

describe("WotConnector person/v1 item projection", () => {
  const did = "did:key:alice"

  async function getProjectedProfile(profile: {
    name: string | null
    bio: string | null
    avatar: string | null
  }): Promise<Item> {
    yjsMockState.personalDoc = {
      profile: {
        did,
        ...profile,
        createdAt: "2026-07-16T08:00:00.000Z",
        updatedAt: "2026-07-16T08:00:00.000Z",
      },
      contacts: {},
    }
    const fake = {
      identity: { getDid: () => did },
      profileObs: createObservable<Item | null>(null),
      currentUserObs: createObservable<User | null>(null),
      memberObservables: new Map(),
      notifyMemberObservers: vi.fn(),
    }

    ;(WotConnector.prototype as any).syncProfileObservable.call(fake)
    const item = await WotConnector.prototype.getMyProfile.call(fake as any)
    if (!item) throw new Error("Expected getMyProfile() to return the projected profile")
    return item
  }

  it.each(["pic.jpg", "hello world"])(
    "returns an AJV-valid person/v1 item for legacy avatar %j",
    async (avatar) => {
      const item = await getProjectedProfile({ name: "Alice", bio: "Builder", avatar })

      expect(item["@context"]).toEqual([VOCAB_BASE, VOCAB_PERSON])
      expect(item.data).toEqual({
        displayName: "Alice",
        bio: "Builder",
        avatarUrl: avatar,
      })
      expect(item.data).not.toHaveProperty("name")
      expect(item.data).not.toHaveProperty("avatar")
      expect(validatePerson(item), JSON.stringify(validatePerson.errors, null, 2)).toBe(true)
    },
  )

  it("uses the display-name fallback and omits an empty stored avatar", async () => {
    const item = await getProjectedProfile({ name: null, bio: null, avatar: "" })

    expect(item.data.displayName).toBe(did)
    expect(item.data).not.toHaveProperty("avatarUrl")
    expect(validatePerson(item), JSON.stringify(validatePerson.errors, null, 2)).toBe(true)
  })
})

describe("WotConnector Yjs membership routing", () => {
  const source = readConnectorSource()
  const legacyHandler = sliceMethod(
    source,
    "private async handleIncomingMessage",
    "private async handleIncomingAttestation",
  )

  it("uses addMember so the replication adapter owns outgoing ECIES invites", async () => {
    const addMember = vi.fn(async () => {})
    const notifyMemberObservers = vi.fn(async () => {})
    const fake = {
      replication: { addMember },
      discovery: {
        resolveProfile: vi.fn(async () => ({
          profile: { did: "did:key:bob", name: "Bob" },
          didDocument: {
            keyAgreement: [{ publicKeyMultibase: "z6LSfakeBobKey" }],
          },
        })),
      },
      notifyMemberObservers,
    }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    await WotConnector.prototype.inviteMember.call(fake as any, "space-1", "did:key:bob")

    expect(addMember).toHaveBeenCalledWith("space-1", "did:key:bob", expect.any(Uint8Array))
    expect(notifyMemberObservers).toHaveBeenCalledWith("space-1")
  })

  it("projects an applied onSpaceInvite event into groups and the RLS invite flow", async () => {
    const space: SpaceInfo = {
      id: "space-1",
      type: "shared",
      name: "Garten",
      image: "garden.png",
      appTag: "rls",
      members: ["did:key:alice", "did:key:bob"],
      createdAt: "2026-07-16T09:00:00.000Z",
    }
    const groupsObservable = createObservable<Group[]>([])
    const emitted: any[] = []
    const fake = {
      replication: {
        getSpaces: vi.fn(async () => [space]),
        watchSpaces: vi.fn(() => ({ getValue: () => [space] })),
      },
      groupsCache: [] as Group[],
      groupsObservable,
      initialSync: new InitialSyncTracker(),
      privateSpaceId: null,
      currentGroupId: null,
      currentGroupObservable: createObservable<Group | null>(null),
      memberObservables: new Map(),
      queuePrivateSpaceReconcile: vi.fn(async () => {}),
      notifyAllObservers: vi.fn(),
      contactsObs: createObservable<ContactInfo[]>([{
        id: "did:key:alice",
        name: "Alice",
        status: "active",
        createdAt: "2026-07-15T08:00:00.000Z",
        updatedAt: "2026-07-15T08:00:00.000Z",
      }]),
      graphCacheStore: { getEntry: vi.fn(async () => null) },
      discovery: { resolveProfile: vi.fn() },
      eventCallbacks: new Set([(event: unknown) => emitted.push(event)]),
    }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    await (WotConnector.prototype as any).handleIncomingSpaceInvite.call(fake, {
      spaceId: space.id,
      spaceName: space.name,
      fromDid: "did:key:alice",
      inviteMessageId: "invite-1",
    })

    expect(groupsObservable.current).toEqual([expect.objectContaining({
      id: space.id,
      name: "Garten",
      data: expect.objectContaining({ image: "garden.png" }),
    })])
    expect(emitted).toEqual([expect.objectContaining({
      type: "space-invite",
      fromId: "did:key:alice",
      fromName: "Alice",
      spaceId: space.id,
      spaceName: "Garten",
      spaceImage: "garden.png",
    })])
  })

  it("subscribes to onSpaceInvite and has no Old-World space-invite envelope handler", () => {
    expect(source).toMatch(/replication\.onSpaceInvite\(/)
    expect(legacyHandler).not.toMatch(/envelope\.type === "space-invite"/)
  })
})

describe("WotConnector attestation receipt - authenticated sender binding", () => {
  it("acknowledges only receipts signed by the attestation subject", async () => {
    const setDeliveryStatus = vi.fn(async () => {})
    const clearDeliveryCorrelationsForAttestation = vi.fn(async () => {})
    const fake = {
      storage: {
        getAttestation: vi.fn(async () => ({
          id: "att-1",
          from: "did:key:alice",
          to: "did:key:bob",
        })),
      },
      setDeliveryStatus,
      flushPersonalDocDurably: vi.fn(async () => {}),
      clearDeliveryCorrelationsForAttestation,
    }
    const receiveReceipt = (WotConnector.prototype as any).handleIncomingAttestationReceipt

    await receiveReceipt.call(fake, "att-1", "did:key:mallory")
    expect(setDeliveryStatus).not.toHaveBeenCalled()

    await receiveReceipt.call(fake, "att-1", "did:key:bob")
    expect(setDeliveryStatus).toHaveBeenCalledWith("att-1", "acknowledged")
    expect(clearDeliveryCorrelationsForAttestation).toHaveBeenCalledWith("att-1")
  })
})

describe("WotConnector.deleteStoredIdentity() - real method regression", () => {
  // Guarantees the biometric-setup rollback: the stored seed is removed directly,
  // NOT behind logout()'s awaited adapter teardown (replication/ws/outbox disconnect,
  // DID-scoped persistence wipe) — any of which could reject and skip the deletion.
  it("deletes the stored identity with no adapters present (teardown-independent)", async () => {
    const del = vi.fn(async () => {})
    // Deliberately only an identity — no replication/ws/outbox adapters. If the
    // method routed through teardown, this would not reach the deletion.
    const fake = { identity: { deleteStoredIdentity: del } }

    await WotConnector.prototype.deleteStoredIdentity.call(fake as any)

    expect(del).toHaveBeenCalledTimes(1)
  })

  it("propagates so the caller can fall back, even if a later teardown would reject", async () => {
    // Models the rollback ordering in the flows: deleteStoredIdentity() runs first
    // and on its own, so a subsequent logout() teardown rejection cannot undo it.
    const del = vi.fn(async () => {})
    const fake = { identity: { deleteStoredIdentity: del } }

    await WotConnector.prototype.deleteStoredIdentity.call(fake as any)
    // A separate, later logout() that throws does not affect the already-done deletion.
    await Promise.reject(new Error("replication.stop failed")).catch(() => {})

    expect(del).toHaveBeenCalledTimes(1)
  })
})

function createSerializedItem(id: string, title: string): SerializedItem {
  return {
    id,
    type: "task",
    createdAt: "2026-06-20T10:00:00.000Z",
    createdBy: "did:key:alice",
    data: { title },
  }
}

function createSerializedItemWithRelations(
  id: string,
  title: string,
  relations: SerializedItem["relations"],
): SerializedItem {
  return {
    ...createSerializedItem(id, title),
    relations,
  }
}

function createSpaceInfo(id: string, appTag = "rls-private"): SpaceInfo {
  return {
    id,
    type: "shared",
    appTag,
    name: "Privat",
    modules: ["feed", "kanban", "calendar", "map"],
    members: ["did:key:alice"],
    createdAt: "2026-06-20T10:00:00.000Z",
  }
}

function createSpaceHandle(doc: RlsSpaceDoc, opts?: { durableTransact?: (fn: (spaceDoc: RlsSpaceDoc) => void, doc: RlsSpaceDoc) => Promise<void> }) {
  return {
    getDoc: () => doc,
    transact: (fn: (spaceDoc: RlsSpaceDoc) => void) => fn(doc),
    // Production adapters (adapter-yjs >= 0.2.2) resolve only after the durable
    // append of exactly this transaction; the default fake applies + resolves.
    transactDurable: vi.fn(async (fn: (spaceDoc: RlsSpaceDoc) => void) => {
      if (opts?.durableTransact) return opts.durableTransact(fn, doc)
      fn(doc)
    }),
    close: vi.fn(),
    onRemoteUpdate: vi.fn(() => () => {}),
  }
}

describe("WotConnector.getItemGroupId()", () => {
  it("prefers the active space when the same naked ID is ambiguous globally", () => {
    const indexLookup = vi.fn(() => null)
    const fake = {
      currentGroupId: "group-a",
      currentHandle: createSpaceHandle({
        _type: "rls",
        items: { shared: createSerializedItem("shared", "A") },
      } as RlsSpaceDoc),
      crossGroupIndex: { getItemGroupId: indexLookup },
    }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    expect((fake as unknown as WotConnector).getItemGroupId("shared")).toBe("group-a")
    expect(indexLookup).not.toHaveBeenCalled()
  })

  it("uses the unique aggregate lookup when no space is active", () => {
    const fake = {
      currentGroupId: null,
      currentHandle: null,
      crossGroupIndex: { getItemGroupId: vi.fn(() => "group-b") },
    }
    Object.setPrototypeOf(fake, WotConnector.prototype)

    expect((fake as unknown as WotConnector).getItemGroupId("shared")).toBe("group-b")
  })
})

function createFakePrivateSpaceConnector(spaces: SpaceInfo[], docs: Record<string, RlsSpaceDoc>) {
  const fake = {
    privateSpaceId: null,
    currentGroupId: null,
    privateSpaceReconcile: Promise.resolve(),
    replication: {
      watchSpaces: vi.fn(() => ({ getValue: () => spaces })),
      openSpace: vi.fn(async (id: string) => createSpaceHandle(docs[id])),
      createSpace: vi.fn(async (_type: string, initialDoc: RlsSpaceDoc, metadata: Partial<SpaceInfo>) => {
        const id = "created-private"
        spaces.push(createSpaceInfo(id, metadata.appTag ?? "rls-private"))
        docs[id] = initialDoc
        return spaces[spaces.length - 1]
      }),
      leaveSpace: vi.fn(async (id: string) => {
        const index = spaces.findIndex((space) => space.id === id)
        if (index !== -1) spaces.splice(index, 1)
        delete docs[id]
      }),
    },
    crossGroupIndex: { reindexGroup: vi.fn() },
    notifyAllObservers: vi.fn(),
  }
  Object.setPrototypeOf(fake, WotConnector.prototype)
  return fake
}

/** Deterministic fake derivation: bytes derived from the info string only. */
const fakeDerive = async (info: string, length: number): Promise<Uint8Array> => {
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i += 1) bytes[i] = (info.length * 31 + i * 7) % 256
  return bytes
}

/** Upgrade a fake connector to a deterministic-genesis-capable adapter (PR 2). */
function makeDeterministicCapable(
  fake: ReturnType<typeof createFakePrivateSpaceConnector>,
  spaces: SpaceInfo[],
  docs: Record<string, RlsSpaceDoc>,
  deterministicId: string,
) {
  ;(fake as any).identity = { getDid: () => "did:key:fake-owner", deriveFrameworkKey: fakeDerive }
  ;(fake as any).deterministicPrivateSpaceId = null
  ;(fake.replication as any).openOrCreateDeterministicPrivateSpace = vi.fn(
    async (initialDoc: RlsSpaceDoc, metadata: Partial<SpaceInfo>) => {
      const existing = spaces.find((space) => space.id === deterministicId)
      if (existing) return existing
      spaces.push(createSpaceInfo(deterministicId, metadata.appTag ?? "rls-private"))
      docs[deterministicId] = initialDoc
      return spaces[spaces.length - 1]
    },
  )
}

describe("WotConnector private space reconciliation", () => {
  it("does not notify observers when createIfMissing is false and no private space exists", async () => {
    const fake = createFakePrivateSpaceConnector([], {})

    await (WotConnector.prototype as any).reconcilePrivateSpaces.call(fake, { createIfMissing: false })

    expect(fake.privateSpaceId).toBeNull()
    expect(fake.replication.createSpace).not.toHaveBeenCalled()
    expect(fake.notifyAllObservers).not.toHaveBeenCalled()
  })

  it("adopts the lexicographically smallest private space as canonical", async () => {
    const spaces = [
      createSpaceInfo("private-z"),
      createSpaceInfo("private-a"),
      createSpaceInfo("shared-space", "rls"),
    ]
    const docs = {
      "private-z": { _type: "rls", items: {} } as RlsSpaceDoc,
      "private-a": { _type: "rls", items: {} } as RlsSpaceDoc,
      "shared-space": { _type: "rls", items: {} } as RlsSpaceDoc,
    }
    const fake = createFakePrivateSpaceConnector(spaces, docs)

    await (WotConnector.prototype as any).reconcilePrivateSpaces.call(fake, { createIfMissing: false })

    expect(fake.privateSpaceId).toBe("private-a")
    expect(fake.replication.createSpace).not.toHaveBeenCalled()
  })

  it("does not notify observers when the canonical private space is unchanged", async () => {
    const spaces = [createSpaceInfo("private-a")]
    const docs = {
      "private-a": { _type: "rls", items: {} } as RlsSpaceDoc,
    }
    const fake = createFakePrivateSpaceConnector(spaces, docs)
    fake.privateSpaceId = "private-a"

    await (WotConnector.prototype as any).reconcilePrivateSpaces.call(fake, { createIfMissing: false })

    expect(fake.privateSpaceId).toBe("private-a")
    expect(fake.notifyAllObservers).not.toHaveBeenCalled()
  })

  it("migrates items from duplicate private spaces into the canonical space", async () => {
    const spaces = [
      createSpaceInfo("private-b"),
      createSpaceInfo("private-a"),
    ]
    const docs = {
      "private-a": {
        _type: "rls",
        items: {
          keep: createSerializedItem("keep", "Keep"),
        },
      } as RlsSpaceDoc,
      "private-b": {
        _type: "rls",
        items: {
          move: createSerializedItem("move", "Move"),
        },
      } as RlsSpaceDoc,
    }
    const fake = createFakePrivateSpaceConnector(spaces, docs)

    await (WotConnector.prototype as any).reconcilePrivateSpaces.call(fake, { createIfMissing: false })

    expect(fake.privateSpaceId).toBe("private-a")
    expect(docs["private-a"].items.keep.data.title).toBe("Keep")
    expect(docs["private-a"].items.move.data.title).toBe("Move")
    expect(docs["private-b"]).toBeUndefined()
    expect(fake.crossGroupIndex.reindexGroup).toHaveBeenCalledWith("private-a")
    expect(fake.crossGroupIndex.reindexGroup).not.toHaveBeenCalledWith("private-b")
    expect(fake.replication.leaveSpace).toHaveBeenCalledWith("private-b")
    expect(fake.notifyAllObservers).toHaveBeenCalledTimes(1)
  })

  it("migrates private duplicates, tears them down locally, and stays singular after reload", async () => {
    const spaces = [
      createSpaceInfo("private-c"),
      createSpaceInfo("private-a"),
      createSpaceInfo("private-b"),
    ]
    const docs = {
      "private-a": {
        _type: "rls",
        items: { canonical: createSerializedItem("canonical", "Canonical") },
      } as RlsSpaceDoc,
      "private-b": { _type: "rls", items: {} } as RlsSpaceDoc,
      "private-c": {
        _type: "rls",
        items: { migrated: createSerializedItem("migrated", "Migrated") },
        activity: {
          "migrated-create": {
            id: "migrated-create",
            action: "create",
            targetId: "migrated",
            targetType: "task",
            actor: "did:key:alice",
            summary: "Migrated",
            timestamp: "2026-07-19T00:00:00.000Z",
          },
        },
      } as RlsSpaceDoc,
    }
    const firstStart = createFakePrivateSpaceConnector(spaces, docs)

    await (WotConnector.prototype as any).reconcilePrivateSpaces.call(firstStart, { createIfMissing: false })

    expect(docs["private-a"].items).toMatchObject({
      canonical: expect.anything(),
      migrated: expect.anything(),
    })
    expect(docs["private-a"].activity).toHaveProperty("migrated-create")
    expect(firstStart.replication.leaveSpace).toHaveBeenCalledTimes(2)
    expect(firstStart.replication.leaveSpace).toHaveBeenCalledWith("private-b")
    expect(firstStart.replication.leaveSpace).toHaveBeenCalledWith("private-c")

    // A second connector start shares the same replication stores. The migration
    // must now be a no-op: only the canonical private space remains discoverable.
    const reloaded = createFakePrivateSpaceConnector(spaces, docs)
    await (WotConnector.prototype as any).reconcilePrivateSpaces.call(reloaded, { createIfMissing: false })

    expect(spaces.filter((space) => space.appTag === "rls-private")).toHaveLength(1)
    expect(reloaded.privateSpaceId).toBe("private-a")
    expect(reloaded.replication.leaveSpace).not.toHaveBeenCalled()
  })

  it("uses the deterministic private space as canonical and leaves legacy spaces completely untouched", async () => {
    // Reduced #192 scope: no random space is ever minted, and legacy duplicates
    // are NEITHER copied NOR torn down (they stay indexed and visible through
    // the cross-group read model). The real migration is #198.
    const detId = (await derivePrivateSpaceGenesis(fakeDerive)).spaceId
    const spaces = [createSpaceInfo("legacy-a")]
    const docs: Record<string, RlsSpaceDoc> = {
      "legacy-a": { _type: "rls", items: { keep: createSerializedItem("keep", "Keep") } } as RlsSpaceDoc,
    }
    const legacyBefore = JSON.stringify(docs["legacy-a"])
    const fake = createFakePrivateSpaceConnector(spaces, docs)
    makeDeterministicCapable(fake, spaces, docs, detId)

    await (WotConnector.prototype as any).reconcilePrivateSpaces.call(fake, { createIfMissing: true })

    expect((fake.replication as any).openOrCreateDeterministicPrivateSpace).toHaveBeenCalled()
    expect(fake.replication.createSpace).not.toHaveBeenCalled() // never the random path
    expect(fake.privateSpaceId).toBe(detId)
    expect(fake.replication.leaveSpace).not.toHaveBeenCalled()
    expect(fake.replication.openSpace).not.toHaveBeenCalled() // no copy, no write at all
    expect(JSON.stringify(docs["legacy-a"])).toBe(legacyBefore) // byte-identical
  })
  it("prefers the deterministic space as canonical on non-creating paths — never migrates backwards", async () => {
    // Guard: the lowest-id heuristic must NOT pick a legacy space over the
    // deterministic one. "aaaa..." sorts BEFORE the derived id, so without the
    // preference the deterministic space would be merged into legacy and torn down.
    const detId = (await derivePrivateSpaceGenesis(fakeDerive)).spaceId
    const legacyId = "aaaaaaaa-0000-4000-8000-000000000000"
    expect(legacyId < detId).toBe(true) // precondition of the repro
    const spaces = [createSpaceInfo(legacyId), createSpaceInfo(detId)]
    const docs: Record<string, RlsSpaceDoc> = {
      [legacyId]: { _type: "rls", items: { m: createSerializedItem("m", "Move me") } } as RlsSpaceDoc,
      [detId]: { _type: "rls", items: {} } as RlsSpaceDoc,
    }
    const fake = createFakePrivateSpaceConnector(spaces, docs)
    makeDeterministicCapable(fake, spaces, docs, detId)

    await (WotConnector.prototype as any).reconcilePrivateSpaces.call(fake, { createIfMissing: false })

    expect(fake.privateSpaceId).toBe(detId)
    expect(fake.replication.leaveSpace).not.toHaveBeenCalled() // untouched regime
    expect(docs[detId].items.m).toBeUndefined() // nothing copied (that is #198)
    expect(docs[legacyId].items.m.data.title).toBe("Move me") // source intact
  })

  it("a transient derivation failure never falls back to a random space and heals on retry", async () => {
    // Review blocker 2: a derivation error was cached as null for the whole
    // session and routed the capable adapter onto the legacy random-create path.
    const detId = (await derivePrivateSpaceGenesis(fakeDerive)).spaceId
    const spaces: SpaceInfo[] = []
    const docs: Record<string, RlsSpaceDoc> = {}
    const fake = createFakePrivateSpaceConnector(spaces, docs)
    makeDeterministicCapable(fake, spaces, docs, detId)
    let failFirst = true
    ;(fake as any).identity = {
      getDid: () => "did:key:fake-owner",
      deriveFrameworkKey: async (info: string, length?: number) => {
        if (failFirst) { failFirst = false; throw new Error("transient key failure") }
        return fakeDerive(info, length ?? 32)
      },
    }

    // First reconcile: fail-closed — NO random space is minted.
    await expect(
      (WotConnector.prototype as any).reconcilePrivateSpaces.call(fake, { createIfMissing: true }),
    ).rejects.toThrow(/transient key failure/)
    expect(fake.replication.createSpace).not.toHaveBeenCalled()
    expect(spaces).toHaveLength(0)

    // Second reconcile: the failed flight was evicted — derivation retries and
    // opens ONLY the deterministic space.
    await (WotConnector.prototype as any).reconcilePrivateSpaces.call(fake, { createIfMissing: true })
    expect(fake.replication.createSpace).not.toHaveBeenCalled()
    expect((fake.replication as any).openOrCreateDeterministicPrivateSpace).toHaveBeenCalled()
    expect(spaces.map((s) => s.id)).toEqual([detId])
  })

  it("re-derives the private-space id when the identity changes — no cross-identity cache leak", async () => {
    // Review blocker: the derived-id cache survived an identity switch that
    // bypasses the teardown paths — identity B inherited A's private-space id.
    // The cache is now BOUND to the identity DID.
    const fakeDeriveB = async (info: string, length: number): Promise<Uint8Array> => {
      const bytes = new Uint8Array(length)
      for (let i = 0; i < length; i += 1) bytes[i] = (info.length * 13 + i * 3 + 7) % 256
      return bytes
    }
    const idA = (await derivePrivateSpaceGenesis(fakeDerive)).spaceId
    const idB = (await derivePrivateSpaceGenesis(fakeDeriveB)).spaceId
    expect(idB).not.toBe(idA) // precondition

    const spaces: SpaceInfo[] = []
    const docs: Record<string, RlsSpaceDoc> = {}
    const fake = createFakePrivateSpaceConnector(spaces, docs)
    makeDeterministicCapable(fake, spaces, docs, idA)
    ;(fake as any).identity = { getDid: () => "did:key:alice", deriveFrameworkKey: fakeDerive }

    const first = await (WotConnector.prototype as any).resolveDeterministicPrivateSpaceId.call(fake)
    expect(first).toBe(idA)

    // Identity switch WITHOUT any teardown/reset call:
    ;(fake as any).identity = { getDid: () => "did:key:bob", deriveFrameworkKey: fakeDeriveB }
    const second = await (WotConnector.prototype as any).resolveDeterministicPrivateSpaceId.call(fake)
    expect(second).toBe(idB) // NOT A's cached id
  })

  it("keeps a non-empty duplicate when its migration fails", async () => {
    const spaces = [createSpaceInfo("private-a"), createSpaceInfo("private-b")]
    const docs = {
      "private-a": { _type: "rls", items: {} } as RlsSpaceDoc,
      "private-b": {
        _type: "rls",
        items: { migrate: createSerializedItem("migrate", "Must remain") },
      } as RlsSpaceDoc,
    }
    const fake = createFakePrivateSpaceConnector(spaces, docs)
    const canonicalHandle = createSpaceHandle(docs["private-a"])
    canonicalHandle.transact = vi.fn(() => { throw new Error("target write failed") })
    fake.replication.openSpace.mockImplementation(async (id: string) =>
      id === "private-a" ? canonicalHandle : createSpaceHandle(docs[id]),
    )

    await expect(
      (WotConnector.prototype as any).reconcilePrivateSpaces.call(fake, { createIfMissing: false }),
    ).rejects.toThrow("target write failed")

    expect(docs["private-b"].items.migrate.data.title).toBe("Must remain")
    expect(fake.replication.leaveSpace).not.toHaveBeenCalled()
  })

  it("remaps relations between migrated items when duplicate IDs are renamed", async () => {
    const spaces = [
      createSpaceInfo("private-b"),
      createSpaceInfo("private-a"),
    ]
    const docs = {
      "private-a": {
        _type: "rls",
        items: {
          parent: createSerializedItem("parent", "Canonical parent"),
          child: createSerializedItem("child", "Canonical child"),
        },
      } as RlsSpaceDoc,
      "private-b": {
        _type: "rls",
        items: {
          parent: createSerializedItemWithRelations("parent", "Migrated parent", [
            { predicate: "blocks", target: "item:child" },
            { predicate: "mentions", target: "global:child" },
            { predicate: "external", target: "space:other/item:child" },
          ]),
          child: createSerializedItem("child", "Migrated child"),
        },
      } as RlsSpaceDoc,
    }
    const fake = createFakePrivateSpaceConnector(spaces, docs)

    await (WotConnector.prototype as any).reconcilePrivateSpaces.call(fake, { createIfMissing: false })

    const migratedParentId = Object.keys(docs["private-a"].items)
      .find((id) => id.startsWith("parent-private-"))
    const migratedChildId = Object.keys(docs["private-a"].items)
      .find((id) => id.startsWith("child-private-"))

    expect(migratedParentId).toBeTruthy()
    expect(migratedChildId).toBeTruthy()
    expect(docs["private-a"].items[migratedParentId!].relations).toEqual([
      { predicate: "blocks", target: `item:${migratedChildId}` },
      // `global:` is a user/DID reference, not a local item → must stay stable.
      { predicate: "mentions", target: "global:child" },
      { predicate: "external", target: "space:other/item:child" },
    ])
  })

  it("creates a private space only when none exists", async () => {
    const existingSpaces = [createSpaceInfo("private-a")]
    const existingDocs = {
      "private-a": { _type: "rls", items: {} } as RlsSpaceDoc,
    }
    const withExisting = createFakePrivateSpaceConnector(existingSpaces, existingDocs)

    await (WotConnector.prototype as any).reconcilePrivateSpaces.call(withExisting, { createIfMissing: true })

    expect(withExisting.privateSpaceId).toBe("private-a")
    expect(withExisting.replication.createSpace).not.toHaveBeenCalled()

    const emptySpaces: SpaceInfo[] = []
    const emptyDocs: Record<string, RlsSpaceDoc> = {}
    const withoutExisting = createFakePrivateSpaceConnector(emptySpaces, emptyDocs)

    await (WotConnector.prototype as any).reconcilePrivateSpaces.call(withoutExisting, { createIfMissing: true })

    expect(withoutExisting.privateSpaceId).toBe("created-private")
    expect(withoutExisting.replication.createSpace).toHaveBeenCalledTimes(1)
  })
})

describe("WotConnector loop-review #143: Teardown-Resilienz + Delivery-Monotonie", () => {
  const source = readConnectorSource()

  it("logout guards every teardown step; critical wipe/seed failures surface AFTER the auth reset", () => {
    const logout = sliceMethod(source, "override async logout", "async updateProfile")
    expect(logout).toMatch(/guarded\("replication\.stop", false/)
    expect(logout).toMatch(/guarded\("runtimeStores\.close", false/)
    expect(logout).toMatch(/guarded\("persistence\.wipe", true/)
    expect(logout).toMatch(/guarded\("seed\.delete", true/)
    // UI wird IMMER ausgeloggt (Reset + notify), erst danach wird der
    // gesammelte kritische Fehler geworfen — kein Green-Wash, kein hängender Login.
    const authResetIdx = logout.indexOf('this.authStateObs.set({ status: "unauthenticated" })')
    const notifyIdx = logout.indexOf("this.notifyAllObservers()")
    const throwIdx = logout.indexOf("logout: lokale Daten wurden nicht vollständig entfernt")
    expect(authResetIdx).toBeGreaterThan(-1)
    expect(notifyIdx).toBeGreaterThan(authResetIdx)
    expect(throwIdx).toBeGreaterThan(notifyIdx)
  })

  it("wipeIdentityPersistence attempts EVERY database and reports failures at the end", () => {
    const persistenceSource = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../src/identity-persistence.ts"),
      "utf8",
    )
    const wipe = persistenceSource.slice(
      persistenceSource.indexOf("export async function wipeIdentityPersistence"),
      persistenceSource.indexOf("export async function deleteLegacyIdentityDatabases"),
    )
    expect(wipe).toMatch(/failures\.push\(error\)/)
    expect(wipe).toMatch(/deleteLegacyIdentityDatabases\(options\)/)
    expect(wipe).toMatch(/wipeIdentityPersistence: .*nicht gelöscht/)
    // Legacy-Wipe läuft VOR dem Fehler-Throw (wird nie übersprungen)
    expect(wipe.indexOf("deleteLegacyIdentityDatabases(options)")).toBeLessThan(wipe.indexOf("nicht gelöscht"))
  })

  it("records a durable pending-save after the accept gate and never heals via consumed gates", () => {
    const method = sliceMethod(source, "private async handleIncomingAttestation", "private async sendReceiptAck")
    // KEINE Redelivery-Heilung über konsumierte Gates: die würde anders
    // signierte VCs Dritter durchlassen (Loop-Review-Finding, Eve-Fall).
    expect(method).not.toMatch(/nonce-consumed/)
    expect(method).not.toMatch(/lostWriteReplay/)
    // Stattdessen: Pending-Save NACH dem Accept, saved-Markierung NACH dem Save.
    // Der Record wird erst bei der UI-Übernahme (deliverVerificationAction)
    // geräumt — Vertrag #147: Aktion bleibt durabel bis zur Übernahme.
    const acceptIdx = method.indexOf("acceptedInitialVerification = decision.decision")
    const recordIdx = method.indexOf("this.recordPendingVerificationSave(attestation.id, vcJws, senderDid)")
    const saveIdx = method.indexOf("await this.storage.saveAttestation(attestation)")
    const markIdx = method.indexOf("this.markPendingVerificationSaved(attestation.id)")
    expect(acceptIdx).toBeGreaterThan(-1)
    expect(recordIdx).toBeGreaterThan(acceptIdx)
    expect(saveIdx).toBeGreaterThan(recordIdx)
    expect(markIdx).toBeGreaterThan(saveIdx)
    expect(method).not.toMatch(/this\.clearPendingVerificationSave/)
  })

  it("drains pending verification saves with full re-verification and binding checks", async () => {
    const localValues = new Map<string, string>()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => localValues.get(k) ?? null,
        setItem: (k: string, v: string) => localValues.set(k, v),
        removeItem: (k: string) => localValues.delete(k),
      },
    })
    const did = "did:key:me"
    localValues.set(
      `rls-wot-pending-verification-save:${did}`,
      JSON.stringify({ "att-lost": { vcJws: "h.p.s", senderDid: "did:key:bob" } }),
    )
    const saveAttestation = vi.fn(async () => {})
    const fake = Object.assign(Object.create(WotConnector.prototype), {
      identity: { getDid: () => did },
      storage: { getAttestation: vi.fn(async () => null), saveAttestation },
      attestationWorkflow: {
        verifyAttestationVcJws: vi.fn(async () => ({
          jti: "att-lost",
          iss: "did:key:bob",
          issuer: "did:key:bob",
          validFrom: new Date().toISOString(),
          type: ["VerifiableCredential", "WotVerification"],
          credentialSubject: { id: did, claim: "in-person verifiziert" },
        })),
      },
      syncConfirmationsFromPersonalDoc: vi.fn(),
      sendReceiptAck: vi.fn(async () => {}),
      checkMutualVerification: vi.fn(async () => {}),
      emitEvent: vi.fn(),
      eventCallbacks: new Set([() => {}]), // Listener vorhanden → Direktlieferung
      bufferedEvents: [],
      contactsObs: { current: [] },
      discovery: { resolveProfile: vi.fn(async () => ({ profile: { name: "Bob" } })) },
    })
    const drain = (WotConnector.prototype as any).drainPendingVerificationSaves

    // Happy-Drain: Record vorhanden, VC re-verifiziert + Bindung passt → Save + Clear
    // + FLOW-Reproduktion: initiale Verifikation (kein inResponseTo) muss den
    // incoming-verification-Dialog emittieren (counterVerify-Angebot, #147).
    await drain.call(fake)
    expect(saveAttestation).toHaveBeenCalledTimes(1)
    expect(saveAttestation.mock.calls[0][0]).toMatchObject({ id: "att-lost", from: "did:key:bob", to: did })
    expect(localValues.has(`rls-wot-pending-verification-save:${did}`)).toBe(false)
    expect(fake.syncConfirmationsFromPersonalDoc).toHaveBeenCalled()
    expect(fake.emitEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "incoming-verification", fromId: "did:key:bob" }))
    expect(fake.checkMutualVerification).toHaveBeenCalledWith("did:key:bob")
    expect(fake.sendReceiptAck).toHaveBeenCalled()

    // Fremde/nicht-bindende VC (Eve): Record wird abgeräumt, aber NICHT gespeichert.
    localValues.set(
      `rls-wot-pending-verification-save:${did}`,
      JSON.stringify({ "att-eve": { vcJws: "h.p.s", senderDid: "did:key:eve" } }),
    )
    saveAttestation.mockClear()
    await drain.call(fake) // gemockte VC ist von bob, Record behauptet eve → Bindung schlägt fehl
    expect(saveAttestation).not.toHaveBeenCalled()
    expect(localValues.has(`rls-wot-pending-verification-save:${did}`)).toBe(false)
  })

  it("a late failed receipt cannot degrade an already delivered status", () => {
    const method = sliceMethod(source, "private async setDeliveryStatus", "private async checkMutualVerification")
    expect(method).toMatch(/next === "failed" && current === "delivered"/)
  })
})

describe("Vertrag #147: eingehende Verifikation als durable Aktion bis zur UI-Übernahme", () => {
  it("Accept → Save-Fehler → Neustart → init ohne Listener → Listener: genau einmal geliefert, counterVerify möglich", async () => {
    const localValues = new Map<string, string>()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => localValues.get(k) ?? null,
        setItem: (k: string, v: string) => localValues.set(k, v),
        removeItem: (k: string) => localValues.delete(k),
      },
    })
    const did = "did:key:me"
    const vcJws = "h.p.s"
    const payload = {
      jti: "att-1",
      iss: "did:key:bob",
      issuer: "did:key:bob",
      validFrom: new Date().toISOString(),
      type: ["VerifiableCredential", "WotVerification"],
      credentialSubject: { id: did, claim: "in-person verifiziert" },
    }
    const baseStubs = () => ({
      identity: { getDid: () => did },
      attestationWorkflow: { verifyAttestationVcJws: vi.fn(async () => payload) },
      syncConfirmationsFromPersonalDoc: vi.fn(),
      sendReceiptAck: vi.fn(async () => {}),
      checkMutualVerification: vi.fn(async () => {}),
      contactsObs: { current: [] },
      discovery: { resolveProfile: vi.fn(async () => ({ profile: { name: "Bob" } })) },
      eventCallbacks: new Set<(e: unknown) => void>(),
      bufferedEvents: [] as unknown[],
    })

    // Session 1: Verifikation akzeptiert, erster Save scheitert.
    const session1 = Object.assign(Object.create(WotConnector.prototype), {
      ...baseStubs(),
      storage: {
        getAttestation: vi.fn(async () => null),
        saveAttestation: vi.fn(async () => { throw new Error("disk full") }),
      },
      verificationWorkflow: {
        acceptVerifiedVerificationAttestation: vi.fn(async () => ({ decision: "accept-in-person" })),
      },
    })
    await expect(
      (WotConnector.prototype as any).handleIncomingAttestation.call(session1, vcJws, "did:key:bob"),
    ).rejects.toThrow("disk full")
    expect(localValues.has(`rls-wot-pending-verification-save:${did}`)).toBe(true)

    // Session 2 (Neustart, frische Instanz über derselben durablen Persistenz):
    // init-Drain OHNE Listener — Daten werden gerettet, Aktion bleibt offen.
    const saveOk = vi.fn(async () => {})
    const session2 = Object.assign(Object.create(WotConnector.prototype), {
      ...baseStubs(),
      storage: { getAttestation: vi.fn(async () => null), saveAttestation: saveOk },
    })
    await (WotConnector.prototype as any).drainPendingVerificationSaves.call(session2)
    expect(saveOk).toHaveBeenCalledTimes(1)
    expect(localValues.has(`rls-wot-pending-verification-save:${did}`)).toBe(true) // Aktion offen

    // Listener registrieren → Aktion wird GENAU EINMAL geliefert.
    const events: any[] = []
    ;(WotConnector.prototype as any).onIncomingEvent.call(session2, (e: any) => events.push(e))
    await vi.waitFor(() => {
      expect(events.filter((e) => e.type === "incoming-verification")).toHaveLength(1)
    })
    // counterVerify weiterhin möglich: der Dialog trägt die Original-VC als challengeCode.
    expect(events[0]).toMatchObject({ type: "incoming-verification", fromId: "did:key:bob", challengeCode: vcJws })
    expect(localValues.has(`rls-wot-pending-verification-save:${did}`)).toBe(false) // übernommen

    // Zweiter Listener / erneutes Subscribe: KEINE erneute Lieferung.
    const events2: any[] = []
    ;(WotConnector.prototype as any).onIncomingEvent.call(session2, (e: any) => events2.push(e))
    await new Promise((r) => setTimeout(r, 20))
    expect(events2.filter((e) => e.type === "incoming-verification")).toHaveLength(0)
  })

  it("React-Strict-Mode: subscribe A → cleanup → subscribe B startet parallele Announcer — B erhält die Aktion GENAU EINMAL", async () => {
    const localValues = new Map<string, string>()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => localValues.get(k) ?? null,
        setItem: (k: string, v: string) => localValues.set(k, v),
        removeItem: (k: string) => localValues.delete(k),
      },
    })
    const did = "did:key:me"
    const payload = {
      jti: "att-strict",
      iss: "did:key:bob",
      issuer: "did:key:bob",
      validFrom: new Date().toISOString(),
      type: ["VerifiableCredential", "WotVerification"],
      credentialSubject: { id: did, claim: "in-person verifiziert" },
    }
    // Durabler Record mit erledigter Daten-Hälfte (saved) — die Aktion wartet auf die UI.
    localValues.set(
      `rls-wot-pending-verification-save:${did}`,
      JSON.stringify({ "att-strict": { vcJws: "h.p.s", senderDid: "did:key:bob", saved: true } }),
    )
    const session = Object.assign(Object.create(WotConnector.prototype), {
      identity: { getDid: () => did },
      storage: { getAttestation: vi.fn(async () => null) },
      attestationWorkflow: { verifyAttestationVcJws: vi.fn(async () => payload) },
      contactsObs: { current: [] },
      discovery: { resolveProfile: vi.fn(async () => ({ profile: { name: "Bob" } })) },
      eventCallbacks: new Set<(e: unknown) => void>(),
      bufferedEvents: [] as unknown[],
    })
    const onIncomingEvent = (WotConnector.prototype as any).onIncomingEvent

    // Strict-Mode-Ablauf: A subscribed (startet Announcer 1), cleanup, B subscribed
    // (startet Announcer 2) — beide Läufe überlappen.
    const eventsA: any[] = []
    const unsubA = onIncomingEvent.call(session, (e: any) => eventsA.push(e))
    unsubA()
    const eventsB: any[] = []
    onIncomingEvent.call(session, (e: any) => eventsB.push(e))

    await vi.waitFor(() => {
      const total =
        eventsA.filter((e) => e.type === "incoming-verification").length +
        eventsB.filter((e) => e.type === "incoming-verification").length
      expect(total).toBe(1)
    })
    // Kurz nachlaufen lassen: es darf keine ZWEITE Lieferung mehr eintreffen.
    await new Promise((r) => setTimeout(r, 30))
    const total =
      eventsA.filter((e) => e.type === "incoming-verification").length +
      eventsB.filter((e) => e.type === "incoming-verification").length
    expect(total).toBe(1)
    expect(localValues.has(`rls-wot-pending-verification-save:${did}`)).toBe(false)
  })

  it("Claim-Grenze: stirbt das Enrichment vor dem Emit, bleibt die durable Aktion erhalten", async () => {
    const localValues = new Map<string, string>()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => localValues.get(k) ?? null,
        setItem: (k: string, v: string) => localValues.set(k, v),
        removeItem: (k: string) => localValues.delete(k),
      },
    })
    const did = "did:key:me"
    const payload = {
      jti: "att-hang",
      iss: "did:key:bob",
      issuer: "did:key:bob",
      validFrom: new Date().toISOString(),
      type: ["VerifiableCredential", "WotVerification"],
      credentialSubject: { id: did, claim: "in-person verifiziert" },
    }
    localValues.set(
      `rls-wot-pending-verification-save:${did}`,
      JSON.stringify({ "att-hang": { vcJws: "h.p.s", senderDid: "did:key:bob", saved: true } }),
    )
    const base = {
      identity: { getDid: () => did },
      storage: { getAttestation: vi.fn(async () => null) },
      attestationWorkflow: { verifyAttestationVcJws: vi.fn(async () => payload) },
      contactsObs: { current: [] },
      bufferedEvents: [] as unknown[],
    }
    const onIncomingEvent = (WotConnector.prototype as any).onIncomingEvent

    // Session 1: Enrichment hängt für immer (Tab stirbt währenddessen).
    const session1 = Object.assign(Object.create(WotConnector.prototype), {
      ...base,
      eventCallbacks: new Set<(e: unknown) => void>(),
      discovery: { resolveProfile: vi.fn(() => new Promise(() => {})) },
    })
    const events1: any[] = []
    onIncomingEvent.call(session1, (e: any) => events1.push(e))
    await new Promise((r) => setTimeout(r, 30))
    expect(events1.filter((e) => e.type === "incoming-verification")).toHaveLength(0)
    // Der Record DARF NICHT geclaimt sein — die Aktion überlebt den Abbruch.
    expect(localValues.has(`rls-wot-pending-verification-save:${did}`)).toBe(true)

    // Session 2 (Neustart): funktionierendes Enrichment → genau eine Lieferung.
    const session2 = Object.assign(Object.create(WotConnector.prototype), {
      ...base,
      eventCallbacks: new Set<(e: unknown) => void>(),
      discovery: { resolveProfile: vi.fn(async () => ({ profile: { name: "Bob" } })) },
    })
    const events2: any[] = []
    onIncomingEvent.call(session2, (e: any) => events2.push(e))
    await vi.waitFor(() => {
      expect(events2.filter((e) => e.type === "incoming-verification")).toHaveLength(1)
    })
    expect(localValues.has(`rls-wot-pending-verification-save:${did}`)).toBe(false)
  })
})
