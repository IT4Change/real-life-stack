import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { DRAFT_ITEM_ID } from "@real-life-stack/toolkit"
import { VALID_MODULES } from "./use-workspace-routing"

export interface ItemFocus {
  /** The currently focused item id from the URL (`/{scope}/{module}/{itemId}`), or undefined. */
  itemId?: string
  /** Whether the focused item is in edit mode (URL carries `?edit`). */
  isEditing: boolean
  /** Focus an item in the current module → writes `/{scope}/{module}/{id}` (read). */
  focusItem: (id: string) => void
  /** Clear the focus → writes `/{scope}/{module}` (the module the user is on right now). */
  clearFocus: () => void
  /** Enter edit for the focused item → adds `?edit` (pushed, so back returns to read). */
  editItem: () => void
  /** Leave edit → drops `?edit` (replaced, so back from read goes to the module). */
  stopEditing: () => void
}

const ItemFocusContext = createContext<ItemFocus | null>(null)

/** Split a pathname into scope/module/item — module only when it's a real module. */
export function parsePath(pathname: string): { scope?: string; module?: string; itemId?: string } {
  const [scope, seg, item] = pathname.split("/").filter(Boolean)
  if (seg && VALID_MODULES.includes(seg)) return { scope, module: seg, itemId: item }
  // Module-less or bare path — no module-focus context (e.g. the transient
  // `/{scope}/{itemId}` before use-workspace-routing redirects it).
  return { scope }
}

/**
 * Build a URL for the focus/edit state, toggling `?edit` and preserving other
 * query params — but always dropping `?compose`: focusing or clearing an item
 * means "look at this item", which leaves any in-progress create (same as it
 * leaves edit). So clicking another item while creating works like it does while
 * editing.
 */
export function buildUrl(pathname: string, search: string, opts: { edit: boolean }): string {
  const params = new URLSearchParams(search)
  params.delete("compose")
  if (opts.edit) params.set("edit", "1")
  else params.delete("edit")
  const q = params.toString()
  return q ? `${pathname}?${q}` : pathname
}

/**
 * Route-stable source of truth for item focus AND its edit state. The URL owns
 * both: `/{scope}/{module}/{itemId}` is the focused item (read), `?edit` flips it
 * to edit. Every open/edit writes the URL; browser-back peels one layer
 * (edit → read → module).
 *
 * Why a provider above the routes instead of a per-module hook: the shared
 * ModulePanel persists across module switches, so a module's `onClose` can fire
 * long after that module unmounted. A per-module callback would be frozen to the
 * module's old route. So focus lives here, where it survives every switch:
 * the callbacks read the LIVE location at call time and rewrite the path/query
 * of whatever module the user is actually on.
 */
export function ItemFocusProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  // Always-current path/search so the stable callbacks below (some stored as the
  // panel's onClose) read the route at CALL time, not at the render they were
  // created.
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname
  const searchRef = useRef(location.search)
  searchRef.current = location.search

  const focusItem = useCallback((id: string) => {
    // The live preview draft (a create's synthetic id) isn't a real focusable
    // item — clicking its preview should do nothing.
    if (id === DRAFT_ITEM_ID) return
    const { scope, module } = parsePath(pathRef.current)
    if (!scope || !module) return
    // Focusing an item is the read view — drop any stale `?edit`, keep other query.
    const target = buildUrl(`/${scope}/${module}/${id}`, searchRef.current, { edit: false })
    if (`${pathRef.current}${searchRef.current}` !== target) navigate(target)
  }, [navigate])

  const clearFocus = useCallback(() => {
    const { scope, module, itemId } = parsePath(pathRef.current)
    // Only navigate when there is actually a focused item to drop — avoids a
    // redundant push when the focus was already cleared (e.g. browser-back).
    if (scope && module && itemId) {
      navigate(buildUrl(`/${scope}/${module}`, searchRef.current, { edit: false }))
    }
  }, [navigate])

  const editItem = useCallback(() => {
    const { scope, module, itemId } = parsePath(pathRef.current)
    if (!scope || !module || !itemId) return
    // Pushed so browser-back returns to the read view.
    navigate(buildUrl(`/${scope}/${module}/${itemId}`, searchRef.current, { edit: true }))
  }, [navigate])

  const stopEditing = useCallback(() => {
    const { scope, module, itemId } = parsePath(pathRef.current)
    if (!scope || !module || !itemId) return
    // Replace so the edit step doesn't linger in history after save/cancel.
    navigate(buildUrl(`/${scope}/${module}/${itemId}`, searchRef.current, { edit: false }), {
      replace: true,
    })
  }, [navigate])

  const { itemId } = parsePath(location.pathname)
  const isEditing = !!itemId && new URLSearchParams(location.search).has("edit")
  const value = useMemo<ItemFocus>(
    () => ({ itemId, isEditing, focusItem, clearFocus, editItem, stopEditing }),
    [itemId, isEditing, focusItem, clearFocus, editItem, stopEditing],
  )
  return <ItemFocusContext.Provider value={value}>{children}</ItemFocusContext.Provider>
}

/** Read item focus. Each module runs its own "open panel + reveal" off `itemId`. */
export function useItemFocus(): ItemFocus {
  const ctx = useContext(ItemFocusContext)
  if (!ctx) throw new Error("useItemFocus must be used within <ItemFocusProvider>")
  return ctx
}
