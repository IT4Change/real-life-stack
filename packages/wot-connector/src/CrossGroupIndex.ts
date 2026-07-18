import type { SpaceInfo, SpaceHandle } from "@real-life/wot-core"
import type { YjsReplicationAdapter } from "@real-life/adapter-yjs"

// --- Types ---

export interface CrossGroupEntry<TItem> {
  item: TItem
  groupId: string
}

export interface CrossGroupIndexOptions {
  groupFilter?: (info: SpaceInfo) => boolean
}

export function crossGroupItemKey(groupId: string, itemId: string): string {
  return JSON.stringify([groupId, itemId])
}

// --- CrossGroupIndex ---

/**
 * Reactive item index across all groups.
 *
 * Subscribes to watchSpaces(), opens a SpaceHandle per group,
 * listens to onRemoteUpdate(), and maintains a flat + type-based index
 * of all items across groups.
 */
export class CrossGroupIndex<TDoc, TItem> {
  private replication: YjsReplicationAdapter
  private extractItems: (doc: TDoc) => Map<string, TItem>
  private getItemType: (item: TItem) => string
  private groupFilter: ((info: SpaceInfo) => boolean) | undefined

  // Per-group state
  private handles = new Map<string, SpaceHandle<TDoc>>()
  private pendingGroups = new Set<string>()
  private remoteUnsubs = new Map<string, () => void>()
  private groupItemMaps = new Map<string, Map<string, TItem>>()

  // Indexes
  private flatIndex = new Map<string, CrossGroupEntry<TItem>>()
  private typeIndex = new Map<string, Set<string>>()

  // Reactive
  private listeners = new Set<() => void>()
  private groupsUnsub: (() => void) | null = null
  private notifyScheduled = false
  private started = false

  constructor(
    replication: YjsReplicationAdapter,
    extractItems: (doc: TDoc) => Map<string, TItem>,
    getItemType: (item: TItem) => string,
    options?: CrossGroupIndexOptions,
  ) {
    this.replication = replication
    this.extractItems = extractItems
    this.getItemType = getItemType
    this.groupFilter = options?.groupFilter
  }

  // --- Lifecycle ---

  start(): void {
    if (this.started) return
    this.started = true

    const subscribable = this.replication.watchSpaces()
    // Initial index from current groups
    this.syncGroups(subscribable.getValue())
    // Subscribe to future changes
    this.groupsUnsub = subscribable.subscribe((spaces) => {
      this.syncGroups(spaces)
    })
  }

  stop(): void {
    if (!this.started) return
    this.started = false

    this.groupsUnsub?.()
    this.groupsUnsub = null

    for (const unsub of this.remoteUnsubs.values()) {
      unsub()
    }
    for (const handle of this.handles.values()) {
      handle.close()
    }

    this.handles.clear()
    this.pendingGroups.clear()
    this.remoteUnsubs.clear()
    this.groupItemMaps.clear()
    this.flatIndex.clear()
    this.typeIndex.clear()
  }

  // --- Queries ---

  /** Legacy naked-ID view. IDs present in multiple groups are omitted as ambiguous. */
  getAll(): Map<string, CrossGroupEntry<TItem>> {
    return this.buildUniqueIndex(this.groupItemMaps)
  }

  /** Canonical cross-space view keyed by crossGroupItemKey(groupId, itemId). */
  getAllScoped(): Map<string, CrossGroupEntry<TItem>> {
    return this.flatIndex
  }

  getByType(type: string): Array<CrossGroupEntry<TItem>> {
    const ids = this.typeIndex.get(type)
    if (!ids) return []
    const result: Array<CrossGroupEntry<TItem>> = []
    for (const id of ids) {
      const entry = this.flatIndex.get(id)
      if (entry) result.push(entry)
    }
    return result
  }

  getByGroup(groupId: string): Map<string, TItem> {
    return this.groupItemMaps.get(groupId) ?? new Map()
  }

  /** Narrow generic hook for space-level projections such as ActivityLog. */
  getDocuments(): TDoc[] {
    return [...this.handles.values()].map((handle) => handle.getDoc())
  }

  getUniqueById(itemId: string): CrossGroupEntry<TItem> | null {
    let result: CrossGroupEntry<TItem> | null = null
    for (const [groupId, items] of this.groupItemMaps) {
      if (!items.has(itemId)) continue
      if (result) return null
      result = { item: items.get(itemId)!, groupId }
    }
    return result
  }

  getItemGroupId(itemId: string): string | null {
    return this.getUniqueById(itemId)?.groupId ?? null
  }

  getFiltered(filters: {
    includedGroups?: string[] | null
    excludedGroups?: string[]
  }): Map<string, CrossGroupEntry<TItem>> {
    const { includedGroups, excludedGroups } = filters
    // No filtering needed
    if (!includedGroups && (!excludedGroups || excludedGroups.length === 0)) {
      return this.getAll()
    }

    const included = includedGroups ? new Set(includedGroups) : null
    const excluded = excludedGroups ? new Set(excludedGroups) : null
    return this.buildUniqueIndex(
      [...this.groupItemMaps.entries()].filter(([groupId]) => {
        if (excluded?.has(groupId)) return false
        return !included || included.has(groupId)
      })
    )
  }

  // --- Reactive ---

  onChange(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  // --- Manual reindex (for local writes) ---

  reindexGroup(groupId: string): void {
    const handle = this.handles.get(groupId)
    if (!handle) return
    this.indexGroup(groupId, handle)
  }

  // --- Internal ---

  private syncGroups(spaces: SpaceInfo[]): void {
    const filtered = this.groupFilter
      ? spaces.filter(this.groupFilter)
      : spaces

    const currentIds = new Set(filtered.map((s) => s.id))
    const knownIds = new Set([...this.handles.keys(), ...this.pendingGroups])

    // Remove groups that are no longer present
    for (const id of knownIds) {
      if (!currentIds.has(id)) {
        this.pendingGroups.delete(id)
        this.removeGroup(id)
      }
    }

    // Add new groups
    for (const space of filtered) {
      if (!knownIds.has(space.id)) {
        this.addGroup(space.id)
      }
    }
  }

  private buildUniqueIndex(
    groups: Iterable<[string, Map<string, TItem>]>
  ): Map<string, CrossGroupEntry<TItem>> {
    const result = new Map<string, CrossGroupEntry<TItem>>()
    const ambiguousIds = new Set<string>()
    for (const [groupId, items] of groups) {
      for (const [itemId, item] of items) {
        if (ambiguousIds.has(itemId)) continue
        if (result.has(itemId)) {
          result.delete(itemId)
          ambiguousIds.add(itemId)
          continue
        }
        result.set(itemId, { item, groupId })
      }
    }
    return result
  }

  private async addGroup(groupId: string): Promise<void> {
    this.pendingGroups.add(groupId)
    try {
      const handle = await this.replication.openSpace<TDoc>(groupId)
      this.pendingGroups.delete(groupId)

      if (!this.started) {
        handle.close()
        return
      }

      this.handles.set(groupId, handle)

      // Initial index
      this.indexGroup(groupId, handle)

      // Subscribe to remote updates
      const unsub = handle.onRemoteUpdate(() => {
        this.indexGroup(groupId, handle)
      })
      this.remoteUnsubs.set(groupId, unsub)
    } catch {
      this.pendingGroups.delete(groupId)
      // Group may have been deleted between watchSpaces emit and openSpace call
    }
  }

  private removeGroup(groupId: string): void {
    // Unsubscribe
    this.remoteUnsubs.get(groupId)?.()
    this.remoteUnsubs.delete(groupId)

    // Close handle
    this.handles.get(groupId)?.close()
    this.handles.delete(groupId)

    // Remove items from indexes
    const oldItems = this.groupItemMaps.get(groupId)
    if (oldItems) {
      for (const [id, item] of oldItems) {
        const key = crossGroupItemKey(groupId, id)
        this.flatIndex.delete(key)
        const type = this.getItemType(item)
        this.typeIndex.get(type)?.delete(key)
      }
      this.groupItemMaps.delete(groupId)
    }

    this.notify()
  }

  private indexGroup(groupId: string, handle: SpaceHandle<TDoc>): void {
    const newItems = this.extractItems(handle.getDoc())
    const oldItems = this.groupItemMaps.get(groupId)

    // Diff: remove deleted items
    if (oldItems) {
      for (const [id, item] of oldItems) {
        if (!newItems.has(id)) {
          const key = crossGroupItemKey(groupId, id)
          this.flatIndex.delete(key)
          const type = this.getItemType(item)
          this.typeIndex.get(type)?.delete(key)
        }
      }
    }

    // Add/update items
    for (const [id, item] of newItems) {
      const type = this.getItemType(item)
      const key = crossGroupItemKey(groupId, id)

      // Update type index (handle type changes)
      const existing = this.flatIndex.get(key)
      if (existing) {
        const oldType = this.getItemType(existing.item)
        if (oldType !== type) {
          this.typeIndex.get(oldType)?.delete(key)
        }
      }

      this.flatIndex.set(key, { item, groupId })

      let typeSet = this.typeIndex.get(type)
      if (!typeSet) {
        typeSet = new Set()
        this.typeIndex.set(type, typeSet)
      }
      typeSet.add(key)
    }

    this.groupItemMaps.set(groupId, newItems)
    this.notify()
  }

  private notify(): void {
    if (this.notifyScheduled) return
    this.notifyScheduled = true
    queueMicrotask(() => {
      this.notifyScheduled = false
      if (!this.started) return
      for (const cb of this.listeners) {
        cb()
      }
    })
  }
}
