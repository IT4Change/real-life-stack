import { beforeEach, describe, expect, it } from "vitest"
import { AttestationWorkflow, IdentityWorkflow, VerificationWorkflow } from "@real-life/wot-core/application"
import { WebCryptoProtocolCryptoAdapter } from "@real-life/wot-core"
import type { PublicIdentitySession } from "@real-life/wot-core/types"

import {
  LocalStorageVerificationStateStore,
  type KeyValueStorageLike,
} from "../src/verification-state-store.js"

function memoryStorage(): KeyValueStorageLike & { dump(): Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  }
}

const KEY = "rls-wot-verification-state:did:key:ztest"
const store = (storage: KeyValueStorageLike) =>
  new LocalStorageVerificationStateStore({ key: () => KEY, storage })

const pendingRecord = (overrides: Partial<Parameters<LocalStorageVerificationStateStore["recordPendingCounterVerification"]>[0]> = {}) => ({
  counterpartyDid: "did:key:zpeer",
  originalVerificationId: "urn:uuid:11111111-1111-4111-8111-111111111111",
  createdAt: "2026-08-04T10:00:00Z",
  expiresAt: "2026-08-04T10:05:00Z",
  ...overrides,
})

describe("LocalStorageVerificationStateStore", () => {
  let storage: ReturnType<typeof memoryStorage>

  beforeEach(() => {
    storage = memoryStorage()
  })

  it("mirrors the InMemory contract: tryConsumeNonce is one-shot and case-insensitive", async () => {
    const s = store(storage)
    expect(await s.tryConsumeNonce("Nonce-A", "2026-08-04T10:00:00Z")).toBe(true)
    expect(await s.tryConsumeNonce("nonce-a", "2026-08-04T10:00:01Z")).toBe(false)
    expect(await s.hasConsumedNonce("NONCE-A")).toBe(true)
    expect(await s.hasConsumedNonce("other")).toBe(false)
  })

  it("prunes consumed nonces strictly older than the cutoff", async () => {
    const s = store(storage)
    await s.recordConsumedNonce("old", "2026-08-03T09:00:00Z")
    await s.recordConsumedNonce("fresh", "2026-08-04T09:00:00Z")
    await s.pruneConsumedNonces("2026-08-04T00:00:00Z")
    expect(await s.hasConsumedNonce("old")).toBe(false)
    expect(await s.hasConsumedNonce("fresh")).toBe(true)
  })

  it("consumePendingCounterVerification covers consumed/missing/expired/wrong-counterparty", async () => {
    const s = store(storage)
    const record = pendingRecord()
    await s.recordPendingCounterVerification(record)

    expect(
      await s.consumePendingCounterVerification(record.originalVerificationId, "did:key:zother", "2026-08-04T10:01:00Z"),
    ).toBe("wrong-counterparty")
    // wrong-counterparty must leave the non-expired record in place
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

  it("survives a new instance over the same storage (Reload-Szenario)", async () => {
    const first = store(storage)
    await first.tryConsumeNonce("nonce-r", "2026-08-04T10:00:00Z")
    await first.recordPendingCounterVerification(pendingRecord())

    const second = store(storage)
    expect(await second.hasConsumedNonce("nonce-r")).toBe(true)
    expect(await second.getPendingCounterVerification(pendingRecord().originalVerificationId)).toMatchObject({
      counterpartyDid: "did:key:zpeer",
    })
  })

  it("treats corrupt JSON as empty state instead of throwing", async () => {
    storage.setItem(KEY, "{not json")
    const s = store(storage)
    expect(await s.hasConsumedNonce("x")).toBe(false)
    expect(await s.getPendingCounterVerifications()).toEqual([])
    // and keeps working (write-through repairs the blob)
    expect(await s.tryConsumeNonce("x", "2026-08-04T10:00:00Z")).toBe(true)
  })

  it("keeps working in-memory when the underlying storage throws", async () => {
    const broken: KeyValueStorageLike = {
      getItem: () => { throw new Error("denied") },
      setItem: () => { throw new Error("denied") },
      removeItem: () => { throw new Error("denied") },
    }
    const s = new LocalStorageVerificationStateStore({ key: () => KEY, storage: broken })
    expect(await s.tryConsumeNonce("n", "2026-08-04T10:00:00Z")).toBe(true)
    expect(await s.hasConsumedNonce("n")).toBe(true)
  })
})

describe("VerificationWorkflow mit LocalStorageVerificationStateStore (Reload-Szenarien)", () => {
  const protocolCrypto = new WebCryptoProtocolCryptoAdapter()
  let scannerIdentity: PublicIdentitySession
  let ownerIdentity: PublicIdentitySession
  let storage: ReturnType<typeof memoryStorage>

  beforeEach(async () => {
    const crypto = new WebCryptoProtocolCryptoAdapter()
    const identityWorkflow = new IdentityWorkflow({ crypto })
    scannerIdentity = (await identityWorkflow.createIdentity({ passphrase: "scanner", storeSeed: false })).identity
    ownerIdentity = (await identityWorkflow.createIdentity({ passphrase: "owner", storeSeed: false })).identity
    storage = memoryStorage()
  })

  const workflow = () =>
    new VerificationWorkflow({ crypto: protocolCrypto, stateStore: store(storage) })

  it("akzeptiert die Gegen-Verifizierung auch nach Workflow-Neuaufbau (Reload überlebt)", async () => {
    // Scanner-Seite vor dem Reload: Verifizierung erzeugen merkt den
    // pending counter im Store vor.
    const before = workflow()
    const verification = await before.createVerificationAttestation({
      issuer: scannerIdentity,
      subjectDid: ownerIdentity.getDid(),
      challengeNonce: "550e8400-e29b-41d4-a716-446655440000",
    })

    // Gegenseite antwortet (eigene Session, kein geteilter Store).
    const counter = await new VerificationWorkflow({ crypto: protocolCrypto }).createCounterVerificationAttestation({
      issuer: ownerIdentity,
      subjectDid: scannerIdentity.getDid(),
      inResponseTo: verification.id,
    })
    const payload = await new AttestationWorkflow({ crypto: protocolCrypto }).verifyAttestationVcJws(counter.vcJws)

    // Reload der Scanner-Seite: neue Workflow-Instanz über demselben Storage.
    // Ohne durablen Store wäre das 'no-pending-counter-verification'.
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

    // Owner-Session 1 hat die Nonce bereits konsumiert (z.B. Erst-Annahme).
    await store(storage).recordConsumedNonce(nonce, "2026-08-04T10:00:00Z")

    // Owner-Session 2 (Reload, keine aktive Challenge): dieselbe Verifizierung
    // nochmal → muss als Replay erkannt werden, nicht als remote-unbound.
    const after = workflow()
    expect(await after.acceptVerifiedVerificationAttestation(ownerIdentity, payload)).toEqual({
      decision: "reject",
      reason: "nonce-consumed",
    })
  })
})
