import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

export interface LatLng { lat: number; lng: number }
export interface PickHandlers { onPick: (position: LatLng) => void; onCancel?: () => void }
export interface LocationPickValue {
  isPicking: boolean
  /** `false`, wenn die Karte in diesem Space nicht erreichbar ist — dann beginnt kein Pick. */
  startPick: (handlers: PickHandlers) => boolean
  updatePick: (position: LatLng) => void
  confirmPick: () => void
  cancelPick: () => void
}

const unavailablePick: LocationPickValue = {
  isPicking: false,
  startPick: () => false,
  updatePick: () => undefined,
  confirmPick: () => undefined,
  cancelPick: () => undefined,
}
const LocationPickContext = createContext<LocationPickValue>(unavailablePick)

/** Shared map hand-off state. Navigation remains shell-owned through these two callbacks. */
export function LocationPickProvider({ children, navigateToModule, currentModule, canOpenMap = true }: {
  children: ReactNode
  navigateToModule: (moduleId: string, opts?: { replace?: boolean }) => void
  currentModule: string
  /**
   * Fuehrt der aktuelle Space die Karte? Wenn nicht, darf ein Pick gar nicht
   * erst beginnen: Er wartet darauf, dass `currentModule` zu "map" wird, und
   * das geschieht dann nie — der Composer bliebe im Pick-Zustand haengen.
   */
  canOpenMap?: boolean
}) {
  const [isPicking, setIsPicking] = useState(false)
  const handlers = useRef<PickHandlers | null>(null)
  const origin = useRef<string | null>(null)
  const reachedMap = useRef(false)
  const navigation = useRef(navigateToModule)
  navigation.current = navigateToModule
  const module = useRef(currentModule)
  module.current = currentModule
  const end = useCallback((restore: boolean, navigate: boolean) => {
    const current = handlers.current
    const previous = origin.current
    handlers.current = null; origin.current = null; reachedMap.current = false; setIsPicking(false)
    if (restore) { try { current?.onCancel?.() } catch { /* a composer restore must not trap picking */ } }
    if (navigate && previous && previous !== "map") navigation.current(previous, { replace: true })
  }, [])
  const reachable = useRef(canOpenMap)
  reachable.current = canOpenMap
  const startPick = useCallback((next: PickHandlers): boolean => {
    // Ohne erreichbare Karte gar nicht anfangen — ein begonnener Pick, der
    // die Karte nie sieht, laesst sich vom Nutzer nicht mehr beenden.
    if (!reachable.current) return false
    handlers.current = next; origin.current = module.current; reachedMap.current = false; setIsPicking(true)
    if (module.current !== "map") navigation.current("map")
    return true
  }, [])
  const updatePick = useCallback((position: LatLng) => handlers.current?.onPick(position), [])
  const confirmPick = useCallback(() => end(false, true), [end])
  const cancelPick = useCallback(() => end(true, true), [end])
  useEffect(() => {
    if (!isPicking) return
    if (currentModule === "map") reachedMap.current = true
    else if (reachedMap.current) end(true, false)
  }, [currentModule, end, isPicking])
  const value = useMemo(() => ({ isPicking, startPick, updatePick, confirmPick, cancelPick }), [cancelPick, confirmPick, isPicking, startPick, updatePick])
  return <LocationPickContext.Provider value={value}>{children}</LocationPickContext.Provider>
}

export function useLocationPick(): LocationPickValue {
  return useContext(LocationPickContext)
}
