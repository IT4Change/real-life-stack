"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { AdaptivePanel, type PanelMode } from "../layout/adaptive-panel"

/**
 * Identifies what's currently rendered inside the shared module panel.
 * Convention so callers can swap content semantically — e.g. switching
 * from `filter` to `detail` on item-click — and so existing-open checks
 * stay readable.
 */
export type ModulePanelKind = "filter" | "detail" | "composer" | "settings" | "debug" | "custom"

export interface ModulePanelEntry {
  kind: ModulePanelKind
  content: ReactNode
  /**
   * The item this panel is about, if any (e.g. the item id of an open detail
   * view). Lets every module highlight the element that is currently open in
   * the shared panel — map marker, calendar pill, feed/kanban card — by
   * comparing against `useModulePanel().current?.itemId`.
   */
  itemId?: string
  /**
   * Show the dimming backdrop behind the panel (drawer/modal). Default `true`.
   * The map detail sets this `false` so the map below stays visible and pannable.
   */
  backdrop?: boolean
  /** Optional caller hook for when this entry is replaced or closed. */
  onClose?: () => void
}

export interface ModulePanelContextValue {
  current: ModulePanelEntry | null
  /** Open or replace the panel content. */
  open(entry: ModulePanelEntry): void
  /**
   * Close the panel. The current entry's `onClose` fires — UNLESS `silent`.
   * Pass `silent` for a programmatic release that must NOT run the owner's
   * `onClose` (e.g. a host releasing its panel on a module switch while the
   * URL keeps the item focused — firing `onClose` there would clear the focus).
   */
  close(opts?: { silent?: boolean }): void
}

const ModulePanelContext = createContext<ModulePanelContextValue | null>(null)

export interface ModulePanelProviderProps {
  children: ReactNode
  /** Side for sidebar mode. Defaults to "right" — convention for module detail. */
  side?: "left" | "right"
  /** Allowed AdaptivePanel modes. Defaults to sidebar (desktop) + drawer (mobile). */
  allowedModes?: PanelMode[]
  sidebarWidth?: string
  sidebarMinWidth?: string
  sidebarMaxWidth?: string
  /** Optional pinning state — surfaces the AdaptivePanel pin button. */
  pinned?: boolean
  onPinnedChange?: (pinned: boolean) => void
  /** Hide the panel without unmounting (keeps composer state) — e.g. while
   *  the user picks a location on the underlying map. */
  suspended?: boolean
  /** Receives the current drawer height so the owning shell can avoid it. */
  onDrawerHeightChange?: (height: number) => void
}

/**
 * Single shared `AdaptivePanel` instance for a module surface. Every
 * caller (FilterBar trigger, item-click detail, composer) opens content
 * into the SAME panel — content swaps in place instead of stacking. One
 * Z-index level, one resize state, one mode switch, one mobile drawer.
 *
 * Sebastian-Konsens 12.06.2026: alle Modul-Overlays teilen sich ein
 * Panel; daraus folgt diese Provider-Architektur.
 */
export function ModulePanelProvider({
  children,
  side = "right",
  allowedModes = ["sidebar", "drawer"],
  sidebarWidth = "420px",
  sidebarMinWidth,
  sidebarMaxWidth,
  pinned,
  onPinnedChange,
  suspended,
  onDrawerHeightChange,
}: ModulePanelProviderProps) {
  const [current, setCurrent] = useState<ModulePanelEntry | null>(null)
  // Hold a ref to the current entry's `onClose` so an explicit close()
  // (X button, backdrop, drawer-drag) notifies the owner. We do NOT
  // fire it on content-swap: re-opening the same logical panel (e.g.
  // Kanban re-pushing its TaskEditPanel when members/tags load async)
  // would otherwise cascade into an immediate close.
  const currentOnCloseRef = useRef<(() => void) | undefined>(undefined)

  const open = useCallback((entry: ModulePanelEntry) => {
    currentOnCloseRef.current = entry.onClose
    setCurrent(entry)
  }, [])

  const close = useCallback((opts?: { silent?: boolean }) => {
    const owner = currentOnCloseRef.current
    currentOnCloseRef.current = undefined
    setCurrent(null)
    if (owner && !opts?.silent) owner()
  }, [])

  const value = useMemo<ModulePanelContextValue>(
    () => ({ current, open, close }),
    [current, open, close],
  )

  return (
    <ModulePanelContext.Provider value={value}>
      {children}
      <AdaptivePanel
        open={current !== null}
        onClose={() => close()}
        allowedModes={allowedModes}
        side={side}
        sidebarWidth={sidebarWidth}
        sidebarMinWidth={sidebarMinWidth}
        sidebarMaxWidth={sidebarMaxWidth}
        pinned={pinned}
        onPinnedChange={onPinnedChange}
        suspended={suspended}
        onDrawerHeightChange={onDrawerHeightChange}
        backdrop={current?.backdrop ?? true}
      >
        {current?.content ?? null}
      </AdaptivePanel>
    </ModulePanelContext.Provider>
  )
}

export function useModulePanel(): ModulePanelContextValue {
  const ctx = useContext(ModulePanelContext)
  if (!ctx) {
    throw new Error(
      "useModulePanel must be called inside <ModulePanelProvider>",
    )
  }
  return ctx
}

/**
 * Soft variant — returns null when no provider is present. Use only in
 * components that have to work both inside and outside the provider
 * (e.g. shared components rendered in Storybook decorators).
 */
export function useOptionalModulePanel(): ModulePanelContextValue | null {
  return useContext(ModulePanelContext)
}
