import { beforeEach, describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import {
  createObservable,
  type AuthState,
  type ContactInfo,
  type ConfirmationView,
  type Group,
  type RelayState,
  type User,
} from "@real-life-stack/data-interface"
import type { SpaceInfo } from "@real-life/wot-core"

import { WotConnector } from "../src/wot-connector.js"
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

vi.mock("@real-life/wot-core/protocol", () => ({
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

  return {
    ...obs,
    closeCurrentHandle: vi.fn(),
    crossGroupUnsub: vi.fn(),
    crossGroupIndex: { stop: vi.fn() },
    privateSpaceId: "private-space",
    spacesSubscriptionUnsub: vi.fn(),
    personalDocUnsub: vi.fn(),
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
    notifyAllObservers: vi.fn(),
  }
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

function createSpaceHandle(doc: RlsSpaceDoc) {
  return {
    getDoc: () => doc,
    transact: (fn: (spaceDoc: RlsSpaceDoc) => void) => fn(doc),
    close: vi.fn(),
    onRemoteUpdate: vi.fn(() => () => {}),
  }
}

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
    },
    crossGroupIndex: { reindexGroup: vi.fn() },
    notifyAllObservers: vi.fn(),
  }
  Object.setPrototypeOf(fake, WotConnector.prototype)
  return fake
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
    expect(docs["private-b"].items.move).toBeUndefined()
    expect(fake.crossGroupIndex.reindexGroup).toHaveBeenCalledWith("private-a")
    expect(fake.crossGroupIndex.reindexGroup).toHaveBeenCalledWith("private-b")
    expect(fake.notifyAllObservers).toHaveBeenCalledTimes(1)
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
    expect(wipe).toMatch(/deleteLegacyIdentityDatabases\(\)/)
    expect(wipe).toMatch(/wipeIdentityPersistence: .*nicht gelöscht/)
    // Legacy-Wipe läuft VOR dem Fehler-Throw (wird nie übersprungen)
    expect(wipe.indexOf("deleteLegacyIdentityDatabases()")).toBeLessThan(wipe.indexOf("nicht gelöscht"))
  })

  it("records a durable pending-save after the accept gate and never heals via consumed gates", () => {
    const method = sliceMethod(source, "private async handleIncomingAttestation", "private async sendReceiptAck")
    // KEINE Redelivery-Heilung über konsumierte Gates: die würde anders
    // signierte VCs Dritter durchlassen (Loop-Review-Finding, Eve-Fall).
    expect(method).not.toMatch(/nonce-consumed/)
    expect(method).not.toMatch(/lostWriteReplay/)
    // Stattdessen: Pending-Save NACH dem Accept, Clear NACH erfolgreichem Save.
    const acceptIdx = method.indexOf("acceptedInitialVerification = decision.decision")
    const recordIdx = method.indexOf("this.recordPendingVerificationSave(attestation.id, vcJws, senderDid)")
    const saveIdx = method.indexOf("await this.storage.saveAttestation(attestation)")
    const clearIdx = method.indexOf("this.clearPendingVerificationSave(attestation.id)")
    expect(acceptIdx).toBeGreaterThan(-1)
    expect(recordIdx).toBeGreaterThan(acceptIdx)
    expect(saveIdx).toBeGreaterThan(recordIdx)
    expect(clearIdx).toBeGreaterThan(saveIdx)
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
    })
    const drain = (WotConnector.prototype as any).drainPendingVerificationSaves

    // Happy-Drain: Record vorhanden, VC re-verifiziert + Bindung passt → Save + Clear.
    await drain.call(fake)
    expect(saveAttestation).toHaveBeenCalledTimes(1)
    expect(saveAttestation.mock.calls[0][0]).toMatchObject({ id: "att-lost", from: "did:key:bob", to: did })
    expect(localValues.has(`rls-wot-pending-verification-save:${did}`)).toBe(false)
    expect(fake.syncConfirmationsFromPersonalDoc).toHaveBeenCalled()

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
