import { IDBFactory } from "fake-indexeddb"
import { beforeEach, describe, expect, it } from "vitest"
import { AttestationWorkflow, IdentityWorkflow, VerificationWorkflow } from "@real-life/wot-core/application"
import { WebCryptoProtocolCryptoAdapter } from "@real-life/wot-core"
import type { PublicIdentitySession } from "@real-life/wot-core/types"

import { IndexedDbVerificationStateStore } from "../src/verification-state-store.js"
import { IDENTITY_DATABASE_PREFIXES, deleteIndexedDatabase, identityDatabaseName } from "../src/identity-persistence.js"

const DID = "did:key:ztest"
const DB_NAME = identityDatabaseName("verificationState", DID)

const store = () => new IndexedDbVerificationStateStore({ databaseName: () => DB_NAME })

const pendingRecord = (overrides: Partial<{
  counterpartyDid: string
  originalVerificationId: string
  createdAt: string
  expiresAt: string
}> = {}) => ({
  counterpartyDid: "did:key:zpeer",
  originalVerificationId: "urn:uuid:11111111-1111-4111-8111-111111111111",
  createdAt: "2026-08-04T10:00:00Z",
  expiresAt: "2026-08-04T10:05:00Z",
  ...overrides,
})

/** Schreibt einen rohen (ggf. ungültigen) Record direkt in die DB. */
async function seedRawPending(key: string, value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains("nonces")) db.createObjectStore("nonces")
      if (!db.objectStoreNames.contains("pending")) db.createObjectStore("pending")
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const txn = db.transaction("pending", "readwrite")
      txn.objectStore("pending").put(value, key)
      txn.oncomplete = () => { db.close(); resolve() }
      txn.onerror = () => { db.close(); reject(txn.error) }
    }
  })
}

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: new IDBFactory(),
    writable: true,
  })
})

describe("IndexedDbVerificationStateStore", () => {
  it("ist im Identity-Wipe-Register eingetragen (DID-Lebenszyklus-Grenze)", () => {
    expect(IDENTITY_DATABASE_PREFIXES.verificationState).toBe("wot-verification-state")
  })

  it("mirrors the InMemory contract: tryConsumeNonce is one-shot and case-insensitive", async () => {
    const s = store()
    expect(await s.tryConsumeNonce("Nonce-A", "2026-08-04T10:00:00Z")).toBe(true)
    expect(await s.tryConsumeNonce("nonce-a", "2026-08-04T10:00:01Z")).toBe(false)
    expect(await s.hasConsumedNonce("NONCE-A")).toBe(true)
    expect(await s.hasConsumedNonce("other")).toBe(false)
  })

  it("Review-Repro Blocker 1: zwei Instanzen können dieselbe Nonce nicht beide konsumieren", async () => {
    const a = store()
    const b = store()
    // Beide Instanzen VOR dem Konsum benutzen (entspricht „vorhydriert").
    expect(await a.hasConsumedNonce("nonce-x")).toBe(false)
    expect(await b.hasConsumedNonce("nonce-x")).toBe(false)
    expect(await a.tryConsumeNonce("nonce-x", "2026-08-04T10:00:00Z")).toBe(true)
    expect(await b.tryConsumeNonce("nonce-x", "2026-08-04T10:00:01Z")).toBe(false)
  })

  it("Review-Repro Blocker 1b: doppelter Counter-Consume über zwei Instanzen ist einmalig", async () => {
    const record = pendingRecord()
    const a = store()
    const b = store()
    await a.recordPendingCounterVerification(record)
    expect(await b.getPendingCounterVerification(record.originalVerificationId)).not.toBeNull()
    expect(
      await a.consumePendingCounterVerification(record.originalVerificationId, record.counterpartyDid, "2026-08-04T10:01:00Z"),
    ).toBe("consumed")
    expect(
      await b.consumePendingCounterVerification(record.originalVerificationId, record.counterpartyDid, "2026-08-04T10:01:00Z"),
    ).toBe("missing")
  })

  it("Review-Repro Blocker 2: strukturell ungültige Records crashen weder Consume noch Prune", async () => {
    await seedRawPending("broken-null", null)
    await seedRawPending("broken-shape", { counterpartyDid: 42 })
    await seedRawPending("broken-time", pendingRecord({ originalVerificationId: "broken-time", expiresAt: "kein-datum" }))
    const s = store()
    expect(await s.consumePendingCounterVerification("broken-null", "did:key:zpeer", "2026-08-04T10:01:00Z")).toBe("missing")
    expect(await s.consumePendingCounterVerification("broken-shape", "did:key:zpeer", "2026-08-04T10:01:00Z")).toBe("missing")
    expect(await s.consumePendingCounterVerification("broken-time", "did:key:zpeer", "2026-08-04T10:01:00Z")).toBe("missing")
    await s.prunePendingCounterVerifications("2026-08-04T10:01:00Z")
    expect(await s.getPendingCounterVerifications()).toEqual([])
  })

  it("Review-Repro Blocker 3: der Identity-Wipe wirkt auch gegen eine lebende Store-Instanz", async () => {
    const s = store()
    await s.tryConsumeNonce("nonce-w", "2026-08-04T10:00:00Z")
    await s.recordPendingCounterVerification(pendingRecord())

    // Logout-Wipe: DB weg — die Instanz existiert weiter (langlebiger Workflow).
    await deleteIndexedDatabase(DB_NAME)

    expect(await s.hasConsumedNonce("nonce-w")).toBe(false)
    expect(await s.getPendingCounterVerification(pendingRecord().originalVerificationId)).toBeNull()
    // Re-Login derselben DID beginnt sauber.
    expect(await s.tryConsumeNonce("nonce-w", "2026-08-04T11:00:00Z")).toBe(true)
  })

  it("prunes consumed nonces strictly older than the cutoff", async () => {
    const s = store()
    await s.recordConsumedNonce("old", "2026-08-03T09:00:00Z")
    await s.recordConsumedNonce("fresh", "2026-08-04T09:00:00Z")
    await s.pruneConsumedNonces("2026-08-04T00:00:00Z")
    expect(await s.hasConsumedNonce("old")).toBe(false)
    expect(await s.hasConsumedNonce("fresh")).toBe(true)
  })

  it("Review-Follow-up #224: unparsebares consumedAt blockiert die Nonce nicht dauerhaft", async () => {
    const s = store()
    await s.recordConsumedNonce("stuck", "kein-datum")
    // Date.parse("kein-datum") = NaN — der Vergleich mit dem Cutoff ist immer
    // false; ohne expliziten Finite-Check überlebt der Eintrag jeden Prune.
    await s.pruneConsumedNonces("2026-08-04T00:00:00Z")
    expect(await s.hasConsumedNonce("stuck")).toBe(false)
    expect(await s.tryConsumeNonce("stuck", "2026-08-04T10:00:00Z")).toBe(true)
  })

  it("consumePendingCounterVerification covers consumed/missing/expired/wrong-counterparty", async () => {
    const s = store()
    const record = pendingRecord()
    await s.recordPendingCounterVerification(record)

    expect(
      await s.consumePendingCounterVerification(record.originalVerificationId, "did:key:zother", "2026-08-04T10:01:00Z"),
    ).toBe("wrong-counterparty")
    expect(await s.getPendingCounterVerification(record.originalVerificationId)).not.toBeNull()

    expect(
      await s.consumePendingCounterVerification(record.originalVerificationId, record.counterpartyDid, "2026-08-04T10:01:00Z"),
    ).toBe("consumed")
    expect(
      await s.consumePendingCounterVerification(record.originalVerificationId, record.counterpartyDid, "2026-08-04T10:01:00Z"),
    ).toBe("missing")

    const expired = pendingRecord({ originalVerificationId: "urn:uuid:22222222-2222-4222-8222-222222222222" })
    await s.recordPendingCounterVerification(expired)
    expect(
      await s.consumePendingCounterVerification(expired.originalVerificationId, expired.counterpartyDid, "2026-08-04T10:05:00Z"),
    ).toBe("expired")
    expect(await s.getPendingCounterVerification(expired.originalVerificationId)).toBeNull()
  })

  it("survives a new instance over the same database (Reload-Szenario)", async () => {
    const first = store()
    await first.tryConsumeNonce("nonce-r", "2026-08-04T10:00:00Z")
    await first.recordPendingCounterVerification(pendingRecord())

    const second = store()
    expect(await second.hasConsumedNonce("nonce-r")).toBe(true)
    expect(await second.getPendingCounterVerification(pendingRecord().originalVerificationId)).toMatchObject({
      counterpartyDid: "did:key:zpeer",
    })
  })

  it("degradiert ohne indexedDB auf volatiles Referenzverhalten statt zu werfen", async () => {
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined, writable: true })
    const s = store()
    expect(await s.tryConsumeNonce("n", "2026-08-04T10:00:00Z")).toBe(true)
    expect(await s.tryConsumeNonce("n", "2026-08-04T10:00:00Z")).toBe(false)
    expect(await s.hasConsumedNonce("n")).toBe(true)
  })
})

describe("VerificationWorkflow mit IndexedDbVerificationStateStore (Reload-Szenarien)", () => {
  const protocolCrypto = new WebCryptoProtocolCryptoAdapter()
  let scannerIdentity: PublicIdentitySession
  let ownerIdentity: PublicIdentitySession

  beforeEach(async () => {
    const crypto = new WebCryptoProtocolCryptoAdapter()
    const identityWorkflow = new IdentityWorkflow({ crypto })
    scannerIdentity = (await identityWorkflow.createIdentity({ passphrase: "scanner", storeSeed: false })).identity
    ownerIdentity = (await identityWorkflow.createIdentity({ passphrase: "owner", storeSeed: false })).identity
  })

  const workflow = () =>
    new VerificationWorkflow({ crypto: protocolCrypto, stateStore: store() })

  it("akzeptiert die Gegen-Verifizierung auch nach Workflow-Neuaufbau (Reload überlebt)", async () => {
    const before = workflow()
    const verification = await before.createVerificationAttestation({
      issuer: scannerIdentity,
      subjectDid: ownerIdentity.getDid(),
      challengeNonce: "550e8400-e29b-41d4-a716-446655440000",
    })

    const counter = await new VerificationWorkflow({ crypto: protocolCrypto }).createCounterVerificationAttestation({
      issuer: ownerIdentity,
      subjectDid: scannerIdentity.getDid(),
      inResponseTo: verification.id,
    })
    const payload = await new AttestationWorkflow({ crypto: protocolCrypto }).verifyAttestationVcJws(counter.vcJws)

    // Reload der Scanner-Seite: neue Workflow-Instanz über derselben DB.
    const after = workflow()
    expect(await after.acceptVerifiedCounterVerification(scannerIdentity, payload)).toEqual({
      decision: "accept-mutual-in-person",
      originalVerificationId: verification.id,
    })
  })

  it("erkennt einen Nonce-Replay auch nach Workflow-Neuaufbau als nonce-consumed", async () => {
    const nonce = "123e4567-e89b-42d3-a456-426614174000"
    const verification = await new VerificationWorkflow({ crypto: protocolCrypto }).createVerificationAttestation({
      issuer: scannerIdentity,
      subjectDid: ownerIdentity.getDid(),
      challengeNonce: nonce,
    })
    const payload = await new AttestationWorkflow({ crypto: protocolCrypto }).verifyAttestationVcJws(verification.vcJws)

    await store().recordConsumedNonce(nonce, "2026-08-04T10:00:00Z")

    const after = workflow()
    expect(await after.acceptVerifiedVerificationAttestation(ownerIdentity, payload)).toEqual({
      decision: "reject",
      reason: "nonce-consumed",
    })
  })
})
