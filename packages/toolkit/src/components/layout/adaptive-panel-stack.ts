export type AdaptivePanelStackMode = "modal" | "sidebar" | "drawer"

export interface AdaptivePanelStackEntry {
  mode: AdaptivePanelStackMode
  side: "left" | "right"
  sidebarWidth: number
  insetActive?: boolean
}

/**
 * Tracks open panels in presentation order. Modal and drawer overlays must not
 * erase the layout inset owned by an open sidebar underneath them.
 */
export class AdaptivePanelStack {
  private entries: Array<AdaptivePanelStackEntry & {
    id: symbol
    order: number
    onOrderChange?: (order: number) => void
  }> = []

  upsert(
    id: symbol,
    entry: AdaptivePanelStackEntry,
    onOrderChange?: (order: number) => void,
  ): number {
    const index = this.entries.findIndex((candidate) => candidate.id === id)
    if (index === -1) {
      const order = this.entries.length + 1
      this.entries.push({ id, order, onOrderChange, ...entry })
      onOrderChange?.(order)
      return order
    }
    const order = this.entries[index].order
    const notify = onOrderChange ?? this.entries[index].onOrderChange
    this.entries[index] = { id, order, onOrderChange: notify, ...entry }
    notify?.(order)
    return order
  }

  remove(id: symbol): void {
    this.entries = this.entries.filter((entry) => entry.id !== id)
    this.entries.forEach((entry, index) => {
      const order = index + 1
      if (entry.order === order) return
      entry.order = order
      entry.onOrderChange?.(order)
    })
  }

  isTopmost(id: symbol): boolean {
    return this.entries.at(-1)?.id === id
  }

  getInsets(): { left: number; right: number } {
    let left = 0
    let right = 0

    for (const entry of this.entries) {
      if (entry.mode !== "sidebar" || entry.insetActive === false) continue
      if (entry.side === "left") left = entry.sidebarWidth
      else right = entry.sidebarWidth
    }

    return { left, right }
  }
}

export const adaptivePanelStack = new AdaptivePanelStack()

export interface ScrollLockTarget {
  style: { overflow: string }
}

export class AdaptivePanelScrollLock {
  private holders = new Set<symbol>()
  private previousOverflow: string | null = null

  acquire(id: symbol, target: ScrollLockTarget): void {
    if (this.holders.has(id)) return
    if (this.holders.size === 0) {
      this.previousOverflow = target.style.overflow
      target.style.overflow = "hidden"
    }
    this.holders.add(id)
  }

  release(id: symbol, target: ScrollLockTarget): void {
    if (!this.holders.delete(id) || this.holders.size > 0) return
    target.style.overflow = this.previousOverflow ?? ""
    this.previousOverflow = null
  }
}

export const adaptivePanelScrollLock = new AdaptivePanelScrollLock()
