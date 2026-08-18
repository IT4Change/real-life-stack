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
  const { startPick, canPick } = useLocationPick()
  const peopleOptions = useMemo<PersonOption[]>(
    () => members.map((m) => ({ id: m.id, name: m.displayName ?? m.id })),
    [members],
  )
  return useMemo(
    () => ({
      geocode: nominatimGeocode,
      reverseGeocode: nominatimReverseGeocode,
      // Fuehrt dieser Space keine Karte, wird der Pick gar nicht erst
      // angeboten: Das Widget zeigt den Karten-Knopf nur, wenn er da ist.
      // Ein Ort bleibt trotzdem eingebbar — die Adresssuche setzt die
      // Position, und ein Ort ist ein Datenfeld, keine Ansicht.
      requestMapPick: canPick ? startPick : undefined,
      peopleOptions,
      peopleQuickSuggestions: peopleOptions.slice(0, 10),
    }),
    [startPick, canPick, peopleOptions],
  )
}
