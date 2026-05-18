import { beforeEach, describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import {
  createObservable,
  type AuthState,
  type ContactInfo,
  type ClaimDeliveryStatus,
  type ConfirmationView,
  type Group,
  type RelayState,
  type SignedClaim,
  type User,
} from "@real-life-stack/data-interface"

import { WotConnector } from "../src/wot-connector.js"

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
}))

/**
 * Connector-level regression tests for the auth-scoped observable cleanup
 * slice. They cover two contracts that the WotConnector must satisfy on top
 * of the (already passing) confirmation projection:
 *
 *   1. WotConnector.logout() must reset every auth-scoped observable so a
 *      logged-out (or identity-switched) UI cannot keep rendering stale WoT
 *      state. PR #11 introduced `confirmationsObs`, which logout still
 *      ignores — and `claimsObs` / `deliveryStatusObs` are not cleared
 *      either, even though they are auth-scoped.
 *
 *   2. WotConnector.setAccepted() must refresh both the legacy
 *      `SignedClaim` projection and the new `ConfirmationView` projection
 *      immediately, so `isAccepted` changes are reflected without waiting
 *      for an attestation-map change event.
 *
 * Because WotConnector itself is intentionally hard to instantiate in unit
 * tests (it depends on WotIdentity, WebSocket, Yjs, IndexedDB, …) we follow
 * the established package convention and combine two layers of checks:
 *
 *   - A regression guard that inspects the connector source directly. The
 *     red phase requires logout to reset the new auth-scoped observables
 *     and setAccepted to call syncClaimsFromPersonalDoc; both are missing
 *     today and must be added before this slice can go green.
 *
 *   - Behavioural simulations using the same primitives (`createObservable`
 *     and `mapPersonalDocConfirmations`) that the connector uses, so the
 *     intent of the contract is documented and exercised end-to-end.
 */

// --- Source resolution ----------------------------------------------------

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
    throw new Error(
      `Failed to slice method body between "${startMarker}" and "${endMarker}"`,
    )
  }
  return source.slice(start, end)
}

// --- Layer 1: Source-level regression guards -----------------------------

describe("WotConnector.logout() — auth-scoped observable reset (source guard)", () => {
  const source = readConnectorSource()
  const logout = sliceMethod(source, "override async logout", "override async getCurrentUser")

  it("resets the new ConfirmationView observable", () => {
    expect(logout).toMatch(/confirmationsObs\.set\(\[\]\)/)
  })

  it("resets the legacy SignedClaim observable", () => {
    expect(logout).toMatch(/claimsObs\.set\(\[\]\)/)
  })

  it("resets the delivery-status observable", () => {
    expect(logout).toMatch(/deliveryStatusObs\.set\(new Map/)
  })

  it("still resets the previously cleaned-up group/user observables", () => {
    // These resets predate this slice — guard against accidental regression
    // while we add the new confirmation/claim/delivery resets above.
    expect(logout).toMatch(/currentGroupObservable\.set\(null\)/)
    expect(logout).toMatch(/groupsObservable\.set\(\[\]\)/)
    expect(logout).toMatch(/currentUserObs\.set\(null\)/)
    expect(logout).toMatch(/authStateObs\.set\(\{\s*status:\s*"unauthenticated"\s*\}\)/)
  })
})

describe("WotConnector.setAccepted() — metadata-only refresh (source guard)", () => {
  const source = readConnectorSource()
  const setAccepted = sliceMethod(
    source,
    "override async setAccepted",
    "override observeDeliveryStatuses",
  )

  it("refreshes the claim/confirmation projections after mutating metadata", () => {
    expect(setAccepted).toMatch(/syncClaimsFromPersonalDoc\(\)/)
  })

  it("still mutates attestationMetadata.accepted (regression for existing behaviour)", () => {
    expect(setAccepted).toMatch(/attestationMetadata\[id\]\.accepted\s*=\s*accepted/)
  })
})

describe("Confirmation projection — must not absorb delivery/outbox/QR concerns (source guard)", () => {
  it("mapPersonalDocConfirmations stays generic and free of transport fields", () => {
    const projection = readFileSync(CONFIRMATIONS_SRC, "utf8")
    const forbidden = [
      "deliveryStatus",
      "observeDeliveryStatuses",
      "retryClaim",
      "getOutboxPendingCount",
      "createChallenge",
    ]
    for (const term of forbidden) {
      expect(projection).not.toMatch(new RegExp(term))
    }
  })
})

// --- Layer 2: Behavioural simulation -------------------------------------

interface ConnectorObservableSnapshot {
  authState: AuthState
  contacts: ContactInfo[]
  claims: SignedClaim[]
  confirmations: ConfirmationView[]
  deliveryStatuses: Map<string, ClaimDeliveryStatus>
  relayState: RelayState
  outboxCount: number
  currentGroup: Group | null
  groups: Group[]
  currentUser: User | null
}

/**
 * Minimal stand-in for the auth-scoped observable bundle that
 * WotConnector keeps. Mirrors the fields touched by logout() and by the
 * setAccepted → syncClaimsFromPersonalDoc refresh path.
 */
function createConnectorObservables() {
  const authStateObs = createObservable<AuthState>({ status: "loading" })
  const contactsObs = createObservable<ContactInfo[]>([])
  const claimsObs = createObservable<SignedClaim[]>([])
  const confirmationsObs = createObservable<ConfirmationView[]>([])
  const deliveryStatusObs = createObservable<Map<string, ClaimDeliveryStatus>>(new Map())
  const relayStateObs = createObservable<RelayState>("disconnected")
  const outboxCountObs = createObservable<number>(0)
  const currentGroupObs = createObservable<Group | null>(null)
  const groupsObs = createObservable<Group[]>([])
  const currentUserObs = createObservable<User | null>(null)

  return {
    authStateObs,
    contactsObs,
    claimsObs,
    confirmationsObs,
    deliveryStatusObs,
    relayStateObs,
    outboxCountObs,
    currentGroupObs,
    groupsObs,
    currentUserObs,
    snapshot(): ConnectorObservableSnapshot {
      return {
        authState: authStateObs.current,
        contacts: contactsObs.current,
        claims: claimsObs.current,
        confirmations: confirmationsObs.current,
        deliveryStatuses: deliveryStatusObs.current,
        relayState: relayStateObs.current,
        outboxCount: outboxCountObs.current,
        currentGroup: currentGroupObs.current,
        groups: groupsObs.current,
        currentUser: currentUserObs.current,
      }
    },
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
  obs.claimsObs.set([
    {
      id: "att-1",
      from: "did:key:alice",
      to: "did:key:bob",
      claim: "is trustworthy",
      createdAt: "2026-04-14T10:30:00Z",
      isAccepted: true,
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
  obs.deliveryStatusObs.set(new Map([["att-1", "queued" as ClaimDeliveryStatus]]))
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
    wsAdapter: { disconnect: vi.fn(async () => {}) },
    contactsUnsub: vi.fn(),
    verificationsUnsub: vi.fn(),
    attestationsUnsub: vi.fn(),
    profileUnsub: vi.fn(),
    storage: { marker: "storage" },
    currentGroupId: "g1",
    currentGroupObservable: obs.currentGroupObs,
    groupsCache: [{ id: "g1", name: "Crew" }],
    groupsObservable: obs.groupsObs,
    confirmationsObs: obs.confirmationsObs,
    claimsObs: obs.claimsObs,
    deliveryStatusObs: obs.deliveryStatusObs,
    contactsObs: obs.contactsObs,
    outboxCountObs: obs.outboxCountObs,
    relayStateObs: obs.relayStateObs,
    profileObs: createObservable<User | null>(user),
    syncPendingObs: createObservable<boolean>(true),
    currentUserObs: obs.currentUserObs,
    authStateObs: obs.authStateObs,
    identity: { deleteStoredIdentity: vi.fn(async () => {}) },
    notifyAllObservers: vi.fn(),
  }
}

describe("WotConnector.logout() — real method regression", () => {
  beforeEach(() => {
    yjsMockState.personalDoc = {}
  })

  it("clears auth-scoped observables when the real logout method runs", async () => {
    const fake = createFakeConnectorForLogout()
    const contactsUnsub = fake.contactsUnsub
    const verificationsUnsub = fake.verificationsUnsub
    const attestationsUnsub = fake.attestationsUnsub
    const profileUnsub = fake.profileUnsub

    await WotConnector.prototype.logout.call(fake as any)

    expect(fake.confirmationsObs.current).toEqual([])
    expect(fake.claimsObs.current).toEqual([])
    expect(fake.deliveryStatusObs.current.size).toBe(0)
    expect(fake.contactsObs.current).toEqual([])
    expect(fake.outboxCountObs.current).toBe(0)
    expect(fake.relayStateObs.current).toBe("disconnected")
    expect(fake.profileObs.current).toBeNull()
    expect(fake.syncPendingObs.current).toBe(false)
    expect(fake.currentGroupObservable.current).toBeNull()
    expect(fake.groupsObservable.current).toEqual([])
    expect(fake.currentUserObs.current).toBeNull()
    expect(fake.authStateObs.current).toEqual({ status: "unauthenticated" })
    expect(contactsUnsub).toHaveBeenCalled()
    expect(verificationsUnsub).toHaveBeenCalled()
    expect(attestationsUnsub).toHaveBeenCalled()
    expect(profileUnsub).toHaveBeenCalled()
    expect(fake.storage).toBeNull()
  })
})

describe("WotConnector.setAccepted() — real method regression", () => {
  beforeEach(() => {
    yjsMockState.personalDoc = {
      attestationMetadata: {
        "att-1": {
          attestationId: "att-1",
          accepted: false,
          acceptedAt: null,
        },
      },
    }
  })

  it("refreshes projections after mutating attestation metadata", async () => {
    const fake = {
      syncClaimsFromPersonalDoc: vi.fn(),
    }

    await WotConnector.prototype.setAccepted.call(fake as any, "att-1", true)

    expect(yjsMockState.personalDoc.attestationMetadata["att-1"].accepted).toBe(true)
    expect(yjsMockState.personalDoc.attestationMetadata["att-1"].acceptedAt).toEqual(expect.any(String))
    expect(fake.syncClaimsFromPersonalDoc).toHaveBeenCalledTimes(1)
  })
})
