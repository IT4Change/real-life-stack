import { useCallback, useMemo } from "react"
import { hasItemGroups, type Item } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"
import { useGroups } from "./use-groups"
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
