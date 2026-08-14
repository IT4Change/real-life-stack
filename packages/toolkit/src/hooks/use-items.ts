import { useEffect, useMemo, useReducer, startTransition } from "react"
import type { ItemFilter } from "@real-life-stack/data-interface"
import { matchesFilter } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"
import { useDraftItem } from "./use-draft-item"
import { useInitialSync } from "./use-initial-sync"

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
  //
  // Der Erstsync kommt hinzu, weil `loaded` nur den ersten LOKALEN Lesevorgang
  // meint: auf einem frisch angemeldeten Gerät ist er sofort durch und liefert
  // leer, obwohl die eigenen Inhalte noch eintreffen (rls#265). Eine Liste, die
  // in diesem Fenster „nichts vorhanden" behauptet, sagt die Unwahrheit.
  //
  // Aber NUR solange die Liste leer ist: Module zeigen bei `isLoading` ein
  // Skelett STATT der Inhalte — schon eingetroffene Items wieder zu verstecken,
  // bis der letzte Space still ist, wäre langsamer als der Zustand vorher.
  const initialSync = useInitialSync()
  const items = observable.current
  return {
    data: items,
    isLoading: observable.loaded === false || (initialSync.active && items.length === 0),
  }
}

/**
 * Like {@link useItems}, but merges the live draft item (an in-progress
 * create/edit) when it matches the filter — so a module previews it before it's
 * saved. The draft replaces the real item on edit (same id) and is prepended on
 * create. The module's own sort/group/filter then places it (right column, date,
 * marker) for free. Nothing is persisted; on save/cancel the draft vanishes.
 */
export function useItemsWithDraft(filter?: ItemFilter) {
  const { data, isLoading } = useItems(filter)
  const draft = useDraftItem()
  const filterKey = JSON.stringify(filter)
  const merged = useMemo(() => {
    if (!draft || !matchesFilter(draft, filter ?? {})) return data
    return [draft, ...data.filter((it) => it.id !== draft.id)]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, draft, filterKey])
  return { data: merged, isLoading }
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
