import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

export interface LatLng { lat: number; lng: number }
export interface PickHandlers { onPick: (position: LatLng) => void; onCancel?: () => void }
export interface LocationPickValue {
  isPicking: boolean
  startPick: (handlers: PickHandlers) => void
  updatePick: (position: LatLng) => void
  confirmPick: () => void
  cancelPick: () => void
}

const unavailablePick: LocationPickValue = {
  isPicking: false,
  startPick: () => undefined,
  updatePick: () => undefined,
  confirmPick: () => undefined,
  cancelPick: () => undefined,
}
const LocationPickContext = createContext<LocationPickValue>(unavailablePick)

/** Shared map hand-off state. Navigation remains shell-owned through these two callbacks. */
export function LocationPickProvider({ children, navigateToModule, currentModule }: {
  children: ReactNode
  navigateToModule: (moduleId: string, opts?: { replace?: boolean }) => void
  currentModule: string
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
  const startPick = useCallback((next: PickHandlers) => {
    handlers.current = next; origin.current = module.current; reachedMap.current = false; setIsPicking(true)
    if (module.current !== "map") navigation.current("map")
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
