"use client"

import type { Item } from "@real-life-stack/data-interface"
import { ItemGroupBadge } from "./item-group-badge"
import { ItemPrivateBadge } from "./item-private-badge"
import {
  useItemGroupResolver,
  useItemGroupColorResolver,
  useItemPrivacyResolver,
} from "../../hooks/use-item-group-color"

/**
 * `ItemScopeBadge` — shows an item's sharing scope as a single chip next to
 * `ItemTypeBadge`: „Privat" ({@link ItemPrivateBadge}) for an item in the
 * personal space, otherwise its origin group ({@link ItemGroupBadge}, name +
 * colour). Renders nothing when there's no scope to show (no group, no personal
 * space — e.g. Mock/Local).
 *
 * Self-contained (resolves scope from the connector via the group hooks) so any
 * detail header can drop it in and consistently surface where an item is shared
 * — the read-view counterpart to the group/private badges shown on list cards.
 */
export function ItemScopeBadge({ item }: { item: Item }) {
  const isPrivate = useItemPrivacyResolver()
  const resolveGroup = useItemGroupResolver()
  const resolveColor = useItemGroupColorResolver()

  if (isPrivate(item)) return <ItemPrivateBadge />
  const group = resolveGroup(item)
  if (!group) return null
  return <ItemGroupBadge name={group.name} color={resolveColor(item)} />
}
