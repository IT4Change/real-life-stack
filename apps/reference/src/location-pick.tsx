import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

export interface LatLng {
  lat: number
  lng: number
}

export interface PickHandlers {
  /** Commit the picked position to the composer (called on each map click). */
  onPick: (pos: LatLng) => void
  /** Restore the pre-pick position when the user aborts. */
  onCancel?: () => void
}

export interface LocationPickValue {
  /** True while the user is picking a position on the map. */
  isPicking: boolean
  /**
   * True while an *edit* pick is active: confirm ("Fertig") returns to the
   * origin module so the user lands back on their still-open composer. A create
   * pick (`returnOnConfirm` false) stays on the map after confirm. Also makes
   * "Fertig" available on desktop, where the composer sidebar stays visible.
   */
  returnOnConfirm: boolean
  /**
   * Start picking: remembers the current module, switches to the Map module,
   * and arms the handlers. The composer that called this stays open in the
   * persistent panel across the module switch. Pass `{ returnOnConfirm: true }`
   * from an edit composer so confirm navigates back to the origin module.
   */
  startPick: (handlers: PickHandlers, opts?: { returnOnConfirm?: boolean }) => void
  /** A map click during picking: commit the position immediately (stays in picking mode). */
  updatePick: (pos: LatLng) => void
  /** Finish picking. Keeps the committed position; create-pick stays on the map,
   *  edit-pick returns to the origin module (see `returnOnConfirm`). */
  confirmPick: () => void
  /** Abort picking: restore the pre-pick position and return to the origin module. */
  cancelPick: () => void
  /**
   * One-shot: returns `true` exactly once after an edit-pick navigated back to a
   * non-map origin. The origin module's focus effect calls this and, when true,
   * adopts the still-open edit composer instead of re-revealing the item. Returns
   * `false` for normal cross-module navigation, so reveal/fly stays intact there.
   */
  consumeEditPickReturn: () => boolean
}

const LocationPickContext = createContext<LocationPickValue | null>(null)

/**
 * App-level location-picking flow. Lets a composer (in any module) hand off
 * position picking to the big Map module and get the result back, surviving
 * the module switch because the picking state + callback live here, above the
 * ModuleOutlet.
 */
export function LocationPickProvider({
  children,
  navigateToModule,
  currentModule,
}: {
  children: ReactNode
  navigateToModule: (moduleId: string, opts?: { replace?: boolean }) => void
  currentModule: string
}) {
  const [isPicking, setIsPicking] = useState(false)
  const [returnOnConfirm, setReturnOnConfirm] = useState(false)
  const handlersRef = useRef<PickHandlers | null>(null)
  const originRef = useRef<string | null>(null)
  const reachedMapRef = useRef(false)
  // Whether confirm should return to the origin module (edit-pick) — a ref so the
  // stable confirmPick callback reads the current value without re-creating.
  const returnOnConfirmRef = useRef(false)
  // Set when an edit-pick navigates back to a non-map origin: signals that
  // module's focus effect to ADOPT the already-open edit composer instead of
  // re-revealing the item as a read view. Consumed once (see consumeEditPickReturn).
  const editPickReturnRef = useRef(false)
  // Refs so the callbacks stay stable regardless of re-renders.
  const navRef = useRef(navigateToModule)
  navRef.current = navigateToModule
  const moduleRef = useRef(currentModule)
  moduleRef.current = currentModule

  const endPick = useCallback((opts: { restore: boolean; navigate: boolean }) => {
    const handlers = handlersRef.current
    const origin = originRef.current
    const wasEditPick = returnOnConfirmRef.current
    // Clear state first, so a throwing onCancel can't leave picking stuck.
    handlersRef.current = null
    originRef.current = null
    reachedMapRef.current = false
    returnOnConfirmRef.current = false
    setReturnOnConfirm(false)
    setIsPicking(false)
    if (opts.restore) {
      try {
        handlers?.onCancel?.()
      } catch {
        /* ignore restore failures */
      }
    }
    // Return via replace, so the Map detour does not linger in history.
    if (opts.navigate && origin && origin !== "map") {
      // The origin module is about to remount with the item still focused; tell
      // its focus effect to adopt the open edit composer rather than re-reveal.
      if (wasEditPick) editPickReturnRef.current = true
      navRef.current(origin, { replace: true })
    }
  }, [])

  const startPick = useCallback(
    (handlers: PickHandlers, opts?: { returnOnConfirm?: boolean }) => {
      handlersRef.current = handlers
      originRef.current = moduleRef.current
      reachedMapRef.current = false
      returnOnConfirmRef.current = opts?.returnOnConfirm ?? false
      setReturnOnConfirm(returnOnConfirmRef.current)
      setIsPicking(true)
      if (moduleRef.current !== "map") navRef.current("map")
    },
    [],
  )

  const updatePick = useCallback((pos: LatLng) => {
    handlersRef.current?.onPick(pos)
  }, [])

  // "Done": keep the picked position. A create-pick stays on the map (un-suspends
  // the composer on mobile); an edit-pick returns to the origin module so the
  // user lands back on their still-open composer with the new position.
  const confirmPick = useCallback(
    () => endPick({ restore: false, navigate: returnOnConfirmRef.current }),
    [endPick],
  )
  // "Cancel": restore the pre-pick position and return to the origin module.
  const cancelPick = useCallback(() => endPick({ restore: true, navigate: true }), [endPick])

  const consumeEditPickReturn = useCallback(() => {
    if (!editPickReturnRef.current) return false
    editPickReturnRef.current = false
    return true
  }, [])

  // Couple picking to Map-module presence: once we have reached the Map, if the
  // user navigates away (tab / bottom-nav / browser-back) mid-pick, abort and
  // restore the pre-pick position so the composer is not left suspended and
  // unreachable. Only clear here — the user already navigated.
  useEffect(() => {
    if (!isPicking) return
    if (currentModule === "map") {
      reachedMapRef.current = true
    } else if (reachedMapRef.current) {
      endPick({ restore: true, navigate: false })
    }
  }, [isPicking, currentModule, endPick])

  const value = useMemo<LocationPickValue>(
    () => ({
      isPicking,
      returnOnConfirm,
      startPick,
      updatePick,
      confirmPick,
      cancelPick,
      consumeEditPickReturn,
    }),
    [isPicking, returnOnConfirm, startPick, updatePick, confirmPick, cancelPick, consumeEditPickReturn],
  )

  return <LocationPickContext.Provider value={value}>{children}</LocationPickContext.Provider>
}

export function useLocationPick(): LocationPickValue {
  const ctx = useContext(LocationPickContext)
  if (!ctx) {
    throw new Error("useLocationPick must be used inside <LocationPickProvider>")
  }
  return ctx
}

/**
 * Map-pick wired for an **edit** composer: hands off to the Map module and
 * returns to the origin module on "Fertig" (a create composer stays on the map
 * instead). Pass the result as the composer's `requestMapPick`. One wrapper, so
 * Feed / Calendar / Map / Kanban don't each re-spell the `returnOnConfirm` flag.
 */
export function useEditMapPick(): (handlers: PickHandlers) => void {
  const { startPick } = useLocationPick()
  return useCallback(
    (handlers: PickHandlers) => startPick(handlers, { returnOnConfirm: true }),
    [startPick],
  )
}
