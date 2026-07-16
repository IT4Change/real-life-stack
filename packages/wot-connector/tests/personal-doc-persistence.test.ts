// The linked 0.3.0 core supplies fake-indexeddb for its adapter tests. Import
// its factory through that declared package link so this package-only bugfix
// does not require a workspace-root lockfile change.
import IDBFactory from "../node_modules/@real-life/wot-core/node_modules/fake-indexeddb/lib/FDBFactory.js"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  IdentityWorkflow,
  WebCryptoProtocolCryptoAdapter,
  type PublicIdentitySession,
} from "@real-life/wot-core"
import type { Attestation, Contact } from "@real-life/wot-core/types"
import {
  YjsStorageAdapter,
  flushYjsPersonalDoc,
  initYjsPersonalDoc,
  resetYjsPersonalDoc,
} from "@real-life/adapter-yjs"

import { projectAttestationConfirmations } from "../src/confirmations.js"
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
})
