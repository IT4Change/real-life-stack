"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import type { Item } from "@real-life-stack/data-interface"

/** Synthetic id for a not-yet-saved create draft (edit drafts reuse the real id). */
export const DRAFT_ITEM_ID = "__draft__"

interface DraftItemValue {
  /** The item currently being composed (create or edit), or null. Not persisted. */
  draft: Item | null
  setDraft: (draft: Item | null) => void
}

const DraftItemContext = createContext<DraftItemValue | null>(null)

/**
 * Holds the live "draft" item — the in-progress create/edit composer state as an
 * Item — so modules can show it as a preview before it's saved (a task in its
 * column, a calendar pill, a map marker). Nothing is persisted; on save the real
 * item replaces the draft, on cancel the draft just vanishes.
 *
 * One draft at a time (you can't create and edit at once). The composer
 * publishes via {@link useSetDraftItem}; modules read via {@link useItemsWithDraft}.
 */
export function DraftItemProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<Item | null>(null)
  // The composer republishes on every keystroke; skip no-op updates (a keystroke
  // that maps to identical output) so the draft reference — and every module that
  // consumes it — doesn't churn needlessly.
  const setDraft = useCallback((next: Item | null) => {
    setDraftState((prev) => {
      if (prev === next) return prev
      if (prev && next && JSON.stringify(prev) === JSON.stringify(next)) return prev
      return next
    })
  }, [])
  const value = useMemo<DraftItemValue>(() => ({ draft, setDraft }), [draft, setDraft])
  return <DraftItemContext.Provider value={value}>{children}</DraftItemContext.Provider>
}

/** The live draft item (or null). Returns null outside a DraftItemProvider. */
export function useDraftItem(): Item | null {
  return useContext(DraftItemContext)?.draft ?? null
}

/** Publish/clear the live draft (used by the shared item composer). No-op without a provider. */
export function useSetDraftItem(): (draft: Item | null) => void {
  const ctx = useContext(DraftItemContext)
  return ctx?.setDraft ?? (() => {})
}
