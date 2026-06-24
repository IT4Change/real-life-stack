import { useMemo } from "react"
import { usePersonalGroupId, useGroups } from "@real-life-stack/toolkit"
import type { User } from "@real-life-stack/data-interface"
import type { DetailConfig } from "../detail-host"
import { ALL_CONTENT_TYPES } from "../content-types"
import { withGroupOptions, mapComposerSubmission, itemToComposerData } from "../composer-mapping"
import { useItemComposerProps } from "./use-item-composer-props"

/** The shared, type-driven edit half of every module's detail config. */
export type ItemDetailEditConfig = Pick<
  DetailConfig,
  "contentTypes" | "mapper" | "editInitialData" | "composerProps"
>

/**
 * The edit side of the detail experience, identical across all modules: the full
 * type registry (so the host locks to the item's *own* type and shows its
 * fields, wherever it's opened — a task-with-place editable on the map, a
 * place-with-status in Kanban), the shared submission mapper / pre-fill, and
 * composer props (geocoder + people options from the current scope's members).
 *
 * The group widget's options come from {@link withGroupOptions}; no current-scope
 * default is needed here — editing pre-fills the group from the item's actual
 * space (see ItemDetailView), so only the option list matters.
 */
export function useItemDetailEdit(members: User[]): ItemDetailEditConfig {
  const { data: groups } = useGroups()
  const personalGroupId = usePersonalGroupId()
  // Same composer wiring (geocoder + map-pick + people) as create — one source.
  const composerProps = useItemComposerProps(members)

  const contentTypes = useMemo(
    () => withGroupOptions(ALL_CONTENT_TYPES, groups, undefined, personalGroupId),
    [groups, personalGroupId],
  )

  return useMemo(
    () => ({
      contentTypes,
      mapper: mapComposerSubmission,
      editInitialData: itemToComposerData,
      composerProps,
    }),
    [contentTypes, composerProps],
  )
}
