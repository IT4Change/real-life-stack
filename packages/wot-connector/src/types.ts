import type { Relation } from "@real-life-stack/data-interface"

// --- WoT Connector Configuration ---

export interface WotConnectorConfig {
  relayUrl: string
  profilesUrl: string
  vaultUrl?: string
}

// --- Automerge SpaceDoc Schema ---

export interface RlsSpaceDoc {
  /** App type for cross-app space isolation */
  _type: "rls"
  /** RLS Items keyed by ID */
  items: Record<string, SerializedItem>
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
}
