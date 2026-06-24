import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode,
} from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  ItemComposer,
  ComposerFullscreenShell,
  useModulePanel,
  type ContentTypeConfig,
  type ContentComposerProps,
  type ContentComposerHandle,
  type ItemEditorMapper,
  type WidgetData,
} from "@real-life-stack/toolkit"
import type { Item } from "@real-life-stack/data-interface"
import { parsePath, buildUrl } from "./hooks/use-item-focus"
import { useLocationPick } from "./location-pick"

/**
 * A module's create config — the static half (which types, how to map, which
 * surface). The dynamic prefill (a clicked calendar date) is passed per call to
 * {@link CreateHostValue.startCreate}. Registered per module, like the detail
 * host's config, so the URL-driven host knows what to render for `?compose`.
 */
export interface CreateConfig {
  /** Types offered in this module's create menu. */
  contentTypes: ContentTypeConfig[]
  /** Composer submission → item payload. */
  mapper: ItemEditorMapper
  /** Extra composer props (people options, …). */
  composerProps?: Partial<ContentComposerProps>
  /** Surface: side panel (sheet) or fullscreen. */
  shell: "sheet" | "fullscreen"
}

export interface CreateHostValue {
  /** Whether a create form is currently open (`?compose` present). */
  isComposing: boolean
  /** Open the create form for `type` (default: the module's first type),
   *  optionally prefilled. Pushes `?compose=<type>` so browser-back closes it. */
  startCreate: (type?: string, initialData?: Partial<WidgetData>) => void
  /** Patch the open create form's data (e.g. a different clicked date), keeping
   *  the rest — without remounting. No-op when nothing is open. */
  patchCreate: (patch: Partial<WidgetData>) => void
}

const CreateHostContext = createContext<CreateHostValue | null>(null)

/** Internal: everything the outlet needs from the provider. */
interface CreateOutletValue {
  store: ConfigStore
  composeType: string | null
  composerKey: number
  activeConfig: CreateConfig | null
  /** Active create uses the sheet shell → the controller (below the panel) owns it. */
  sheetComposing: boolean
  pendingInitialData: () => Partial<WidgetData> | undefined
  onDone: (item: Item) => void
  cancel: () => void
  composerApiRef: MutableRefObject<ContentComposerHandle | null>
}
const CreateOutletContext = createContext<CreateOutletValue | null>(null)

/** Module-keyed config store — only the ACTIVE module's create config is read,
 *  so the kept-alive (hidden) map can't override the active module. Mirrors the
 *  detail host's store. */
interface ConfigStore {
  setConfig: (module: string, config: CreateConfig | null) => void
  setActiveModule: (module: string) => void
  getActiveConfig: () => CreateConfig | null
  getConfigFor: (module: string) => CreateConfig | null
  subscribe: (listener: () => void) => () => void
}

function createConfigStore(): ConfigStore {
  const configs = new Map<string, CreateConfig>()
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
      if (module === activeModule) notify()
    },
    setActiveModule(module) {
      if (module === activeModule) return
      activeModule = module
      notify()
    },
    getActiveConfig: () => configs.get(activeModule) ?? null,
    getConfigFor: (module) => configs.get(module) ?? null,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}


/**
 * App-level, URL-driven create host. `?compose=<type>` is the single source of
 * truth: a module's "+" (or feed's trigger) calls {@link startCreate}, which
 * pushes `?compose`; the host renders that module's registered create config in
 * its chosen shell (sheet → the shared ModulePanel, fullscreen → the fullscreen
 * shell). Browser-back / cancel / save drop `?compose` and the form closes.
 *
 * Replaces the imperative composer host; the editor + map-pick handoff carry
 * over, so "create on Calendar → pick a position on the Map → come back and
 * save" still works across the module switch (`?compose` is carried by
 * handleModuleChange).
 */
export function CreateHostProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isPicking } = useLocationPick()

  const storeRef = useRef<ConfigStore | null>(null)
  if (!storeRef.current) storeRef.current = createConfigStore()
  const store = storeRef.current

  // Live path/search so the stable callbacks read the route at call time.
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname
  const searchRef = useRef(location.search)
  searchRef.current = location.search

  const { module } = parsePath(location.pathname)
  const composeType = new URLSearchParams(location.search).get("compose")
  const isComposing = composeType !== null && !!module
  // The module that STARTED the current create (set by startCreate). The create
  // stays bound to it even if the URL module changes — e.g. a map-pick excursion
  // to the Map module must not swap a fullscreen create over to the Map's sheet
  // config (which would unmount the composer and lose its data).
  const composeOriginRef = useRef<string | undefined>(undefined)
  // The origin module can unmount during a map-pick detour. Keep the config that
  // started the create alive until `?compose` closes, otherwise the origin pin
  // points at a module with no registered config.
  const composeConfigRef = useRef<CreateConfig | null>(null)

  useEffect(() => {
    if (isComposing) {
      if (!composeOriginRef.current && module) composeOriginRef.current = module
      return
    }
    composeOriginRef.current = undefined
    composeConfigRef.current = null
  }, [isComposing, module])

  // Point the store at the create's origin module while composing, otherwise at
  // the URL module — so the outlet reads the right module's config.
  useEffect(() => {
    const target = isComposing ? (composeOriginRef.current ?? module) : module
    if (target) store.setActiveModule(target)
  }, [isComposing, module, store])
  const registeredActiveConfig = useSyncExternalStore(
    store.subscribe,
    store.getActiveConfig,
    store.getActiveConfig,
  )
  useEffect(() => {
    if (isComposing && registeredActiveConfig) composeConfigRef.current = registeredActiveConfig
  }, [isComposing, registeredActiveConfig])
  const activeConfig = registeredActiveConfig ?? (isComposing ? composeConfigRef.current : null)

  // Transient prefill (a clicked date) + a key so a fresh create remounts the
  // composer, but module switches (same key) keep its in-progress data.
  const pendingInitialDataRef = useRef<Partial<WidgetData> | undefined>(undefined)
  const [composerKey, setComposerKey] = useState(0)
  const composerApiRef = useRef<ContentComposerHandle | null>(null)

  const stopCreate = useCallback(() => {
    const { scope, module } = parsePath(pathRef.current)
    if (!scope || !module) return
    navigate(buildUrl(`/${scope}/${module}`, searchRef.current, { edit: false }), { replace: true })
  }, [navigate])

  const startCreate = useCallback(
    (type?: string, initialData?: Partial<WidgetData>) => {
      const { scope, module } = parsePath(pathRef.current)
      if (!scope || !module) return
      const cfg = store.getConfigFor(module)
      const resolvedType = type ?? cfg?.contentTypes[0]?.id ?? ""
      composeOriginRef.current = module
      composeConfigRef.current = cfg
      pendingInitialDataRef.current = initialData
      setComposerKey((k) => k + 1)
      const params = new URLSearchParams(searchRef.current)
      params.set("compose", resolvedType)
      params.delete("edit")
      // No itemId segment → drops any focused item (you're creating now).
      navigate(`/${scope}/${module}?${params.toString()}`)
    },
    [navigate, store],
  )

  // After a successful create (ItemComposer owns the editor + submit): focus the
  // new item — drop `?compose` and point the URL at it so its detail opens (and
  // the module highlights/reveals it). Falls back to a plain close if odd.
  const focusCreated = useCallback(
    (item: Item) => {
      const { scope, module } = parsePath(pathRef.current)
      if (scope && module) {
        navigate(buildUrl(`/${scope}/${module}/${item.id}`, searchRef.current, { edit: false }), {
          replace: true,
        })
      } else {
        stopCreate()
      }
    },
    [navigate, stopCreate],
  )

  // NB: no "end the pick when !isComposing" cleanup here — a pick can also be
  // started from an EDIT (`?edit`, not `?compose`), where isComposing is false;
  // ending it would kill the edit's map-pick. Orphaned picks (navigate away mid-
  // pick) are already handled inside LocationPickProvider.

  const outletValue = useMemo<CreateOutletValue>(
    () => ({
      store,
      composeType,
      composerKey,
      activeConfig,
      sheetComposing: isComposing && activeConfig?.shell === "sheet",
      pendingInitialData: () => pendingInitialDataRef.current,
      onDone: focusCreated,
      cancel: stopCreate,
      composerApiRef,
    }),
    [store, composeType, composerKey, activeConfig, isComposing, focusCreated, stopCreate],
  )

  const patchCreate = useCallback((patch: Partial<WidgetData>) => {
    composerApiRef.current?.patchData(patch)
  }, [])
  const value = useMemo<CreateHostValue>(
    () => ({ isComposing, startCreate, patchCreate }),
    [isComposing, startCreate, patchCreate],
  )

  const showFullscreen = isComposing && activeConfig?.shell === "fullscreen"

  return (
    <CreateHostContext.Provider value={value}>
      <CreateOutletContext.Provider value={outletValue}>
        {children}
        {/* Fullscreen shell → rendered here (above the panel). Hidden during a map
            pick so the user can reach the map underneath. */}
        <ComposerFullscreenShell
          open={!!showFullscreen}
          suspended={isPicking}
          onRequestClose={stopCreate}
        >
          {showFullscreen && <CreateComposerOutlet className="p-4 sm:p-6" />}
        </ComposerFullscreenShell>
      </CreateOutletContext.Provider>
    </CreateHostContext.Provider>
  )
}

/**
 * Opens/closes the shared ModulePanel for the SHEET shell. Mounted BELOW the
 * panel (so it can call `useModulePanel`) but reads the create config from the
 * provider's context ABOVE the panel — so the panel content (`CreateComposerOutlet`)
 * can read that same context. Mirrors the detail host's provider/controller split.
 * Opens a stable `<CreateComposerOutlet/>` once, closes when composing ends.
 */
export function CreateSheetController() {
  const modulePanel = useModulePanel()
  const ctx = useContext(CreateOutletContext)
  const sheetComposing = !!ctx?.sheetComposing
  const cancel = ctx?.cancel
  const ownedRef = useRef(false)
  useEffect(() => {
    if (sheetComposing) {
      if (ownedRef.current && modulePanel.current?.kind === "composer") return
      ownedRef.current = true
      modulePanel.open({
        kind: "composer",
        content: <CreateComposerOutlet className="p-4 sm:p-6" />,
        onClose: cancel,
      })
    } else if (ownedRef.current) {
      ownedRef.current = false
      if (modulePanel.current?.kind === "composer") modulePanel.close({ silent: true })
    }
  }, [sheetComposing, modulePanel, cancel])
  return null
}

/** Renders the ContentComposer for the active module's create config. */
function CreateComposerOutlet({ className }: { className?: string }) {
  const ctx = useContext(CreateOutletContext)
  const config = ctx?.activeConfig
  if (!ctx || !config) return null
  // Same ItemComposer (form + editor + submit) as edit — only `existingItem` is
  // absent (create) and onDone focuses the new item.
  return (
    <ItemComposer
      key={ctx.composerKey}
      apiRef={ctx.composerApiRef}
      className={className}
      contentTypes={config.contentTypes}
      initialContentType={ctx.composeType ?? undefined}
      initialData={ctx.pendingInitialData()}
      mapper={config.mapper}
      composerProps={config.composerProps}
      onDone={ctx.onDone}
      onCancel={ctx.cancel}
    />
  )
}

/**
 * Register a module's create config. Pass a memoised config so it only
 * re-registers on real change; removed on unmount.
 */
export function useRegisterCreate(module: string, config: CreateConfig): void {
  const ctx = useContext(CreateOutletContext)
  const store = ctx?.store
  useEffect(() => {
    if (!store) return
    store.setConfig(module, config)
    return () => store.setConfig(module, null)
  }, [module, config, store])
}

export function useCreate(): CreateHostValue {
  const ctx = useContext(CreateHostContext)
  if (!ctx) throw new Error("useCreate must be used inside <CreateHostProvider>")
  return ctx
}
