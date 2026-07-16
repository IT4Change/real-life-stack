import { IDBFactory } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  IdentityWorkflow,
  WebCryptoProtocolCryptoAdapter,
  type PublicIdentitySession,
} from "@real-life/wot-core"
import type { Attestation, Contact } from "@real-life/wot-core/types"
import {
  YjsStorageAdapter,
  changeYjsPersonalDoc,
  flushYjsPersonalDoc,
  getYjsPersonalDoc,
  initYjsPersonalDoc,
  resetYjsPersonalDoc,
} from "@real-life/adapter-yjs"

import { projectAttestationConfirmations } from "../src/confirmations.js"
import { WotConnector } from "../src/wot-connector.js"
import { LocalOutboxStore } from "../src/local-outbox-store.js"
import {
  identityDatabaseName,
  identityDatabaseNames,
} from "../src/identity-persistence.js"
import {
  initNamespacedYjsPersonalDoc,
  personalDocCompactStoreName,
} from "../src/personal-doc-persistence.js"

const ACTIVE_DID_MARKER = "rls-wot-active-did"
const LEGACY_COMPACT_STORE = "wot-yjs-compact-store"
const LEGACY_Y_INDEXEDDB_STORE = "personal-doc"

async function createIdentity(passphrase: string): Promise<PublicIdentitySession> {
  const workflow = new IdentityWorkflow({
    crypto: new WebCryptoProtocolCryptoAdapter(),
  })
  return (await workflow.createIdentity({ passphrase, storeSeed: false })).identity
}

function createContact(did: string): Contact {
  const now = new Date().toISOString()
  return {
    did,
    publicKey: "test-public-key",
    name: "Legacy contact",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }
}

function createAttestation(from: string, to: string): Attestation {
  return {
    id: "legacy-attestation",
    from,
    to,
    claim: "Legacy claim",
    createdAt: new Date().toISOString(),
    vcJws: "header.payload.signature",
  }
}

async function createDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => req.result.createObjectStore("legacy")
    req.onsuccess = () => {
      req.result.close()
      resolve()
    }
    req.onerror = () => reject(req.error)
  })
}

function databaseNames(): Promise<string[]> {
  return indexedDB.databases().then((databases) =>
    databases.flatMap((database) => database.name ? [database.name] : []),
  )
}

describe("PersonalDoc persistence isolation", () => {
  beforeEach(async () => {
    await resetYjsPersonalDoc()
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: new IDBFactory(),
      writable: true,
    })
    const localValues = new Map<string, string>()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => localValues.get(key) ?? null,
        removeItem: (key: string) => localValues.delete(key),
        setItem: (key: string, value: string) => localValues.set(key, value),
      },
      writable: true,
    })
    localStorage.removeItem(ACTIVE_DID_MARKER)
  })

  afterEach(async () => {
    await resetYjsPersonalDoc()
  })

  it("wipes markerless global legacy state before a fresh DID is projected", async () => {
    const legacyIdentity = await createIdentity("legacy-owner")
    const freshIdentity = await createIdentity("fresh-owner")
    const legacyStorage = new YjsStorageAdapter(legacyIdentity.getDid())

    // Seed the exact unsuffixed CompactStore path used by the 0.3.0 manager.
    await initYjsPersonalDoc(legacyIdentity)
    await legacyStorage.addContact(createContact("did:key:legacy-contact"))
    await legacyStorage.saveAttestation(createAttestation(
      legacyIdentity.getDid(),
      freshIdentity.getDid(),
    ))
    await flushYjsPersonalDoc()
    await resetYjsPersonalDoc()

    // Also simulate the historical y-indexeddb namespace. No DID marker exists.
    await createDatabase(LEGACY_Y_INDEXEDDB_STORE)
    expect(localStorage.getItem(ACTIVE_DID_MARKER)).toBeNull()

    await initNamespacedYjsPersonalDoc(freshIdentity)

    const storage = new YjsStorageAdapter(freshIdentity.getDid())
    const contacts = storage.watchContacts().getValue()
    const confirmations = projectAttestationConfirmations(
      storage.watchAllAttestations().getValue(),
    )

    expect(contacts).toEqual([])
    expect(confirmations).toEqual([])
    await expect(databaseNames()).resolves.toContain(
      personalDocCompactStoreName(freshIdentity.getDid()),
    )
    await expect(databaseNames()).resolves.not.toContain(LEGACY_COMPACT_STORE)
    await expect(databaseNames()).resolves.not.toContain(LEGACY_Y_INDEXEDDB_STORE)
  })

  it("keeps A and B isolated while preserving A across an A-B-A switch", async () => {
    const identityA = await createIdentity("identity-a")
    const identityB = await createIdentity("identity-b")
    const contact = createContact("did:key:contact-a")

    await initNamespacedYjsPersonalDoc(identityA)
    const storageA = new YjsStorageAdapter(identityA.getDid())
    await storageA.addContact(contact)
    await flushYjsPersonalDoc()
    await resetYjsPersonalDoc()

    await initNamespacedYjsPersonalDoc(identityB)
    const storageB = new YjsStorageAdapter(identityB.getDid())
    expect(storageB.watchContacts().getValue()).toEqual([])
    await resetYjsPersonalDoc()

    await initNamespacedYjsPersonalDoc(identityA)
    const restoredA = new YjsStorageAdapter(identityA.getDid())
    expect(restoredA.watchContacts().getValue()).toEqual([contact])

    await expect(databaseNames()).resolves.toEqual(expect.arrayContaining([
      personalDocCompactStoreName(identityA.getDid()),
      personalDocCompactStoreName(identityB.getDid()),
    ]))
  })

  it("logout closes active stores and fully wipes every database of the DID", async () => {
    const identityA = await createIdentity("logout-owner")
    const identityB = await createIdentity("next-owner")
    const did = identityA.getDid()

    await initNamespacedYjsPersonalDoc(identityA)
    const storageA = new YjsStorageAdapter(did)
    await storageA.addContact(createContact("did:key:logout-contact"))
    await storageA.saveAttestation(createAttestation(did, identityB.getDid()))
    const now = new Date().toISOString()
    changeYjsPersonalDoc((doc) => {
      doc.profile = {
        did,
        name: "Logout Owner",
        bio: "must be wiped",
        avatar: null,
        offersJson: null,
        needsJson: null,
        createdAt: now,
        updatedAt: now,
      }
    })
    await flushYjsPersonalDoc()

    const outbox = new LocalOutboxStore(identityDatabaseName("outbox", did))
    await outbox.open()
    for (const name of identityDatabaseNames(did)) {
      if (name !== personalDocCompactStoreName(did) && name !== identityDatabaseName("outbox", did)) {
        await createDatabase(name)
      }
    }

    const connector = new WotConnector({
      relayUrl: "ws://localhost:1234",
      profilesUrl: "http://localhost:1235",
    })
    Object.assign(connector as any, {
      identity: {
        getDid: () => did,
        deleteStoredIdentity: async () => {},
      },
      outboxStore: outbox,
    })

    await connector.logout()

    const afterLogout = await databaseNames()
    for (const name of identityDatabaseNames(did)) expect(afterLogout).not.toContain(name)

    await initNamespacedYjsPersonalDoc(identityB)
    expect(getYjsPersonalDoc().profile).toBeNull()
    expect(new YjsStorageAdapter(identityB.getDid()).watchContacts().getValue()).toEqual([])
    await resetYjsPersonalDoc()

    await initNamespacedYjsPersonalDoc(identityA)
    const reloginStorage = new YjsStorageAdapter(did)
    expect(getYjsPersonalDoc().profile).toBeNull()
    expect(reloginStorage.watchContacts().getValue()).toEqual([])
    expect(reloginStorage.watchAllAttestations().getValue()).toEqual([])
  })

  it("uses the same full wipe for identity-switch cleanup", async () => {
    const identity = await createIdentity("switch-owner")
    const did = identity.getDid()
    for (const name of identityDatabaseNames(did)) await createDatabase(name)

    const connector = new WotConnector({
      relayUrl: "ws://localhost:1234",
      profilesUrl: "http://localhost:1235",
    })
    await (connector as any).cleanupOldIdentity(did)

    const remaining = await databaseNames()
    for (const name of identityDatabaseNames(did)) expect(remaining).not.toContain(name)
  })
})
