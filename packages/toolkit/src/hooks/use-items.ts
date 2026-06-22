import { useEffect, useMemo, useReducer, startTransition } from "react"
import type { ItemFilter } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

export function useItems(filter?: ItemFilter) {
  const connector = useConnector()
  const filterKey = JSON.stringify(filter)
  const observable = useMemo(
    () => connector.observe(filter ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connector, filterKey]
  )
  // The returned values are read FRESH from `observable` on every render — so
  // switching the filter (e.g. a new map bbox) never serves the previous
  // observable's stale snapshot, which would let consumers reconcile once with
  // old ids + stale `loaded`. The subscription only nudges a re-render when the
  // value or `loaded` flag changes (`markLoaded` notifies through it too).
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    rerender() // catch any change between this render and subscribing
    return observable.subscribe(() => startTransition(rerender))
  }, [observable])

  // `isLoading` reflects the observable's `loaded` flag (false only while an
  // async source's first fetch is in flight), NOT "the list is empty" — a
  // genuinely empty result reads as loaded. `loaded === undefined` (sources
  // without the flag) counts as loaded.
  return { data: observable.current, isLoading: observable.loaded === false }
}

export function useItem(id: string) {
  const connector = useConnector()
  const observable = useMemo(() => connector.observeItem(id), [connector, id])
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    rerender()
    return observable.subscribe(() => startTransition(rerender))
  }, [observable])

  // `loaded` distinguishes "still loading" from "loaded, but null" (item not
  // found); fall back to the null check for sources without the flag.
  return {
    data: observable.current,
    isLoading: observable.loaded === false || (observable.loaded === undefined && observable.current === null),
  }
}
