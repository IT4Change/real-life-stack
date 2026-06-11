import { useMemo } from "react"
import type { Item, User } from "@real-life-stack/data-interface"

/**
 * Resolves the author (`createdBy`) of an item against a preloaded
 * user list. Returns `undefined` if the item has no `createdBy` or the
 * user isn't in the list.
 *
 * Why a preloaded list and not a connector lookup: most views already
 * have the user list (for assignee resolution, mentions, etc.). Passing
 * it in keeps this hook synchronous and avoids N redundant reads when a
 * page renders many items. Future option: a connector-aware
 * `useItemAuthorAsync` that fetches on demand.
 */
export function useItemAuthor(
  item: Item | null | undefined,
  users: readonly User[] | undefined,
): User | undefined {
  return useMemo(() => {
    if (!item?.createdBy || !users) return undefined
    return users.find((u) => u.id === item.createdBy)
  }, [item?.createdBy, users])
}
