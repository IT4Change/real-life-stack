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
   * Start picking: remembers the current module, switches to the Map module,
   * and arms the handlers. The composer that called this stays open in the
   * persistent panel across the module switch.
   */
  startPick: (handlers: PickHandlers) => void
  /** A map click during picking: commit the position immediately (stays in picking mode). */
  updatePick: (pos: LatLng) => void
  /** Finish picking and stay on the map; the committed position is kept (used to
   *  un-suspend the composer on mobile). */
  confirmPick: () => void
  /** Abort picking: restore the pre-pick position and return to the origin module. */
  cancelPick: () => void
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
  const handlersRef = useRef<PickHandlers | null>(null)
  const originRef = useRef<string | null>(null)
  const reachedMapRef = useRef(false)
  // Refs so the callbacks stay stable regardless of re-renders.
  const navRef = useRef(navigateToModule)
  navRef.current = navigateToModule
  const moduleRef = useRef(currentModule)
  moduleRef.current = currentModule

  const endPick = useCallback((opts: { restore: boolean; navigate: boolean }) => {
    const handlers = handlersRef.current
    const origin = originRef.current
    // Clear state first, so a throwing onCancel can't leave picking stuck.
    handlersRef.current = null
    originRef.current = null
    reachedMapRef.current = false
    setIsPicking(false)
    if (opts.restore) {
      try {
        handlers?.onCancel?.()
      } catch {
        /* ignore restore failures */
      }
    }
    // Return via replace, so the Map detour does not linger in history.
    if (opts.navigate && origin && origin !== "map") navRef.current(origin, { replace: true })
  }, [])

  const startPick = useCallback((handlers: PickHandlers) => {
    handlersRef.current = handlers
    originRef.current = moduleRef.current
    reachedMapRef.current = false
    setIsPicking(true)
    if (moduleRef.current !== "map") navRef.current("map")
  }, [])

  const updatePick = useCallback((pos: LatLng) => {
    handlersRef.current?.onPick(pos)
  }, [])

  // "Done": keep the picked position and stay on the map (un-suspends the
  // composer on mobile).
  const confirmPick = useCallback(() => endPick({ restore: false, navigate: false }), [endPick])
  // "Cancel": restore the pre-pick position and return to the origin module.
  const cancelPick = useCallback(() => endPick({ restore: true, navigate: true }), [endPick])

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
    () => ({ isPicking, startPick, updatePick, confirmPick, cancelPick }),
    [isPicking, startPick, updatePick, confirmPick, cancelPick],
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
