import type { Item } from "@real-life-stack/data-interface"

import { getItemPreviewAdornments, ItemPreview } from "../preview"
import { lensItems } from "./list-view"

export interface GridViewProps {
  items: readonly Item[]
  onItemClick?: (item: Item) => void
}

/** A read-only grid composed from comfortable ItemPreview cards. */
export function GridView({ items, onItemClick }: GridViewProps) {
  const visibleItems = lensItems(items)

  if (visibleItems.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Einträge vorhanden.</p>
  }

  return (
    <section aria-label="Rasteransicht" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {visibleItems.map((item) => {
        const adornments = getItemPreviewAdornments(item)
        return (
          <ItemPreview
            key={item.id}
            item={item}
            author={null}
            density="comfortable"
            {...adornments}
            onClick={onItemClick ? () => onItemClick(item) : undefined}
          />
        )
      })}
    </section>
  )
}
