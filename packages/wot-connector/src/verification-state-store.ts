import type { PendingCounterVerificationRecord, VerificationStateStore } from "@real-life/wot-core/ports"

export interface KeyValueStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface PersistedVerificationState {
  consumedNonces: Record<string, string>
  pendingCounterVerifications: Record<string, PendingCounterVerificationRecord>
}

export interface LocalStorageVerificationStateStoreOptions {
  /**
   * DID-namespaced Storage-Key, pro Aufruf aufgelöst — die Identität steht
   * beim Konstruieren des Connectors noch nicht fest (gleiches Muster wie
   * rls-wot-pending-verification-save).
   */
  key: () => string
  /** Default: globalThis.localStorage (fehlt in Node-Tests — dann rein volatil). */
  storage?: KeyValueStorageLike
}

/**
 * Durable Trust-002-Zustandsgrenze (konsumierte Nonces + ausstehende
 * Gegen-Verifizierungen) über DID-namespaced localStorage.
 *
 * Quelle der Wahrheit sind in-memory Maps; jede Mutation schreibt best-effort
 * durch. Fällt Storage aus (Privacy-Modus, Quota), degradiert das Verhalten
 * exakt auf den bisherigen volatilen Stand — nie schlechter. Kein Cross-Tab-
 * Locking: der Verifizierungs-Flow läuft in genau einer Session.
 */
export class LocalStorageVerificationStateStore implements VerificationStateStore {
  private readonly options: LocalStorageVerificationStateStoreOptions
  private consumedNonces: Map<string, string> | null = null
  private pendingCounterVerifications: Map<string, PendingCounterVerificationRecord> | null = null
  private hydratedKey: string | null = null

  constructor(options: LocalStorageVerificationStateStoreOptions) {
    this.options = options
  }

  private storage(): KeyValueStorageLike | undefined {
    if (this.options.storage) return this.options.storage
    try {
      return (globalThis as { localStorage?: KeyValueStorageLike }).localStorage
    } catch {
      return undefined
    }
  }

  /** Hydriert lazily; bei DID-Wechsel (neuer Key) wird neu geladen. */
  private hydrate(): { nonces: Map<string, string>; pending: Map<string, PendingCounterVerificationRecord> } {
    const key = this.options.key()
    if (this.hydratedKey !== key || this.consumedNonces === null || this.pendingCounterVerifications === null) {
      let state: PersistedVerificationState = { consumedNonces: {}, pendingCounterVerifications: {} }
      try {
        const raw = this.storage()?.getItem(key)
        if (raw) {
          const parsed: unknown = JSON.parse(raw)
          if (typeof parsed === "object" && parsed !== null) {
            const candidate = parsed as Partial<PersistedVerificationState>
            state = {
              consumedNonces: typeof candidate.consumedNonces === "object" && candidate.consumedNonces !== null
                ? candidate.consumedNonces
                : {},
              pendingCounterVerifications:
                typeof candidate.pendingCounterVerifications === "object" && candidate.pendingCounterVerifications !== null
                  ? candidate.pendingCounterVerifications
                  : {},
            }
          }
        }
      } catch { /* korruptes/fehlendes Blob = leerer Zustand */ }
      this.consumedNonces = new Map(Object.entries(state.consumedNonces))
      this.pendingCounterVerifications = new Map(Object.entries(state.pendingCounterVerifications))
      this.hydratedKey = key
    }
    return { nonces: this.consumedNonces, pending: this.pendingCounterVerifications }
  }

  private persist(): void {
    if (this.consumedNonces === null || this.pendingCounterVerifications === null || this.hydratedKey === null) return
    const state: PersistedVerificationState = {
      consumedNonces: Object.fromEntries(this.consumedNonces),
      pendingCounterVerifications: Object.fromEntries(this.pendingCounterVerifications),
    }
    try {
      this.storage()?.setItem(this.hydratedKey, JSON.stringify(state))
    } catch { /* best-effort: ohne Storage bleibt der Zustand volatil */ }
  }

  async recordConsumedNonce(nonce: string, consumedAt: string): Promise<void> {
    this.hydrate().nonces.set(nonce.toLowerCase(), consumedAt)
    this.persist()
  }

  async tryConsumeNonce(nonce: string, consumedAt: string): Promise<boolean> {
    const { nonces } = this.hydrate()
    const normalizedNonce = nonce.toLowerCase()
    if (nonces.has(normalizedNonce)) return false
    nonces.set(normalizedNonce, consumedAt)
    this.persist()
    return true
  }

  async hasConsumedNonce(nonce: string): Promise<boolean> {
    return this.hydrate().nonces.has(nonce.toLowerCase())
  }

  async pruneConsumedNonces(olderThan: string): Promise<void> {
    const { nonces } = this.hydrate()
    const cutoff = Date.parse(olderThan)
    let changed = false
    for (const [nonce, consumedAt] of nonces) {
      if (Date.parse(consumedAt) < cutoff) {
        nonces.delete(nonce)
        changed = true
      }
    }
    if (changed) this.persist()
  }

  async recordPendingCounterVerification(pending: PendingCounterVerificationRecord): Promise<void> {
    this.hydrate().pending.set(pending.originalVerificationId, { ...pending })
    this.persist()
  }

  async getPendingCounterVerification(originalVerificationId: string): Promise<PendingCounterVerificationRecord | null> {
    const pending = this.hydrate().pending.get(originalVerificationId)
    return pending === undefined ? null : { ...pending }
  }

  async getPendingCounterVerifications(): Promise<PendingCounterVerificationRecord[]> {
    return Array.from(this.hydrate().pending.values(), (pending) => ({ ...pending }))
  }

  async deletePendingCounterVerification(originalVerificationId: string): Promise<void> {
    if (this.hydrate().pending.delete(originalVerificationId)) this.persist()
  }

  async consumePendingCounterVerification(
    originalVerificationId: string,
    counterpartyDid: string,
    now: string,
  ): Promise<"consumed" | "missing" | "expired" | "wrong-counterparty"> {
    const { pending } = this.hydrate()
    const record = pending.get(originalVerificationId)
    if (record === undefined) return "missing"
    if (Date.parse(record.expiresAt) <= Date.parse(now)) {
      pending.delete(originalVerificationId)
      this.persist()
      return "expired"
    }
    if (record.counterpartyDid !== counterpartyDid) return "wrong-counterparty"
    pending.delete(originalVerificationId)
    this.persist()
    return "consumed"
  }

  async prunePendingCounterVerifications(now: string): Promise<void> {
    const { pending } = this.hydrate()
    const nowMs = Date.parse(now)
    let changed = false
    for (const [originalVerificationId, record] of pending) {
      if (Date.parse(record.expiresAt) <= nowMs) {
        pending.delete(originalVerificationId)
        changed = true
      }
    }
    if (changed) this.persist()
  }
}
