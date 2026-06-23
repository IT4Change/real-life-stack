import { useCallback, useMemo } from "react"
import { hasItemGroups, type Group, type Item } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"
import { useGroups, usePersonalGroupId } from "./use-groups"
import { getSpacePrimaryColor } from "../lib/utils"

/**
 * Returns a resolver `(item) => colour` that yields the primary colour of the
 * group an item was *created* in (its origin group), via the connector's
 * `ItemGroupCapable.getItemGroupId`. Falls back to `activeGroupId` when the
 * origin is unknown (e.g. single-group mode), and to a deterministic palette
 * colour as a last resort.
 *
 * Shared by every module so item colouring and the active-item glow stay
 * consistent — and so the "colour by origin group" logic lives in one place
 * (calendar, map, feed, kanban) instead of being copied per view.
 */
export function useItemGroupColorResolver(activeGroupId?: string): (item: Item) => string {
  const connector = useConnector()
  const { data: groups } = useGroups()

  const groupColorById = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of groups) {
      map.set(g.id, getSpacePrimaryColor(g.id, (g.data?.primaryColor as string | undefined) ?? null))
    }
    return map
  }, [groups])

  return useCallback(
    (item: Item) => {
      const originId =
        (hasItemGroups(connector) ? connector.getItemGroupId(item.id) : null) ?? activeGroupId
      if (!originId) return getSpacePrimaryColor(item.id, null)
      return groupColorById.get(originId) ?? getSpacePrimaryColor(originId, null)
    },
    [connector, groupColorById, activeGroupId],
  )
}

/**
 * Returns a resolver `(item) => Group | undefined` for the group an item was
 * created in (its origin group), via the connector's `ItemGroupCapable`. Used to
 * show an item's origin group (e.g. {@link ItemGroupBadge}) in aggregate views.
 */
export function useItemGroupResolver(): (item: Item) => Group | undefined {
  const connector = useConnector()
  const { data: groups } = useGroups()

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])

  return useCallback(
    (item: Item) => {
      const originId = hasItemGroups(connector) ? connector.getItemGroupId(item.id) : null
      return originId ? groupById.get(originId) : undefined
    },
    [connector, groupById],
  )
}

/**
 * Returns a resolver `(item) => boolean` telling whether an item is private — it
 * lives in the user's personal space (its group equals the personal-space id),
 * i.e. shared with nobody. Used to mark such items with an
 * {@link ItemPrivateBadge} in previews and detail views. Always `false` for
 * connectors without a personal space (Mock/Local).
 */
export function useItemPrivacyResolver(): (item: Item) => boolean {
  const connector = useConnector()
  const personalGroupId = usePersonalGroupId()

  return useCallback(
    (item: Item) => {
      if (!personalGroupId) return false
      const groupId = hasItemGroups(connector) ? connector.getItemGroupId(item.id) : null
      return groupId === personalGroupId
    },
    [connector, personalGroupId],
  )
}
