"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react"

interface UnsavedChangesValue {
  /** Reactive flag — drives the `beforeunload` prompt for hard reloads/closes. */
  dirty: boolean
  /**
   * Synchronous mirror of `dirty`, read by the navigation blocker at transition
   * time. A ref (not state) so that clearing it just before a save-triggered
   * navigation is visible immediately, without waiting for a React re-render —
   * otherwise the blocker would catch the very navigation the save initiates.
   */
  dirtyRef: MutableRefObject<boolean>
  /** Set/clear the dirty flag. The open composer publishes here. */
  setDirty: (dirty: boolean) => void
}

const UnsavedChangesContext = createContext<UnsavedChangesValue | null>(null)

/**
 * Tracks whether an open composer (create or edit) holds unsaved content, so the
 * app can warn before that content is discarded — by cancel, by opening another
 * item, by browser-back, or by a hard reload/tab close.
 *
 * Router-agnostic on purpose: the composer (toolkit) only publishes a boolean
 * via {@link useSetUnsavedDirty}; the actual navigation blocking lives in the
 * app layer (which owns routing) and reads this via {@link useUnsavedChanges}.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirtyState] = useState(false)
  const dirtyRef = useRef(false)
  const setDirty = useCallback((next: boolean) => {
    dirtyRef.current = next
    setDirtyState((prev) => (prev === next ? prev : next))
  }, [])
  const value = useMemo<UnsavedChangesValue>(
    () => ({ dirty, dirtyRef, setDirty }),
    [dirty, setDirty],
  )
  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
}

/** Read the unsaved-changes state (for the app-level navigation guard). */
export function useUnsavedChanges(): UnsavedChangesValue | null {
  return useContext(UnsavedChangesContext)
}

/** Publish/clear the unsaved flag (used by the shared item composer). No-op without a provider. */
export function useSetUnsavedDirty(): (dirty: boolean) => void {
  const ctx = useContext(UnsavedChangesContext)
  return ctx?.setDirty ?? (() => {})
}
