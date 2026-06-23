"use client"

import { type ReactNode, useState } from "react"
import type { Item } from "@real-life-stack/data-interface"
import { ItemDetailPanel } from "./item-detail-panel"
import { ItemDetailActions } from "./item-detail-actions"
import { ItemPreviewSkeleton } from "../preview"
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
  /** The item to show. The view subscribes via `useItem`, so it always renders
   *  the live item and reflects edits / external updates; a loading skeleton
   *  shows until it resolves. Key this component on `itemId` upstream so a
   *  different item starts fresh in read mode. */
  itemId: string
  /** Read-view body. Receives the live item plus the action menu (⋮ +
   *  „Bearbeiten") to embed in the card header (ItemPreview `actions` slot). */
  renderRead: (item: Item, actions: ReactNode) => ReactNode
  /** Composer config for editing (widget types + labels). Pass only the item's
   *  own type to avoid a type switcher. */
  contentTypes: ContentTypeConfig[]
  /** Edit-aware mapper (composer submission → item payload; uses `existingItem`). */
  mapper: ItemEditorMapper
  /** Pre-fill the composer from the (live) item. */
  editInitialData: (item: Item) => Partial<WidgetData>
  /** Extra ContentComposer props per module (people/tag suggestions, geocode,
   *  map-pick, liveUpdate, …). Core props (types/initialData/editMode/submit/
   *  cancel) stay owned here. */
  composerProps?: Partial<ContentComposerProps>
  /** Passthrough to ItemDetailPanel (reaction bars on comments). */
  renderCommentReactions?: (commentId: string) => ReactNode
  /** Close the panel — after a delete, or to clear the URL focus. */
  onClose: () => void
  /** Share/copy a link to the item. */
  onShare?: () => void
}

/**
 * Shared item-detail body: a read view and an inline edit composer in the SAME
 * panel (read↔edit toggle), plus the permission-gated action menu (⋮ +
 * „Bearbeiten"). Owns its own `useItemEditor`, so a caller passes only
 * declarative config. Rendered by the app-level detail host above the outlet
 * (so it persists across module switches); the caller keys it on `itemId`.
 */
export function ItemDetailView({
  itemId,
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
  const { data: item } = useItem(itemId)
  const editor = useItemEditor({ currentUserId: currentUser?.id, mapSubmission: mapper })
  const [mode, setMode] = useState<"read" | "edit">("read")

  if (!item) {
    return (
      <ItemDetailPanel itemId={itemId} renderCommentReactions={renderCommentReactions}>
        <div className="p-4">
          <ItemPreviewSkeleton />
        </div>
      </ItemDetailPanel>
    )
  }

  // Lock the edit composer to the item's own type (no type switcher in phase 1):
  // narrow the caller's full type list to the matching one. NO fallback to the
  // full list — for an item whose type the module doesn't configure, editing is
  // simply not offered (a fallback would show a wrong type switcher / form).
  const composerTypes = contentTypes.filter((t) => t.id === item.type)
  const canEdit = composerTypes.length > 0

  const title = typeof item.data.title === "string" ? item.data.title : undefined
  const actions = (
    <ItemDetailActions
      item={item}
      title={title}
      onEdit={canEdit ? () => setMode("edit") : undefined}
      onDeleted={onClose}
      onShare={onShare}
    />
  )

  return (
    <ItemDetailPanel itemId={item.id} renderCommentReactions={renderCommentReactions}>
      {mode === "read" ? (
        <div className="p-4">{renderRead(item, actions)}</div>
      ) : (
        <ContentComposer
          key={item.id}
          className="p-4"
          showPreview={false}
          {...composerProps}
          contentTypes={composerTypes}
          initialContentType={item.type}
          initialData={editInitialData(item)}
          editMode
          onSubmit={async (data) => {
            const updated = await editor.submit(data, { existingItem: item })
            if (updated) setMode("read")
          }}
          onCancel={() => setMode("read")}
        />
      )}
    </ItemDetailPanel>
  )
}
