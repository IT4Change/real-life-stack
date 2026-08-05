import type { PendingCounterVerificationRecord, VerificationStateStore } from "@real-life/wot-core/ports"
import { InMemoryVerificationStateStore } from "@real-life/wot-core/adapters"

const NONCES_STORE = "nonces"
const PENDING_STORE = "pending"
const CHALLENGE_STORE = "challenge"
const CHALLENGE_KEY = "active"
// v2: challenge-Store für die durable aktive QR-Challenge (Entscheidung 1c).
const DB_VERSION = 2

export interface IndexedDbVerificationStateStoreOptions {
  /**
   * DID-namespaced DB-Name, pro Aufruf aufgelöst (die Identität steht beim
   * Konstruieren des Connectors noch nicht fest). Muss aus
   * identityDatabaseName("verificationState", did) kommen, damit der
   * Identity-Wipe die DB über das Register mit abräumt.
   */
  databaseName: () => string
}

interface StoredNonce {
  consumedAt: string
}

function isStoredNonce(value: unknown): value is StoredNonce {
  return typeof value === "object" && value !== null
    && typeof (value as StoredNonce).consumedAt === "string"
}

/** Wire-Form der Trust-002-Challenge (ActiveQrChallengeRecord aus dem Port). */
interface StoredChallenge {
  did: string
  name: string
  enc: string
  nonce: string
  ts: string
  broker?: string
}

function isStoredChallenge(value: unknown): value is StoredChallenge {
  if (typeof value !== "object" || value === null) return false
  const record = value as StoredChallenge
  return typeof record.did === "string"
    && typeof record.name === "string"
    && typeof record.enc === "string"
    && typeof record.nonce === "string"
    && typeof record.ts === "string"
    && (record.broker === undefined || typeof record.broker === "string")
}

function isPendingRecord(value: unknown): value is PendingCounterVerificationRecord {
  if (typeof value !== "object" || value === null) return false
  const record = value as PendingCounterVerificationRecord
  return typeof record.counterpartyDid === "string"
    && typeof record.originalVerificationId === "string"
    && typeof record.createdAt === "string"
    && typeof record.expiresAt === "string"
    && Number.isFinite(Date.parse(record.expiresAt))
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"))
  })
}

/**
 * Durable Trust-002-Zustandsgrenze (konsumierte Nonces + ausstehende
 * Gegen-Verifizierungen) über eine DID-gebundene IndexedDB.
 *
 * Bewusst zustandslos: jede Operation öffnet die DB, läuft in genau einer
 * Transaktion und schließt wieder. Damit gilt die atomare One-Shot-Garantie
 * des Ports echt — über Instanzen und Tabs hinweg (readwrite-Transaktionen
 * serialisieren) — und der Identity-Wipe trifft nie eine offene Verbindung
 * oder einen vorhydrierten RAM-Zustand.
 *
 * Ohne indexedDB (Nicht-Browser-Umgebung) degradiert der Store auf die
 * volatile InMemory-Referenzimplementierung des Ports — der Stand vor diesem
 * Feature, nie schlechter.
 */
export class IndexedDbVerificationStateStore implements VerificationStateStore {
  private readonly options: IndexedDbVerificationStateStoreOptions
  private volatileFallback: InMemoryVerificationStateStore | null = null

  constructor(options: IndexedDbVerificationStateStoreOptions) {
    this.options = options
  }

  private fallback(): VerificationStateStore | null {
    const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB
    if (factory) return null
    this.volatileFallback ??= new InMemoryVerificationStateStore()
    return this.volatileFallback
  }

  private async withTransaction<T>(
    storeName: typeof NONCES_STORE | typeof PENDING_STORE | typeof CHALLENGE_STORE,
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.options.databaseName(), DB_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        for (const name of [NONCES_STORE, PENDING_STORE, CHALLENGE_STORE]) {
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"))
    })
    try {
      const txn = db.transaction(storeName, mode)
      const result = await work(txn.objectStore(storeName))
      await new Promise<void>((resolve, reject) => {
        txn.oncomplete = () => resolve()
        txn.onabort = () => reject(txn.error ?? new Error("IndexedDB transaction aborted"))
        txn.onerror = () => reject(txn.error ?? new Error("IndexedDB transaction failed"))
      })
      return result
    } finally {
      db.close()
    }
  }

  async recordConsumedNonce(nonce: string, consumedAt: string): Promise<void> {
    const fallback = this.fallback()
    if (fallback) return fallback.recordConsumedNonce(nonce, consumedAt)
    await this.withTransaction(NONCES_STORE, "readwrite", async (nonces) => {
      await requestResult(nonces.put({ consumedAt } satisfies StoredNonce, nonce.toLowerCase()))
    })
  }

  async tryConsumeNonce(nonce: string, consumedAt: string): Promise<boolean> {
    const fallback = this.fallback()
    if (fallback) return fallback.tryConsumeNonce(nonce, consumedAt)
    const normalizedNonce = nonce.toLowerCase()
    return this.withTransaction(NONCES_STORE, "readwrite", async (nonces) => {
      const existing = await requestResult(nonces.get(normalizedNonce))
      if (existing !== undefined) return false
      await requestResult(nonces.put({ consumedAt } satisfies StoredNonce, normalizedNonce))
      return true
    })
  }

  async hasConsumedNonce(nonce: string): Promise<boolean> {
    const fallback = this.fallback()
    if (fallback) return fallback.hasConsumedNonce(nonce)
    return this.withTransaction(NONCES_STORE, "readonly", async (nonces) => {
      return (await requestResult(nonces.get(nonce.toLowerCase()))) !== undefined
    })
  }

  async pruneConsumedNonces(olderThan: string): Promise<void> {
    const fallback = this.fallback()
    if (fallback) return fallback.pruneConsumedNonces(olderThan)
    const cutoff = Date.parse(olderThan)
    await this.withTransaction(NONCES_STORE, "readwrite", async (nonces) => {
      const keys = await requestResult(nonces.getAllKeys())
      const values = await requestResult(nonces.getAll())
      for (let i = 0; i < keys.length; i++) {
        const value = values[i]
        // Unlesbare Einträge (falsche Form ODER unparsebares consumedAt)
        // werden mit gewischt — Date.parse → NaN besteht jeden Vergleich und
        // würde die Nonce sonst dauerhaft blockieren (#224).
        const consumedAtMs = isStoredNonce(value) ? Date.parse(value.consumedAt) : Number.NaN
        if (!Number.isFinite(consumedAtMs) || consumedAtMs < cutoff) {
          await requestResult(nonces.delete(keys[i]))
        }
      }
    })
  }

  async recordPendingCounterVerification(pending: PendingCounterVerificationRecord): Promise<void> {
    const fallback = this.fallback()
    if (fallback) return fallback.recordPendingCounterVerification(pending)
    await this.withTransaction(PENDING_STORE, "readwrite", async (store) => {
      await requestResult(store.put({ ...pending }, pending.originalVerificationId))
    })
  }

  async getPendingCounterVerification(originalVerificationId: string): Promise<PendingCounterVerificationRecord | null> {
    const fallback = this.fallback()
    if (fallback) return fallback.getPendingCounterVerification(originalVerificationId)
    return this.withTransaction(PENDING_STORE, "readonly", async (store) => {
      const record = await requestResult(store.get(originalVerificationId))
      return isPendingRecord(record) ? { ...record } : null
    })
  }

  async getPendingCounterVerifications(): Promise<PendingCounterVerificationRecord[]> {
    const fallback = this.fallback()
    if (fallback) return fallback.getPendingCounterVerifications()
    return this.withTransaction(PENDING_STORE, "readonly", async (store) => {
      const records = await requestResult(store.getAll())
      return records.filter(isPendingRecord).map((record) => ({ ...record }))
    })
  }

  async deletePendingCounterVerification(originalVerificationId: string): Promise<void> {
    const fallback = this.fallback()
    if (fallback) return fallback.deletePendingCounterVerification(originalVerificationId)
    await this.withTransaction(PENDING_STORE, "readwrite", async (store) => {
      await requestResult(store.delete(originalVerificationId))
    })
  }

  async consumePendingCounterVerification(
    originalVerificationId: string,
    counterpartyDid: string,
    now: string,
  ): Promise<"consumed" | "missing" | "expired" | "wrong-counterparty"> {
    const fallback = this.fallback()
    if (fallback) return fallback.consumePendingCounterVerification(originalVerificationId, counterpartyDid, now)
    return this.withTransaction(PENDING_STORE, "readwrite", async (store) => {
      const record = await requestResult(store.get(originalVerificationId))
      if (record === undefined) return "missing"
      if (!isPendingRecord(record)) {
        // Strukturell ungültig = nie mehr legitim konsumierbar: entfernen und
        // wie fehlend behandeln statt zu crashen (Review-Blocker 2).
        await requestResult(store.delete(originalVerificationId))
        return "missing"
      }
      if (Date.parse(record.expiresAt) <= Date.parse(now)) {
        await requestResult(store.delete(originalVerificationId))
        return "expired"
      }
      if (record.counterpartyDid !== counterpartyDid) return "wrong-counterparty"
      await requestResult(store.delete(originalVerificationId))
      return "consumed"
    })
  }

  async prunePendingCounterVerifications(now: string): Promise<void> {
    const fallback = this.fallback()
    if (fallback) return fallback.prunePendingCounterVerifications(now)
    const nowMs = Date.parse(now)
    await this.withTransaction(PENDING_STORE, "readwrite", async (store) => {
      const keys = await requestResult(store.getAllKeys())
      const records = await requestResult(store.getAll())
      for (let i = 0; i < keys.length; i++) {
        const record = records[i]
        if (!isPendingRecord(record) || Date.parse(record.expiresAt) <= nowMs) {
          await requestResult(store.delete(keys[i]))
        }
      }
    })
  }

  // --- Aktive-QR-Challenge-Capability (Entscheidung 1c, core ≥ 0.5.4) ---

  async recordActiveQrChallenge(challenge: StoredChallenge): Promise<void> {
    const fallback = this.fallback()
    if (fallback) return fallback.recordActiveQrChallenge?.(challenge)
    await this.withTransaction(CHALLENGE_STORE, "readwrite", async (store) => {
      await requestResult(store.put({ ...challenge }, CHALLENGE_KEY))
    })
  }

  async getActiveQrChallenge(): Promise<StoredChallenge | null> {
    const fallback = this.fallback()
    if (fallback) return (await fallback.getActiveQrChallenge?.()) ?? null
    return this.withTransaction(CHALLENGE_STORE, "readonly", async (store) => {
      const record = await requestResult(store.get(CHALLENGE_KEY))
      return isStoredChallenge(record) ? { ...record } : null
    })
  }

  /**
   * Compare-and-delete in EINER readwrite-Transaktion: mit expectedNonce wird
   * atomar nur die erwartete Challenge gelöscht — ein verspätetes oder
   * instanzfremdes Clear kann eine neuere nie entfernen (Port-Vertrag).
   */
  async clearActiveQrChallenge(expectedNonce?: string): Promise<void> {
    const fallback = this.fallback()
    if (fallback) return fallback.clearActiveQrChallenge?.(expectedNonce)
    await this.withTransaction(CHALLENGE_STORE, "readwrite", async (store) => {
      if (expectedNonce !== undefined) {
        const record = await requestResult(store.get(CHALLENGE_KEY))
        if (!isStoredChallenge(record) || record.nonce !== expectedNonce) return
      }
      await requestResult(store.delete(CHALLENGE_KEY))
    })
  }
}
