import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  ItemDetailView,
  useModulePanel,
  type ContentComposerProps,
  type ContentTypeConfig,
  type ItemEditorMapper,
  type WidgetData,
} from "@real-life-stack/toolkit"
import type { Item } from "@real-life-stack/data-interface"
import { useItemFocus } from "./hooks/use-item-focus"

/** Modules whose detail (read↔edit) is owned by the host. Kanban keeps its own
 *  always-edit `TaskEditPanel` for now (→ Phase-2 Scheibe 2). */
const HOST_MODULES = ["feed", "calendar", "map"]

/**
 * Per-item detail config a module registers with the host. Mirrors the old
 * per-module `openDetail` body, minus the panel plumbing — the host owns the
 * panel and the read↔edit lifecycle now.
 */
export interface DetailConfig {
  /** Read-view body: the live item + the gated action menu (⋮ + „Bearbeiten"). */
  renderRead: (item: Item, actions: ReactNode) => ReactNode
  /** Composer types for editing (the item's own type → no switcher). */
  contentTypes: ContentTypeConfig[]
  /** Edit-aware submission mapper. */
  mapper: ItemEditorMapper
  /** Pre-fill the composer from the live item. */
  editInitialData: (item: Item) => Partial<WidgetData>
  /** Extra ContentComposer props (geocode, map-pick, …). */
  composerProps?: Partial<ContentComposerProps>
  /** Reaction bars on comments. */
  renderCommentReactions?: (commentId: string) => ReactNode
  /** Share/copy a link to the item. */
  onShare?: () => void
  /** Dimming backdrop behind the panel. The map sets `false` (stay pannable). */
  backdrop?: boolean
}

interface DetailHostValue {
  config: DetailConfig | null
  setConfig: (config: DetailConfig) => void
}

const DetailHostContext = createContext<DetailHostValue | null>(null)

function useDetailHost(): DetailHostValue {
  const ctx = useContext(DetailHostContext)
  if (!ctx) throw new Error("useDetailHost must be used within <DetailHostProvider>")
  return ctx
}

/**
 * Holds the active module's detail config. Lives ABOVE the ModulePanel so the
 * panel content (`DetailHostOutlet`) can read it; the open/close itself happens
 * in `DetailHostController` (which needs `useModulePanel`, i.e. below the panel).
 */
export function DetailHostProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DetailConfig | null>(null)
  const value = useMemo<DetailHostValue>(() => ({ config, setConfig }), [config])
  return <DetailHostContext.Provider value={value}>{children}</DetailHostContext.Provider>
}

/**
 * A host module registers its detail config here (instead of calling
 * `openDetail`). Pass a memoised config so it only re-registers on real change.
 * Not cleared on unmount — the next host module overwrites it, and the
 * controller gates on the active module anyway (so a stale config on Kanban is
 * harmless).
 */
export function useRegisterDetail(config: DetailConfig): void {
  const { setConfig } = useDetailHost()
  useEffect(() => {
    setConfig(config)
  }, [config, setConfig])
}

/**
 * Panel content: renders the shared `ItemDetailView` for the focused item from
 * the live registered config. Stable element (set once into the panel) that
 * re-renders on context change — so a module switch updates the read rendering
 * without remounting (edit state survives). Keyed on the item id, so a
 * *different* item starts fresh in read mode.
 */
function DetailHostOutlet() {
  const { itemId: focusedId, clearFocus } = useItemFocus()
  const { config } = useDetailHost()
  if (!focusedId || !config) return null
  return (
    <ItemDetailView
      key={focusedId}
      itemId={focusedId}
      renderRead={config.renderRead}
      contentTypes={config.contentTypes}
      mapper={config.mapper}
      editInitialData={config.editInitialData}
      composerProps={config.composerProps}
      renderCommentReactions={config.renderCommentReactions}
      onShare={config.onShare}
      onClose={clearFocus}
    />
  )
}

/**
 * Owns the shared panel for the focused item across all host modules — opens
 * once per item, persists across module switches (no remount → no adopt-guard),
 * closes when the focus clears or the user leaves the host modules. Kanban
 * (not a host module) keeps its own panel; `panelOwnedRef` keeps the two from
 * closing each other's content.
 */
export function DetailHostController({ activeModule }: { activeModule: string }) {
  const modulePanel = useModulePanel()
  const { itemId: focusedId, clearFocus } = useItemFocus()
  const { config } = useDetailHost()
  const hostOwns = HOST_MODULES.includes(activeModule)
  const panelOwnedRef = useRef(false)
  const openedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (hostOwns && focusedId && config) {
      // Already showing this item → leave it (config/module changes flow into the
      // outlet via context without a remount, so the edit composer survives).
      if (openedIdRef.current === focusedId && panelOwnedRef.current) return
      openedIdRef.current = focusedId
      panelOwnedRef.current = true
      modulePanel.open({
        kind: "detail",
        itemId: focusedId,
        backdrop: config.backdrop,
        content: <DetailHostOutlet />,
        onClose: clearFocus,
      })
    } else {
      // Left the host modules or cleared the focus → release our panel. Only
      // close when our detail is still showing: a create composer (kind
      // "composer", opened by the composer-host) may have replaced it, and we
      // must not close that.
      openedIdRef.current = null
      if (panelOwnedRef.current) {
        panelOwnedRef.current = false
        if (modulePanel.current?.kind === "detail") modulePanel.close()
      }
    }
  }, [hostOwns, focusedId, config, modulePanel, clearFocus])

  return null
}
