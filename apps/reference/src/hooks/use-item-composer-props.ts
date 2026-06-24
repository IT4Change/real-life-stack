import { useMemo } from "react"
import {
  nominatimGeocode,
  nominatimReverseGeocode,
  type ContentComposerProps,
  type PersonOption,
} from "@real-life-stack/toolkit"
import type { User } from "@real-life-stack/data-interface"
import { useLocationPick } from "../location-pick"

/**
 * The composer's runtime wiring, shared by BOTH create and edit so the two can
 * never drift: the geocoder, the map-pick handoff, and people options from the
 * current scope's members. (The map-pick going missing in edit was exactly this
 * drift — one wiring source now feeds both.)
 *
 * Field/widget definitions ("templates") come from the shared type registry;
 * this is only the per-scope runtime callbacks.
 */
export function useItemComposerProps(members: User[]): Partial<ContentComposerProps> {
  const { startPick } = useLocationPick()
  const peopleOptions = useMemo<PersonOption[]>(
    () => members.map((m) => ({ id: m.id, name: m.displayName ?? m.id })),
    [members],
  )
  return useMemo(
    () => ({
      geocode: nominatimGeocode,
      reverseGeocode: nominatimReverseGeocode,
      requestMapPick: startPick,
      peopleOptions,
      peopleQuickSuggestions: peopleOptions.slice(0, 10),
    }),
    [startPick, peopleOptions],
  )
}
