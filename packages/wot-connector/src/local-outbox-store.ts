import type {
  OutboxEntry,
  OutboxStore,
  Subscribable,
  WireMessage,
} from "@real-life/wot-core/ports"

interface StoredOutboxEntry {
  id: string
  envelopeJson: string
  createdAt: string
  retryCount: number
}

/**
 * Durable, device-local generic outbox.
 *
 * It deliberately lives outside the PersonalDoc: retry state must never be
 * replicated to sibling devices, otherwise every device can resend the same
 * message. The database name is DID-scoped by the composition root.
 */
export class LocalOutboxStore implements OutboxStore {
  private db: IDBDatabase | null = null
  private openPromise: Promise<IDBDatabase> | null = null
  private pendingCount = 0
  private listeners = new Set<(count: number) => void>()

  constructor(
    private readonly dbName: string,
    private readonly storeName = "outbox",
  ) {}

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
    this.listeners.clear()
  }

  async enqueue(envelope: WireMessage): Promise<void> {
    if (await this.has(envelope.id)) return
    const entry: StoredOutboxEntry = {
      id: envelope.id,
      envelopeJson: JSON.stringify(envelope),
      createdAt: new Date().toISOString(),
      retryCount: 0,
    }
    await this.put(entry)
    await this.refreshPendingCount()
  }

  async dequeue(envelopeId: string): Promise<void> {
    const db = await this.ensureOpen()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite")
      tx.objectStore(this.storeName).delete(envelopeId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    await this.refreshPendingCount()
  }

  async getPending(): Promise<OutboxEntry[]> {
    const entries = await this.getAll()
    return entries
      .map((entry) => ({
        envelope: JSON.parse(entry.envelopeJson) as WireMessage,
        createdAt: entry.createdAt,
        retryCount: entry.retryCount,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async has(envelopeId: string): Promise<boolean> {
    const db = await this.ensureOpen()
    return new Promise<boolean>((resolve, reject) => {
      const request = db.transaction(this.storeName, "readonly")
        .objectStore(this.storeName)
        .getKey(envelopeId)
      request.onsuccess = () => resolve(request.result !== undefined)
      request.onerror = () => reject(request.error)
    })
  }

  async incrementRetry(envelopeId: string): Promise<void> {
    const entry = await this.get(envelopeId)
    if (!entry) return
    entry.retryCount += 1
    await this.put(entry)
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

  private async get(envelopeId: string): Promise<StoredOutboxEntry | null> {
    const db = await this.ensureOpen()
    return new Promise<StoredOutboxEntry | null>((resolve, reject) => {
      const request = db.transaction(this.storeName, "readonly")
        .objectStore(this.storeName)
        .get(envelopeId)
      request.onsuccess = () => resolve((request.result as StoredOutboxEntry | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
  }

  private async getAll(): Promise<StoredOutboxEntry[]> {
    const db = await this.ensureOpen()
    return new Promise<StoredOutboxEntry[]>((resolve, reject) => {
      const request = db.transaction(this.storeName, "readonly")
        .objectStore(this.storeName)
        .getAll()
      request.onsuccess = () => resolve(request.result as StoredOutboxEntry[])
      request.onerror = () => reject(request.error)
    })
  }

  private async put(entry: StoredOutboxEntry): Promise<void> {
    const db = await this.ensureOpen()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite")
      tx.objectStore(this.storeName).put(entry)
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
