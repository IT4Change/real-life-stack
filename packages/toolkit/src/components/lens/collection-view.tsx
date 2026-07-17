import { useState } from "react"
import { Grid2X2, List } from "lucide-react"
import type { Item } from "@real-life-stack/data-interface"

import type { SelectionFocusVisibleArea } from "../../lib/selection-focus"
import { Button } from "../primitives/button"
import { GridView } from "./grid-view"
import { ListView } from "./list-view"

export type CollectionLayout = "list" | "grid"

/** A density change is a new projection pass for the same selected item. */
export function collectionFocusGateKey(layout: CollectionLayout, activeItemId?: string): string | undefined {
  return activeItemId ? `${layout}:${activeItemId}` : undefined
}

export interface CollectionViewProps {
  items: readonly Item[]
  activeItemId?: string
  onItemClick?: (item: Item) => void
  defaultLayout?: CollectionLayout
  /** Shell-owned obstruction below the scrollable lens, e.g. a mobile drawer. */
  selectionFocusVisibleArea?: SelectionFocusVisibleArea
}

/**
 * List and grid are densities of the same collection projection. The keyed
 * composition intentionally remounts the selected density, re-arming its
 * one-time active-item focus gate after a layout change.
 */
export function CollectionView({
  items,
  activeItemId,
  onItemClick,
  defaultLayout = "list",
  selectionFocusVisibleArea,
}: CollectionViewProps) {
  const [layout, setLayout] = useState<CollectionLayout>(defaultLayout)
  const nextLayout = layout === "list" ? "grid" : "list"
  const LayoutIcon = nextLayout === "grid" ? Grid2X2 : List

  return (
    <section aria-label="Sammlungsansicht" className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${nextLayout === "grid" ? "Raster" : "Listen"}ansicht wählen`}
          aria-pressed={layout === "grid"}
          onClick={() => setLayout(nextLayout)}
        >
          <LayoutIcon className="size-4" />
          <span className="sr-only">{nextLayout === "grid" ? "Rasteransicht" : "Listenansicht"}</span>
        </Button>
      </div>
      {layout === "list" ? (
        <ListView
          key={layout}
          items={items}
          activeItemId={activeItemId}
          selectionFocusVisibleArea={selectionFocusVisibleArea}
          selectionFocusGateKey={layout}
          onItemClick={onItemClick}
        />
      ) : (
        <GridView
          key={layout}
          items={items}
          activeItemId={activeItemId}
          selectionFocusVisibleArea={selectionFocusVisibleArea}
          selectionFocusGateKey={layout}
          onItemClick={onItemClick}
        />
      )}
    </section>
  )
}
