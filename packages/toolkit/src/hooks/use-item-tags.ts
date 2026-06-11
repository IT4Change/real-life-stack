import { useMemo } from "react"
import type { Item } from "@real-life-stack/data-interface"

const EMPTY_TAGS: readonly string[] = Object.freeze([])

/**
 * Returns the normalized top-level tag list of an item.
 *
 * Spec: docs/spec/07-tags.md. Tags live on `item.tags` (top-level).
 * This hook hides the optional/`undefined` shape so callers can render
 * `tags.map(...)` without guards.
 *
 * Returns the same array identity across renders when the underlying
 * tag list hasn't changed, so memoized children stay stable.
 */
export function useItemTags(item: Item | null | undefined): readonly string[] {
  return useMemo(() => item?.tags ?? EMPTY_TAGS, [item?.tags])
}
