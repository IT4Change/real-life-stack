import { useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { VALID_MODULES } from "./use-workspace-routing"

export interface ItemFocus {
  /** The currently focused item id from the URL (`/{scope}/{module}/{itemId}`), or undefined. */
  itemId?: string
  /** Focus an item in the current module → writes `/{scope}/{module}/{id}`. */
  focusItem: (id: string) => void
  /** Clear the focus → writes `/{scope}/{module}`. */
  clearFocus: () => void
}

/**
 * The URL side of item focus: the URL is the single source of truth for the
 * focused item, so every "open" writes it and browser-back clears it. Each
 * module reads `itemId` here and runs its own "open panel + reveal" (Feed
 * scrolls, Map zooms, Calendar jumps to the month) — that part stays per
 * module; this hook only owns the navigation.
 *
 * Reads `scope`/`seg` straight from the route. On a module view `seg` is the
 * module, so `focusItem`/`clearFocus` rebuild the path around it. Guarded on
 * `seg` being a real module: on the transient module-less item path
 * (`/{scope}/{itemId}`, pre-redirect) we don't navigate — the routing hook's
 * redirect resolves it first.
 */
export function useItemFocus(): ItemFocus {
  const navigate = useNavigate()
  const { scope, seg, itemId } = useParams<{ scope?: string; seg?: string; itemId?: string }>()
  const onModule = !!scope && !!seg && VALID_MODULES.includes(seg)

  const focusItem = useCallback(
    (id: string) => {
      if (onModule) navigate(`/${scope}/${seg}/${id}`)
    },
    [onModule, scope, seg, navigate],
  )

  const clearFocus = useCallback(() => {
    if (onModule) navigate(`/${scope}/${seg}`)
  }, [onModule, scope, seg, navigate])

  return { itemId, focusItem, clearFocus }
}
