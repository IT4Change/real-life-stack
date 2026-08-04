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
  renderTypeFooter,
  resolveTypePresentation,
  ItemPreview,
  ItemScopeBadge,
  ItemTypeBadge,
  ReactionBar,
  useCurrentUser,
  useMembers,
  useModulePanel,
  type ContentComposerProps,
  type ContentTypeConfig,
  type ItemEditorMapper,
  type WidgetData,
} from "@real-life-stack/toolkit"
import type { Item, User } from "@real-life-stack/data-interface"
import { useItemFocus } from "./hooks/use-item-focus"

/** Modules whose detail (read↔edit) is owned by the host. */
const HOST_MODULES = ["feed", "calendar", "map", "kanban", "collection", "resonance", "graph"]

/**
 * Per-item detail config a module registers with the host. Mirrors the old
 * per-module `openDetail` body, minus the panel plumbing — the host owns the
 * panel and the read↔edit lifecycle now.
 */
export interface DetailConfig {
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
  /** The space the shell is showing. Read by the host, never by a module. */
  setActiveGroupId: (groupId: string | null) => void
  getActiveConfig: () => DetailConfig | null
  getActiveGroupId: () => string | null
  subscribe: (listener: () => void) => () => void
}

function createConfigStore(): ConfigStore {
  const configs = new Map<string, DetailConfig>()
  let activeModule = ""
  let activeGroupId: string | null = null
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
    setActiveGroupId(groupId) {
      if (groupId === activeGroupId) return
      activeGroupId = groupId
      notify()
    },
    getActiveConfig() {
      return configs.get(activeModule) ?? null
    },
    getActiveGroupId() {
      return activeGroupId
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

function useActiveGroupId(): string | null {
  const store = useConfigStore()
  return useSyncExternalStore(store.subscribe, store.getActiveGroupId, store.getActiveGroupId)
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
/**
 * The read view of the shared detail panel.
 *
 * **What it shows follows the ITEM, not the module.** The panel is one surface;
 * a task is a task whether it was opened from Kanban or from the collection.
 * The module only says which space we are in (`groupId`) — for the author
 * lookup, the scope badge and the group colour.
 *
 * This used to be a per-module `renderRead` callback. Feed, map, collection and
 * calendar held near-identical copies that drifted (#183, #196), and Kanban's
 * "own" body turned out to be a **type** rule in disguise: it showed assignees
 * because tasks have assignees, not because Kanban is Kanban. The same task
 * opened from the collection therefore silently lost them.
 */
export function ItemDetailRead({
  item,
  actions,
  groupId,
}: {
  item: Item
  actions: ReactNode
  groupId: string | null
}) {
  // No space (or the aggregate) → `null` asks for the union of all known
  // members, so an author from another space still resolves.
  const isOverview = groupId === "__overview__"
  const scopedGroupId = isOverview ? null : groupId
  const { data: members } = useMembers(scopedGroupId)
  const { data: currentUser } = useCurrentUser()

  // Space members first, then the signed-in user — who is not in `members` for
  // their own personal space. Same lookup for authors and relation targets:
  // a task you assigned to yourself in your personal space would otherwise
  // resolve to nobody.
  const resolveUser = (userId: string): User | undefined =>
    members.find((member) => member.id === userId) ??
    (currentUser?.id === userId ? currentUser : undefined)

  const author = resolveUser(item.createdBy)

  // Type-driven body and footer, both from the type register (spec 06) — the
  // same resolution path the list and grid lenses use.
  const presentation = resolveTypePresentation(item.type)

  return (
    <ItemPreview
      item={item}
      author={author}
      headerAdornment={
        <>
          <ItemTypeBadge type={item.type} />
          {isOverview && <ItemScopeBadge item={item} />}
        </>
      }
      actions={actions}
      metaAdornment={<presentation.detail item={item} />}
      footerAdornment={
        // Full-width column: a type footer (vote bar) may need the whole row
        // for its distribution bar; reactions flow below it.
        <div className="flex w-full flex-col gap-2">
          {/* Type-own footer (task -> assignees, statement -> votes) from the
              register (spec 06, rule 3) - no type branching here. Reactions
              are surface convention and never type-bound. */}
          {renderTypeFooter(item)}
          <ReactionBar itemId={item.id} />
        </div>
      }
    />
  )
}

function DetailHostOutlet() {
  const { itemId: focusedId, isEditing, clearFocus, editItem, stopEditing } = useItemFocus()
  const config = useActiveDetailConfig()
  const groupId = useActiveGroupId()
  if (!focusedId || !config) return null
  return (
    <ItemDetailView
      key={focusedId}
      itemId={focusedId}
      // Read↔edit is URL-driven (`?edit`): browser-back peels edit → read → module.
      mode={isEditing ? "edit" : "read"}
      onModeChange={(next) => (next === "edit" ? editItem() : stopEditing())}
      renderRead={(item, actions) => (
        <ItemDetailRead item={item} actions={actions} groupId={groupId} />
      )}
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
export function DetailHostController({
  activeModule,
  activeGroupId,
}: {
  activeModule: string
  /** Comes from the shell, not from a module — see {@link ItemDetailRead}. */
  activeGroupId: string | null
}) {
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
    store.setActiveGroupId(activeGroupId)
  }, [store, activeGroupId])

  useEffect(() => {
    if (hostOwns && focusedId) {
      // The active host module's config isn't registered yet (e.g. the map is
      // still mounting → its `useRegisterDetail` effect hasn't run). This is a
      // transient wait, NOT a reason to close: closing here would fire
      // `onClose=clearFocus` and drop the URL focus mid module-switch. Wait for
      // the config; the panel (if already open) stays put.
      if (!config) return
      // Already showing this item → leave it (config/module changes flow into the
      // outlet via the store without a remount, so the edit composer survives).
      if (openedIdRef.current === focusedId && panelOwnedRef.current) {
        // Content swaps fire no onClose, so ownedRef can be stale: the activity
        // panel may hold the shared panel. An unchanged focus leaves it alone —
        // only a FRESH focus below takes the panel over (activity then closes).
        if (modulePanel.current?.itemId === "__activity__") panelOwnedRef.current = false
        return
      }
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
      //
      // SILENT close: leaving for a module that can't show the item (e.g.
      // Kanban) must NOT clear the URL focus — otherwise switching back to a
      // host module would no longer re-reveal the item. The focus is owned by
      // the URL (`handleModuleChange` carries the itemId across every switch);
      // the controller only opens/closes the panel as a consequence of it. A
      // real user dismissal (X / backdrop) flows through AdaptivePanel →
      // `close()` (non-silent) and clears the focus there.
      openedIdRef.current = null
      if (panelOwnedRef.current) {
        panelOwnedRef.current = false
        if (modulePanel.current?.kind === "detail") modulePanel.close({ silent: true })
      }
    }
  }, [hostOwns, focusedId, config, modulePanel, clearFocus])

  return null
}
