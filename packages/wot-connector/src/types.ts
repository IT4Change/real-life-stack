import type { ActivityEntry, Relation } from "@real-life-stack/data-interface"
import type {
  DocLogStore,
  KeyManagementPort,
  MemberUpdatePendingStore,
  MessageIdHistoryPort,
  MessagingAdapter,
  OutboxStore,
} from "@real-life/wot-core/ports"
import type { YjsCompactStore } from "@real-life/adapter-yjs"
import type { YjsReplicationAdapter } from "@real-life/adapter-yjs"
import type { WorkQueue } from "./work-queue-store.js"

/** Every DID-scoped IndexedDB store must close its real connection on teardown. */
export interface ClosableIdentityStore {
  close(): void | Promise<void>
}

export type ClosableOutboxStore = OutboxStore & ClosableIdentityStore
export type ClosableYjsCompactStore = YjsCompactStore & ClosableIdentityStore

// --- WoT Connector Configuration ---

export interface WotConnectorConfig {
  relayUrl: string
  profilesUrl: string
}

/** Test/runtime seams for the protocol transport and durable stores. */
export interface WotConnectorRuntimeOverrides {
  /** Raw transport. Production creates a Sync-003 WebSocket adapter. */
  messaging?: MessagingAdapter
  /** Device-local generic outbox. Production creates an IndexedDB store. */
  outboxStore?: ClosableOutboxStore
  /** Device-local key-discovery and app-receipt work queue. */
  workQueue?: WorkQueue
  /** Shared Personal-Doc/Space log store and deviceId owner. */
  docLogStore?: DocLogStore
  keyManagement?: KeyManagementPort
  memberUpdateStore?: MemberUpdatePendingStore
  messageIdHistory?: MessageIdHistoryPort
  compactStore?: ClosableYjsCompactStore
  /** Test/runtime replacement for space replication (for example an in-memory CRDT peer). */
  replication?: YjsReplicationAdapter
  /** Tests can disable trace decoration without changing transport semantics. */
  traceMessaging?: boolean
}

export interface WotSyncState {
  logPending: number
  outboxPending: number
  workPending?: number
}

// --- Automerge SpaceDoc Schema ---

export interface RlsSpaceDoc {
  /** App type for cross-app space isolation */
  _type: "rls"
  /** RLS Items keyed by ID */
  items: Record<string, SerializedItem>
  /** Additive, encrypted space-local best-effort change history. */
  activity?: Record<string, ActivityEntry>
  /** Space metadata (app-specific, name/description now in _meta) */
  metadata?: {
    /** @deprecated Use _meta.name (set via updateSpace) */
    name?: string
    description?: string
    modules?: string[]
  }
}

export interface SerializedItem {
  id: string
  type: string
  createdAt: string // ISO string (Automerge can't store Date)
  createdBy: string // DID
  "@context"?: string[]
  schema?: string
  schemaVersion?: number
  data: Record<string, unknown>
  relations?: Relation[]
  tags?: string[]
}
