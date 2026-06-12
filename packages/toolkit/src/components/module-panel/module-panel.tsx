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
export type ModulePanelKind = "filter" | "detail" | "composer" | "settings" | "custom"

export interface ModulePanelEntry {
  kind: ModulePanelKind
  content: ReactNode
  /** Optional caller hook for when this entry is replaced or closed. */
  onClose?: () => void
}

export interface ModulePanelContextValue {
  current: ModulePanelEntry | null
  /** Open or replace the panel content. */
  open(entry: ModulePanelEntry): void
  /** Close the panel. Caller's `onClose` is invoked. */
  close(): void
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

  const close = useCallback(() => {
    const owner = currentOnCloseRef.current
    currentOnCloseRef.current = undefined
    setCurrent(null)
    if (owner) owner()
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
        onClose={close}
        allowedModes={allowedModes}
        side={side}
        sidebarWidth={sidebarWidth}
        sidebarMinWidth={sidebarMinWidth}
        sidebarMaxWidth={sidebarMaxWidth}
        pinned={pinned}
        onPinnedChange={onPinnedChange}
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
