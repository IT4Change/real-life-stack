"use client"

import { type ReactNode, useState } from "react"
import type { Item } from "@real-life-stack/data-interface"
import { ItemDetailPanel } from "./item-detail-panel"
import { ItemDetailActions } from "./item-detail-actions"
import {
  ContentComposer,
  type ContentComposerProps,
  type ContentTypeConfig,
  type WidgetData,
} from "../composer/content-composer"
import { useItemEditor, type ItemEditorMapper } from "../../hooks/use-item-editor"
import { useCurrentUser } from "../../hooks/use-auth"
import { useItem } from "../../hooks/use-items"

export interface ItemDetailViewProps {
  item: Item
  /** Read-view body. Receives the **current** (live) item — the host subscribes
   *  via `useItem`, so the read view reflects edits / external updates — plus the
   *  action menu (⋮ + „Bearbeiten") to embed in the card header (ItemPreview
   *  `actions` slot). */
  renderRead: (item: Item, actions: ReactNode) => ReactNode
  /** Composer config for editing (widget types + labels). Pass only the item's
   *  own type to avoid a type switcher. */
  contentTypes: ContentTypeConfig[]
  /** Edit-aware mapper (composer submission → item payload; uses `existingItem`). */
  mapper: ItemEditorMapper
  /** Pre-fill the composer from the (current) item. */
  editInitialData: (item: Item) => Partial<WidgetData>
  /** Extra ContentComposer props per module (people/tag suggestions, geocode,
   *  map-pick, liveUpdate, …). Core props (types/initialData/editMode/submit/
   *  cancel) stay owned by the host. */
  composerProps?: Partial<ContentComposerProps>
  /** Passthrough to ItemDetailPanel (reaction bars on comments). */
  renderCommentReactions?: (commentId: string) => ReactNode
  /** Close the panel — after a delete, or to clear the URL focus. */
  onClose: () => void
  /** Share/copy a link to the item. */
  onShare?: () => void
}

/**
 * Shared item-detail host: a read view and an inline edit composer in the SAME
 * panel (read↔edit toggle), plus the permission-gated action menu (⋮ +
 * „Bearbeiten"). Owns its own `useItemEditor`, so a calling view passes only
 * declarative config — no editor wiring, and no hook-ordering pitfalls in the
 * view (the editor lives here, not in the view's `openDetail`).
 */
export function ItemDetailView({
  item,
  renderRead,
  contentTypes,
  mapper,
  editInitialData,
  composerProps,
  renderCommentReactions,
  onClose,
  onShare,
}: ItemDetailViewProps) {
  const { data: currentUser } = useCurrentUser()
  // Subscribe to the live item so the read view reflects the just-saved edit (and
  // any external update); fall back to the opened item while it (re)loads.
  const { data: liveItem } = useItem(item.id)
  const current = liveItem ?? item
  const editor = useItemEditor({ currentUserId: currentUser?.id, mapSubmission: mapper })
  const [mode, setMode] = useState<"read" | "edit">("read")

  const title = typeof current.data.title === "string" ? current.data.title : undefined
  const actions = (
    <ItemDetailActions
      item={current}
      title={title}
      onEdit={() => setMode("edit")}
      onDeleted={onClose}
      onShare={onShare}
    />
  )

  return (
    <ItemDetailPanel itemId={current.id} renderCommentReactions={renderCommentReactions}>
      {mode === "read" ? (
        <div className="p-4">{renderRead(current, actions)}</div>
      ) : (
        <ContentComposer
          key={current.id}
          className="p-4"
          showPreview={false}
          {...composerProps}
          contentTypes={contentTypes}
          initialContentType={current.type}
          initialData={editInitialData(current)}
          editMode
          onSubmit={async (data) => {
            const updated = await editor.submit(data, { existingItem: current })
            if (updated) setMode("read")
          }}
          onCancel={() => setMode("read")}
        />
      )}
    </ItemDetailPanel>
  )
}
