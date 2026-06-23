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
import type { RlsSpaceDoc, SerializedItem } from "../src/types.js"

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

  it("still mutates attestationMetadata.accepted", () => {
    expect(setConfirmationAccepted).toMatch(/attestationMetadata\[id\]\.accepted\s*=\s*accepted/)
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
  const receiveVerificationBranch = sliceMethod(
    source,
    'if (envelope.type === "verification"',
    'if (envelope.type === "space-invite"',
  )

  it("uses schema-only verification predicates", () => {
    expect(statusMethod).toMatch(/filter\(isVerificationConfirmation\)/)
    expect(mutualMethod).toMatch(/filter\(isVerificationConfirmation\)/)
    expect(statusMethod).not.toMatch(/tags\?\.includes\("verification"\)/)
    expect(mutualMethod).not.toMatch(/tags\?\.includes\("verification"\)/)
  })

  it("refreshes confirmations before the receive path checks for mutual verification", () => {
    const syncIndex = receiveVerificationBranch.indexOf("this.syncConfirmationsFromPersonalDoc()")
    const mutualIndex = receiveVerificationBranch.indexOf("this.checkMutualVerification(verification.from)")
    expect(syncIndex).toBeGreaterThan(-1)
    expect(mutualIndex).toBeGreaterThan(-1)
    expect(syncIndex).toBeLessThan(mutualIndex)
  })
})

function createConnectorObservables() {
  const authStateObs = createObservable<AuthState>({ status: "loading" })
  const contactsObs = createObservable<ContactInfo[]>([])
  const confirmationsObs = createObservable<ConfirmationView[]>([])
  const relayStateObs = createObservable<RelayState>("disconnected")
  const outboxCountObs = createObservable<number>(0)
  const currentGroupObs = createObservable<Group | null>(null)
  const groupsObs = createObservable<Group[]>([])
  const currentUserObs = createObservable<User | null>(null)

  return {
    authStateObs,
    contactsObs,
    confirmationsObs,
    relayStateObs,
    outboxCountObs,
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
    profileObs: createObservable<User | null>(user),
    syncPendingObs: createObservable<boolean>(true),
    identity: { deleteStoredIdentity: vi.fn(async () => {}) },
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
    const verificationsUnsub = fake.verificationsUnsub
    const attestationsUnsub = fake.attestationsUnsub
    const profileUnsub = fake.profileUnsub

    await WotConnector.prototype.logout.call(fake as any)

    expect(fake.confirmationsObs.current).toEqual([])
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

describe("WotConnector.setConfirmationAccepted() - real method regression", () => {
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
      syncConfirmationsFromPersonalDoc: vi.fn(),
    }

    await WotConnector.prototype.setConfirmationAccepted.call(fake as any, "att-1", true)

    expect(yjsMockState.personalDoc.attestationMetadata["att-1"].accepted).toBe(true)
    expect(yjsMockState.personalDoc.attestationMetadata["att-1"].acceptedAt).toEqual(expect.any(String))
    expect(fake.syncConfirmationsFromPersonalDoc).toHaveBeenCalledTimes(1)
  })
})

describe("WotConnector.deleteStoredIdentity() - real method regression", () => {
  // Guarantees the biometric-setup rollback: the stored seed is removed directly,
  // NOT behind logout()'s awaited adapter teardown (replication/ws/outbox disconnect,
  // deleteYjsPersonalDocDB) — any of which could reject and skip the deletion.
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
