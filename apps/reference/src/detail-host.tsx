import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
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
  /** Composer types for editing (full list; the view locks to the item's type). */
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

/**
 * External store for the registered detail configs, keyed by module id. A plain
 * subscribable — NOT React state — so registering a config does NOT re-render
 * the whole subtree (which, with an unstable config, would loop).
 *
 * Keyed by module so a module that stays MOUNTED while inactive (the map is kept
 * alive via `display:none`) can't overwrite the active module's config: only the
 * ACTIVE module's config is read, and a write to a non-active module never
 * notifies. Only the host's outlet + controller subscribe.
 */
interface ConfigStore {
  setConfig: (module: string, config: DetailConfig | null) => void
  setActiveModule: (module: string) => void
  getActiveConfig: () => DetailConfig | null
  subscribe: (listener: () => void) => () => void
}

function createConfigStore(): ConfigStore {
  const configs = new Map<string, DetailConfig>()
  let activeModule = ""
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const l of listeners) l()
  }
  return {
    setConfig(module, config) {
      if (config === null) {
        if (!configs.has(module)) return
        configs.delete(module)
      } else {
        if (configs.get(module) === config) return
        configs.set(module, config)
      }
      // A non-active module's config change must not disturb the active panel.
      if (module === activeModule) notify()
    },
    setActiveModule(module) {
      if (module === activeModule) return
      activeModule = module
      notify()
    },
    getActiveConfig() {
      return configs.get(activeModule) ?? null
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

const DetailHostContext = createContext<ConfigStore | null>(null)

function useConfigStore(): ConfigStore {
  const ctx = useContext(DetailHostContext)
  if (!ctx) throw new Error("useConfigStore must be used within <DetailHostProvider>")
  return ctx
}

function useActiveDetailConfig(): DetailConfig | null {
  const store = useConfigStore()
  return useSyncExternalStore(store.subscribe, store.getActiveConfig, store.getActiveConfig)
}

/**
 * Holds the config store (a stable ref — the provider never re-renders on a
 * config change). Lives ABOVE the ModulePanel so the panel content
 * (`DetailHostOutlet`) can read it; the open/close itself happens in
 * `DetailHostController` (which needs `useModulePanel`, i.e. below the panel).
 */
export function DetailHostProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<ConfigStore | null>(null)
  if (!storeRef.current) storeRef.current = createConfigStore()
  return <DetailHostContext.Provider value={storeRef.current}>{children}</DetailHostContext.Provider>
}

/**
 * A host module registers its detail config here (instead of calling
 * `openDetail`), keyed by its module id. Pass a memoised config so it only
 * re-registers on real change. Removes its config on unmount so a torn-down
 * module can't leave a stale config behind.
 */
export function useRegisterDetail(module: string, config: DetailConfig): void {
  const store = useConfigStore()
  useEffect(() => {
    store.setConfig(module, config)
    return () => store.setConfig(module, null)
  }, [module, config, store])
}

/**
 * Panel content: renders the shared `ItemDetailView` for the focused item from
 * the ACTIVE module's live registered config. Stable element (set once into the
 * panel) that re-renders on config change — so a module switch updates the read
 * rendering without remounting (edit state survives). Keyed on the item id, so a
 * *different* item starts fresh in read mode.
 */
function DetailHostOutlet() {
  const { itemId: focusedId, clearFocus } = useItemFocus()
  const config = useActiveDetailConfig()
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
  const store = useConfigStore()
  const config = useActiveDetailConfig()
  const hostOwns = HOST_MODULES.includes(activeModule)
  const panelOwnedRef = useRef(false)
  const openedIdRef = useRef<string | null>(null)

  // Tell the store which module is active, so the outlet reads ITS config (and a
  // hidden, still-mounted module's config is ignored).
  useEffect(() => {
    store.setActiveModule(activeModule)
  }, [store, activeModule])

  useEffect(() => {
    if (hostOwns && focusedId && config) {
      // Already showing this item → leave it (config/module changes flow into the
      // outlet via the store without a remount, so the edit composer survives).
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
