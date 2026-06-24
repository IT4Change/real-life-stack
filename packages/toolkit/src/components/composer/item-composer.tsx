"use client"

import { useCallback, useEffect } from "react"
import type { Item } from "@real-life-stack/data-interface"
import {
  ContentComposer,
  type ContentComposerProps,
  type ContentComposerSubmitData,
  type ContentTypeConfig,
  type WidgetData,
} from "./content-composer"
import { useItemEditor, type ItemEditorMapper } from "../../hooks/use-item-editor"
import { useCurrentUser } from "../../hooks/use-auth"
import { useSetDraftItem, DRAFT_ITEM_ID } from "../../hooks/use-draft-item"
import { useSetUnsavedDirty } from "../../hooks/use-unsaved-changes"

export interface ItemComposerProps {
  /** Types offered. Create: a module's subset; edit: locked to the item's type. */
  contentTypes: ContentTypeConfig[]
  /** Initially selected type (create: the chosen type; edit: the item's type). */
  initialContentType?: string
  /** Pre-filled widget data. */
  initialData?: Partial<WidgetData>
  /** Present → edit mode (merges onto this item); absent → create a new item. */
  existingItem?: Item
  /** Composer submission → item payload. */
  mapper: ItemEditorMapper
  /** Runtime wiring (geocoder, map-pick, people options) — shared with create/edit. */
  composerProps?: Partial<ContentComposerProps>
  className?: string
  /** Imperative handle, e.g. to patch the open form's date without remounting. */
  apiRef?: ContentComposerProps["apiRef"]
  /** After a successful create/update — receives the saved item. */
  onDone: (item: Item) => void
  /** Cancel without saving. */
  onCancel: () => void
}

/**
 * The shared item form: the {@link ContentComposer} plus its editor and submit
 * handling, used by BOTH create (no `existingItem`) and edit (with one). So
 * create and edit render the *same* form — only the surrounding host
 * (surface/URL/lifecycle) and the `onDone` action differ. Field/widget config
 * comes from the shared type registry; the per-scope runtime wiring from
 * `composerProps`.
 */
export function ItemComposer({
  contentTypes,
  initialContentType,
  initialData,
  existingItem,
  mapper,
  composerProps,
  className,
  apiRef,
  onDone,
  onCancel,
}: ItemComposerProps) {
  const { data: currentUser } = useCurrentUser()
  const editor = useItemEditor({ currentUserId: currentUser?.id, mapSubmission: mapper })

  // Live preview: publish the in-progress item as a draft (via the same mapper
  // used for saving) so modules show it before it's saved. Cleared on unmount
  // (save/cancel/navigate-away all unmount the composer).
  const setDraft = useSetDraftItem()
  const currentUserId = currentUser?.id
  const publishDraft = useCallback(
    (submission: ContentComposerSubmitData) => {
      const payload = mapper(submission, {
        mode: existingItem ? "edit" : "create",
        existingItem: existingItem ?? null,
      })
      if (!payload) return // mapper aborted (validation) → keep last preview
      const tags = payload.tags ?? existingItem?.tags
      const relations = payload.relations ?? existingItem?.relations
      setDraft({
        id: existingItem?.id ?? DRAFT_ITEM_ID,
        type: payload.type,
        createdAt: existingItem?.createdAt ?? new Date().toISOString(),
        createdBy: payload.createdBy ?? existingItem?.createdBy ?? currentUserId ?? "anonymous",
        data: payload.data,
        ...(tags ? { tags } : {}),
        ...(relations ? { relations } : {}),
      })
    },
    [mapper, existingItem, currentUserId, setDraft],
  )
  useEffect(() => () => setDraft(null), [setDraft])

  // Unsaved-changes guard: publish the composer's dirty state so the app can warn
  // before discarding it. Cleared on unmount so a closed composer never leaves a
  // stale "dirty" behind.
  const setUnsavedDirty = useSetUnsavedDirty()
  useEffect(() => () => setUnsavedDirty(false), [setUnsavedDirty])

  return (
    <ContentComposer
      apiRef={apiRef}
      className={className}
      contentTypes={contentTypes}
      initialContentType={initialContentType}
      initialData={initialData}
      editMode={!!existingItem}
      showPreview={false}
      {...composerProps}
      onChange={publishDraft}
      onDirtyChange={setUnsavedDirty}
      onSubmit={async (data) => {
        const saved = await editor.submit(data, existingItem ? { existingItem } : undefined)
        if (saved) {
          // Clear synchronously BEFORE onDone navigates, so the nav guard doesn't
          // block the very navigation the save triggers.
          setUnsavedDirty(false)
          onDone(saved)
        }
        // submit() swallows connector errors into editor.error and returns null;
        // surface it so the composer shows its inline error instead of looking
        // like a silent success.
        else throw new Error("Speichern fehlgeschlagen. Bitte erneut versuchen.")
      }}
      onCancel={onCancel}
    />
  )
}
