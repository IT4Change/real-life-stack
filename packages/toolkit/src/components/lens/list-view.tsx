import type { Item } from "@real-life-stack/data-interface"

import { ItemPreview } from "../preview/item-preview"

export interface ListViewProps {
  items: readonly Item[]
  onItemClick?: (item: Item) => void
}

/** The shared lens rule: relation records describe connections, not cards. */
export function lensItems(items: readonly Item[]): Item[] {
  return items.filter(({ type }) => type !== "relation")
}

/**
 * A read-only, type-agnostic projection of every domain item.
 * Filtering belongs to the calling shell; this component deliberately has no
 * filter controls of its own.
 */
export function ListView({ items, onItemClick }: ListViewProps) {
  const visibleItems = lensItems(items)

  if (visibleItems.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Einträge vorhanden.</p>
  }

  return (
    <section aria-label="Listenansicht" className="space-y-2">
      {visibleItems.map((item) => (
        <ItemPreview
          key={item.id}
          item={item}
          author={null}
          density="compact"
          onClick={onItemClick ? () => onItemClick(item) : undefined}
        />
      ))}
    </section>
  )
}
