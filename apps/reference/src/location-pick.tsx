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

export interface LocationPickValue {
  /** True while the user is picking a position on the map. */
  isPicking: boolean
  /**
   * Start picking: remembers the current module, switches to the Map module,
   * and arms `onPicked` to receive the chosen position. The composer that
   * called this stays open in the persistent panel across the module switch.
   */
  startPick: (onPicked: (pos: LatLng) => void) => void
  /** A map click during picking: writes the position back and returns to the origin module. */
  applyPick: (pos: LatLng) => void
  /** Abort picking and return to the origin module without writing a position. */
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
  const onPickedRef = useRef<((pos: LatLng) => void) | null>(null)
  const originRef = useRef<string | null>(null)
  const reachedMapRef = useRef(false)
  // Refs so the callbacks stay stable regardless of re-renders.
  const navRef = useRef(navigateToModule)
  navRef.current = navigateToModule
  const moduleRef = useRef(currentModule)
  moduleRef.current = currentModule

  // Clear picking state without navigating (the user already moved, or the
  // caller navigates separately in finish()).
  const reset = useCallback(() => {
    onPickedRef.current = null
    originRef.current = null
    reachedMapRef.current = false
    setIsPicking(false)
  }, [])

  // Finish picking and return to the origin module (replace, so the Map detour
  // does not linger in history).
  const finish = useCallback(() => {
    const origin = originRef.current
    reset()
    if (origin && origin !== "map") navRef.current(origin, { replace: true })
  }, [reset])

  const startPick = useCallback((onPicked: (pos: LatLng) => void) => {
    onPickedRef.current = onPicked
    originRef.current = moduleRef.current
    reachedMapRef.current = false
    setIsPicking(true)
    if (moduleRef.current !== "map") navRef.current("map")
  }, [])

  const applyPick = useCallback(
    (pos: LatLng) => {
      onPickedRef.current?.(pos)
      finish()
    },
    [finish],
  )

  const cancelPick = useCallback(() => finish(), [finish])

  // Couple picking to Map-module presence: once we have reached the Map, if the
  // user navigates away (tab / bottom-nav / browser-back) mid-pick, abort so
  // the composer is not left suspended and unreachable. Only clear here — the
  // user already navigated; applyPick/cancelPick handle the deliberate return.
  useEffect(() => {
    if (!isPicking) return
    if (currentModule === "map") {
      reachedMapRef.current = true
    } else if (reachedMapRef.current) {
      reset()
    }
  }, [isPicking, currentModule, reset])

  const value = useMemo<LocationPickValue>(
    () => ({ isPicking, startPick, applyPick, cancelPick }),
    [isPicking, startPick, applyPick, cancelPick],
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
