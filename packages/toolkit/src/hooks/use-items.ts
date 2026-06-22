import { useEffect, useMemo, useState, useCallback, startTransition } from "react"
import type { Item, ItemFilter } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

export function useItems(filter?: ItemFilter) {
  const connector = useConnector()
  const filterKey = JSON.stringify(filter)
  const observable = useMemo(
    () => connector.observe(filter ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connector, filterKey]
  )
  // Track value AND loaded together. `isLoading` reflects the observable's
  // `loaded` flag (false only while an async source's first fetch is in flight),
  // NOT "the list is empty" — so a genuinely empty result reads as loaded, not
  // loading. `loaded === undefined` (sources without the flag) counts as loaded.
  const [snapshot, setSnapshot] = useState<{ data: Item[]; loaded: boolean }>(() => ({
    data: observable.current,
    loaded: observable.loaded !== false,
  }))
  const sync = useCallback(
    () =>
      startTransition(() =>
        setSnapshot({ data: observable.current, loaded: observable.loaded !== false }),
      ),
    [observable],
  )

  useEffect(() => {
    sync()
    // `markLoaded` notifies through the same channel, so this re-reads `loaded`
    // even when the resolved value is unchanged (empty result).
    return observable.subscribe(sync)
  }, [observable, sync])

  return { data: snapshot.data, isLoading: !snapshot.loaded }
}

export function useItem(id: string) {
  const connector = useConnector()
  const observable = useMemo(() => connector.observeItem(id), [connector, id])
  const [data, setData] = useState<Item | null>(observable.current)
  const update = useCallback((item: Item | null) => startTransition(() => setData(item)), [])

  useEffect(() => {
    setData(observable.current)
    return observable.subscribe(update)
  }, [observable, update])

  return { data, isLoading: data === null }
}
