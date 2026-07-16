import type { Subscribable } from "@real-life/wot-core/ports"

export type WorkQueueKind = "deliver-attestation" | "receipt-ack"

export interface WorkQueueItem {
  id: string
  kind: WorkQueueKind
  payload: Record<string, unknown>
  attempts: number
  nextDueAt: number
}

export interface WorkQueueEntry {
  id: string
  kind: WorkQueueKind
  payload: Record<string, unknown>
}

/** Runtime seam used by WotConnector and injectable store implementations. */
export interface WorkQueue {
  open?(): Promise<void>
  close?(): Promise<void>
  enqueue(item: WorkQueueEntry): Promise<void>
  claimDue(now: number): Promise<WorkQueueItem[]>
  complete(id: string): Promise<void>
  /** Returns true when the attempt cap discarded the item. */
  fail(id: string, now: number): Promise<boolean | void>
  count(): Promise<number>
  watchPendingCount?(): Subscribable<number>
  getNextDueAt?(): Promise<number | null>
}

export interface WorkQueueStoreOptions {
  maxAttempts?: number
}

const DEFAULT_MAX_ATTEMPTS = 8
const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 5 * 60_000

/**
 * Device-local durable work which is not replicated to sibling devices.
 *
 * Claims intentionally live in memory: one store instance handles an item at
 * most once until complete/fail releases it, while a fresh runtime can reclaim
 * unfinished work after a crash.
 */
export class WorkQueueStore implements WorkQueue {
  private db: IDBDatabase | null = null
  private openPromise: Promise<IDBDatabase> | null = null
  private pendingCount = 0
  private listeners = new Set<(count: number) => void>()
  private claimedIds = new Set<string>()
  private claimChain: Promise<void> = Promise.resolve()
  private readonly maxAttempts: number

  constructor(
    private readonly dbName: string,
    options: WorkQueueStoreOptions = {},
    private readonly storeName = "work",
  ) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)
  }

  async open(): Promise<void> {
    await this.ensureOpen()
    this.pendingCount = await this.count()
  }

  async close(): Promise<void> {
    if (this.openPromise) {
      const db = await this.openPromise.catch(() => null)
      db?.close()
    } else {
      this.db?.close()
    }
    this.db = null
    this.openPromise = null
    this.claimedIds.clear()
    this.listeners.clear()
    this.claimChain = Promise.resolve()
  }

  async enqueue(item: WorkQueueEntry): Promise<void> {
    const db = await this.ensureOpen()
    let inserted = false
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite")
      const store = tx.objectStore(this.storeName)
      const request = store.get(item.id)
      request.onsuccess = () => {
        const existing = request.result as WorkQueueItem | undefined
        inserted = existing === undefined
        // Deterministic IDs make enqueue an idempotent upsert. Preserve the
        // retry lifecycle when an active drain re-enqueues its own obligation;
        // resetting attempts here would prevent the attempt cap from firing.
        store.put(existing
          ? { ...existing, kind: item.kind, payload: item.payload }
          : { ...item, attempts: 0, nextDueAt: 0 } satisfies WorkQueueItem)
      }
      request.onerror = () => tx.abort()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? request.error)
    })
    if (inserted) await this.refreshPendingCount()
  }

  /**
   * In-Session-Ownership für einen Direktversuch (z.B. Receipt sofort nach
   * Empfang): gewinnt genau einmal; claimDue überspringt geclaimte Items.
   * complete/fail geben den Claim wieder frei. Synchron → race-frei im
   * Single-Thread-JS (gleiche Mechanik wie der Drain-Claim).
   */
  claimImmediate(id: string): boolean {
    if (this.claimedIds.has(id)) return false
    this.claimedIds.add(id)
    return true
  }

  async claimDue(now: number): Promise<WorkQueueItem[]> {
    let resolveResult!: (items: WorkQueueItem[]) => void
    let rejectResult!: (error: unknown) => void
    const result = new Promise<WorkQueueItem[]>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })

    this.claimChain = this.claimChain
      .catch(() => {})
      .then(async () => {
        try {
          const entries = await this.getAll()
          const due = entries
            .filter((entry) => entry.nextDueAt <= now && !this.claimedIds.has(entry.id))
            .sort((a, b) => a.nextDueAt - b.nextDueAt || a.id.localeCompare(b.id))
          for (const entry of due) this.claimedIds.add(entry.id)
          resolveResult(due)
        } catch (error) {
          rejectResult(error)
        }
      })

    return result
  }

  async complete(id: string): Promise<void> {
    try {
      await this.delete(id)
      await this.refreshPendingCount()
    } finally {
      // A failed completion may safely run again (at-least-once), but must not
      // crash the connector or remain stuck in-flight for this whole session.
      this.claimedIds.delete(id)
    }
  }

  async fail(id: string, now: number): Promise<boolean> {
    const db = await this.ensureOpen()
    let dropped = false
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite")
        const store = tx.objectStore(this.storeName)
        const request = store.get(id)
        request.onsuccess = () => {
          const entry = request.result as WorkQueueItem | undefined
          if (!entry) return
          const attempts = entry.attempts + 1
          if (attempts >= this.maxAttempts) {
            dropped = true
            store.delete(id)
            return
          }
          const backoff = Math.min(
            INITIAL_BACKOFF_MS * (2 ** Math.max(0, attempts - 1)),
            MAX_BACKOFF_MS,
          )
          store.put({ ...entry, attempts, nextDueAt: now + backoff } satisfies WorkQueueItem)
        }
        request.onerror = () => tx.abort()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? request.error)
      })
      if (dropped) await this.refreshPendingCount()
      return dropped
    } finally {
      this.claimedIds.delete(id)
    }
  }

  async count(): Promise<number> {
    const db = await this.ensureOpen()
    return new Promise<number>((resolve, reject) => {
      const request = db.transaction(this.storeName, "readonly")
        .objectStore(this.storeName)
        .count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  watchPendingCount(): Subscribable<number> {
    return {
      getValue: () => this.pendingCount,
      subscribe: (callback) => {
        this.listeners.add(callback)
        return () => { this.listeners.delete(callback) }
      },
    }
  }

  async getNextDueAt(): Promise<number | null> {
    const entries = await this.getAll()
    let next: number | null = null
    for (const entry of entries) {
      if (this.claimedIds.has(entry.id)) continue
      if (next === null || entry.nextDueAt < next) next = entry.nextDueAt
    }
    return next
  }

  private async ensureOpen(): Promise<IDBDatabase> {
    if (this.db) return this.db
    if (this.openPromise) return this.openPromise
    this.openPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id" })
        }
      }
      request.onsuccess = () => {
        this.db = request.result
        resolve(request.result)
      }
      request.onerror = () => {
        this.openPromise = null
        reject(request.error)
      }
    })
    return this.openPromise
  }

  private async getAll(): Promise<WorkQueueItem[]> {
    const db = await this.ensureOpen()
    return new Promise<WorkQueueItem[]>((resolve, reject) => {
      const request = db.transaction(this.storeName, "readonly")
        .objectStore(this.storeName)
        .getAll()
      request.onsuccess = () => resolve(request.result as WorkQueueItem[])
      request.onerror = () => reject(request.error)
    })
  }

  private async delete(id: string): Promise<void> {
    const db = await this.ensureOpen()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite")
      tx.objectStore(this.storeName).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  private async refreshPendingCount(): Promise<void> {
    const next = await this.count()
    if (next === this.pendingCount) return
    this.pendingCount = next
    for (const listener of this.listeners) listener(next)
  }
}
