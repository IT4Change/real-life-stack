import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { VALID_MODULES } from "./use-workspace-routing"

export interface ItemFocus {
  /** The currently focused item id from the URL (`/{scope}/{module}/{itemId}`), or undefined. */
  itemId?: string
  /** Focus an item in the current module → writes `/{scope}/{module}/{id}`. */
  focusItem: (id: string) => void
  /** Clear the focus → writes `/{scope}/{module}` (the module the user is on right now). */
  clearFocus: () => void
}

const ItemFocusContext = createContext<ItemFocus | null>(null)

/** Split a pathname into scope/module/item — module only when it's a real module. */
function parsePath(pathname: string): { scope?: string; module?: string; itemId?: string } {
  const [scope, seg, item] = pathname.split("/").filter(Boolean)
  if (seg && VALID_MODULES.includes(seg)) return { scope, module: seg, itemId: item }
  // Module-less or bare path — no module-focus context (e.g. the transient
  // `/{scope}/{itemId}` before use-workspace-routing redirects it).
  return { scope }
}

/**
 * Route-stable source of truth for item focus. The URL owns the focused item
 * (`/{scope}/{module}/{itemId}`): every open writes it, browser-back clears it.
 *
 * Why a provider above the routes instead of a per-module hook: the shared
 * ModulePanel persists across module switches, so a module's `onClose` can fire
 * long after that module unmounted (open a Feed detail → switch to Kanban
 * carrying the focus → close). A per-module `clearFocus` would be frozen to the
 * module's old route and yank the user back into it. So focus lives here, where
 * it survives every switch: `focusItem`/`clearFocus` read the LIVE location at
 * call time and rewrite the 3rd path segment of whatever module the user is
 * actually on.
 */
export function ItemFocusProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  // Always-current path so the stable callbacks below (stored as the panel's
  // onClose) read the route at CALL time, not at the render they were created.
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname

  const focusItem = useCallback((id: string) => {
    const { scope, module } = parsePath(pathRef.current)
    if (!scope || !module) return
    const target = `/${scope}/${module}/${id}`
    if (pathRef.current !== target) navigate(target)
  }, [navigate])

  const clearFocus = useCallback(() => {
    const { scope, module, itemId } = parsePath(pathRef.current)
    // Only navigate when there is actually a focused item to drop — avoids a
    // redundant push when the focus was already cleared (e.g. browser-back).
    if (scope && module && itemId) navigate(`/${scope}/${module}`)
  }, [navigate])

  const itemId = parsePath(location.pathname).itemId
  const value = useMemo<ItemFocus>(
    () => ({ itemId, focusItem, clearFocus }),
    [itemId, focusItem, clearFocus],
  )
  return <ItemFocusContext.Provider value={value}>{children}</ItemFocusContext.Provider>
}

/** Read item focus. Each module runs its own "open panel + reveal" off `itemId`. */
export function useItemFocus(): ItemFocus {
  const ctx = useContext(ItemFocusContext)
  if (!ctx) throw new Error("useItemFocus must be used within <ItemFocusProvider>")
  return ctx
}
