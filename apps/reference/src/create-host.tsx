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
  ContentComposer,
  ComposerFullscreenShell,
  nominatimGeocode,
  nominatimReverseGeocode,
  useItemEditor,
  useModulePanel,
  type ContentTypeConfig,
  type ContentComposerProps,
  type ContentComposerHandle,
  type ItemEditorMapper,
  type WidgetData,
} from "@real-life-stack/toolkit"
import { VALID_MODULES } from "./hooks/use-workspace-routing"
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
  submit: (data: { contentType: string; isPublic: boolean; data: WidgetData }) => Promise<boolean>
  cancel: () => void
  requestMapPick: ContentComposerProps["requestMapPick"]
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

/** Scope + module from a pathname (module only when it's a real module). */
function parseModule(pathname: string): { scope?: string; module?: string } {
  const [scope, seg] = pathname.split("/").filter(Boolean)
  if (seg && VALID_MODULES.includes(seg)) return { scope, module: seg }
  return { scope }
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
export function CreateHostProvider({
  children,
  currentUserId,
}: {
  children: ReactNode
  currentUserId?: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { startPick, confirmPick, isPicking } = useLocationPick()

  const storeRef = useRef<ConfigStore | null>(null)
  if (!storeRef.current) storeRef.current = createConfigStore()
  const store = storeRef.current

  // Live path/search so the stable callbacks read the route at call time.
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname
  const searchRef = useRef(location.search)
  searchRef.current = location.search

  const { module } = parseModule(location.pathname)
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

  // Editor (one, shared). Its mapper tracks the active module's config.
  const mapperRef = useRef<ItemEditorMapper>(() => null)
  mapperRef.current = activeConfig?.mapper ?? (() => null)
  const editor = useItemEditor({
    currentUserId,
    mapSubmission: useCallback<ItemEditorMapper>((s, ctx) => mapperRef.current(s, ctx), []),
  })
  const editorRef = useRef(editor)
  editorRef.current = editor

  // Transient prefill (a clicked date) + a key so a fresh create remounts the
  // composer, but module switches (same key) keep its in-progress data.
  const pendingInitialDataRef = useRef<Partial<WidgetData> | undefined>(undefined)
  const [composerKey, setComposerKey] = useState(0)
  const composerApiRef = useRef<ContentComposerHandle | null>(null)

  const stopCreate = useCallback(() => {
    const { scope, module } = parseModule(pathRef.current)
    if (!scope || !module) return
    const params = new URLSearchParams(searchRef.current)
    params.delete("compose")
    const q = params.toString()
    navigate(`/${scope}/${module}${q ? `?${q}` : ""}`, { replace: true })
  }, [navigate])

  const startCreate = useCallback(
    (type?: string, initialData?: Partial<WidgetData>) => {
      const { scope, module } = parseModule(pathRef.current)
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

  const submit = useCallback(
    async (data: { contentType: string; isPublic: boolean; data: WidgetData }) => {
      const created = await editorRef.current.submit(data)
      if (created) {
        stopCreate()
        return true
      }
      return false
    },
    [stopCreate],
  )

  // End any in-flight map pick if the composer is no longer the panel content
  // (it was replaced/closed) — avoids a stuck pick state.
  const confirmPickRef = useRef(confirmPick)
  confirmPickRef.current = confirmPick
  useEffect(() => {
    if (isPicking && !isComposing) confirmPickRef.current()
  }, [isPicking, isComposing])

  const outletValue = useMemo<CreateOutletValue>(
    () => ({
      store,
      composeType,
      composerKey,
      activeConfig,
      sheetComposing: isComposing && activeConfig?.shell === "sheet",
      pendingInitialData: () => pendingInitialDataRef.current,
      submit,
      cancel: stopCreate,
      requestMapPick: startPick,
      composerApiRef,
    }),
    [store, composeType, composerKey, activeConfig, isComposing, submit, stopCreate, startPick],
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
  return (
    <ContentComposer
      key={ctx.composerKey}
      apiRef={ctx.composerApiRef}
      className={className}
      contentTypes={config.contentTypes}
      initialContentType={ctx.composeType ?? undefined}
      initialData={ctx.pendingInitialData()}
      showPreview={false}
      geocode={nominatimGeocode}
      reverseGeocode={nominatimReverseGeocode}
      requestMapPick={ctx.requestMapPick}
      {...config.composerProps}
      onSubmit={async (data) => {
        const ok = await ctx.submit(data)
        if (!ok) throw new Error("Speichern fehlgeschlagen. Bitte erneut versuchen.")
      }}
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
