import { useCallback, useState } from "react"
import type { Item, Relation } from "@real-life-stack/data-interface"
import { deriveContext } from "@real-life-stack/data-interface"
import { useCreateItem, useUpdateItem, useDeleteItem } from "./use-mutations"
import type { ContentComposerSubmitData } from "../components/composer/content-composer"

/**
 * The shape a caller-supplied mapper returns. The hook handles the
 * `@context` derivation and createdBy fallback so the mapper can focus
 * on field-mapping (title/content/description, etc.).
 */
export interface ItemEditorPayload {
  type: string
  createdBy?: string
  data: Record<string, unknown>
  tags?: string[]
  relations?: Relation[]
  /**
   * Optional override. When omitted the hook calls
   * `deriveContext(type, data)`. Pass an explicit list only when a
   * vocabulary outside the activation heuristic is needed.
   */
  "@context"?: string[]
}

/**
 * Maps a composer submission to a payload the connector can persist.
 *
 * - `mode === "create"`: hook will call `createItem` with the payload.
 * - `mode === "edit"`: hook will call `updateItem(existingItem.id, ...)`.
 *
 * Return `null` to abort the submission (validation failure, etc.) —
 * the hook will surface no error and leave the editor open.
 */
export type ItemEditorMapper = (
  submission: ContentComposerSubmitData,
  ctx: { mode: "create" | "edit"; existingItem: Item | null },
) => ItemEditorPayload | null

export interface UseItemEditorOptions {
  /** Identifier of the current user; written to createdBy on new items. */
  currentUserId: string | undefined
  /** Caller-supplied field mapping (see ItemEditorMapper). */
  mapSubmission: ItemEditorMapper
  /** Optional side-effect after a successful create. */
  onCreated?: (item: Item) => void | Promise<void>
  /** Optional side-effect after a successful update. */
  onUpdated?: (item: Item) => void | Promise<void>
  /** Optional side-effect after a successful delete. */
  onDeleted?: (itemId: string) => void | Promise<void>
}

export interface UseItemEditorResult {
  /** Whether the editor surface (modal/drawer/panel) should be visible. */
  isOpen: boolean
  /** "create" when opening fresh; "edit" when editing an existing item. */
  mode: "create" | "edit"
  /** The item being edited; null when in create mode. */
  currentItem: Item | null
  /** Latest submission/delete error, cleared on next attempt. */
  error: Error | null
  /** True while a submit/remove call is in flight. */
  isSubmitting: boolean

  /** Open the editor in create mode. */
  openCreate(): void
  /** Open the editor in edit mode for the given item. */
  openEdit(item: Item): void
  /** Close the editor without persisting. */
  close(): void

  /**
   * Persist the composer's submission. Resolves with the resulting Item
   * on success, or `null` when the mapper aborted or an error was caught.
   *
   * `options.existingItem`: edit that item instead of whatever is in the
   * hook's `currentItem` state. Views that manage their own
   * open-target state (e.g. Kanban's `panelState`) can pass the item
   * inline without round-tripping through `openEdit`.
   */
  submit(
    submission: ContentComposerSubmitData,
    options?: { existingItem?: Item },
  ): Promise<Item | null>

  /**
   * Delete an item. Without an id, falls back to the hook's
   * `currentItem`. Returns silently when there is nothing to delete.
   */
  remove(itemId?: string): Promise<void>
}

/**
 * Centralises the boilerplate every Space Module otherwise duplicates:
 * open/close state for the composer modal, mode tracking, deriveContext
 * call, createItem/updateItem dispatch, and error handling.
 *
 * Spec: docs/spec/06-schema-composition.md (deriveContext is the source
 * of truth for `@context` on created/updated items). Field-mapping —
 * which composer widget maps to which item field — stays in the caller
 * because every module makes that decision differently (Feed maps text
 * to `content` for posts and `description` otherwise; Kanban maps text
 * to `description` always; Calendar will likely map differently again).
 *
 * Optimistic updates are intentionally NOT implemented here; the hook
 * is fire-and-await. When we adopt server connectors with perceivable
 * latency, an `optimistic: true` mode can be added without API breaks.
 */
export function useItemEditor(options: UseItemEditorOptions): UseItemEditorResult {
  const { currentUserId, mapSubmission, onCreated, onUpdated, onDeleted } = options
  const { mutate: createItem } = useCreateItem()
  const { mutate: updateItem } = useUpdateItem()
  const { mutate: deleteItem } = useDeleteItem()

  const [isOpen, setIsOpen] = useState(false)
  const [currentItem, setCurrentItem] = useState<Item | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const mode: "create" | "edit" = currentItem ? "edit" : "create"

  const openCreate = useCallback(() => {
    setCurrentItem(null)
    setError(null)
    setIsOpen(true)
  }, [])

  const openEdit = useCallback((item: Item) => {
    setCurrentItem(item)
    setError(null)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setError(null)
  }, [])

  const submit = useCallback(
    async (
      submission: ContentComposerSubmitData,
      submitOptions?: { existingItem?: Item },
    ): Promise<Item | null> => {
      const existingItem = submitOptions?.existingItem ?? currentItem
      const activeMode: "create" | "edit" = existingItem ? "edit" : "create"
      const mapped = mapSubmission(submission, { mode: activeMode, existingItem })
      if (mapped === null) return null

      setIsSubmitting(true)
      setError(null)
      try {
        const ctx =
          mapped["@context"] ?? deriveContext(mapped.type, mapped.data)

        if (activeMode === "create") {
          const payload: Omit<Item, "id" | "createdAt"> = {
            type: mapped.type,
            createdBy: mapped.createdBy ?? currentUserId ?? "anonymous",
            "@context": ctx,
            data: mapped.data,
            ...(mapped.tags && mapped.tags.length > 0 ? { tags: mapped.tags } : {}),
            ...(mapped.relations ? { relations: mapped.relations } : {}),
          }
          const created = await createItem(payload)
          await onCreated?.(created)
          return created
        }

        // edit
        const update: Partial<Item> = {
          data: mapped.data,
          "@context": ctx,
          ...(mapped.tags !== undefined ? { tags: mapped.tags } : {}),
          ...(mapped.relations !== undefined ? { relations: mapped.relations } : {}),
        }
        const updated = await updateItem(existingItem!.id, update)
        if (currentItem && currentItem.id === existingItem!.id) {
          setCurrentItem(updated)
        }
        await onUpdated?.(updated)
        return updated
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err))
        setError(wrapped)
        return null
      } finally {
        setIsSubmitting(false)
      }
    },
    [currentItem, mapSubmission, currentUserId, createItem, updateItem, onCreated, onUpdated],
  )

  const remove = useCallback(async (itemId?: string) => {
    const id = itemId ?? currentItem?.id
    if (!id) return
    setIsSubmitting(true)
    setError(null)
    try {
      await deleteItem(id)
      await onDeleted?.(id)
      if (currentItem && currentItem.id === id) {
        setIsOpen(false)
        setCurrentItem(null)
      }
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err))
      setError(wrapped)
    } finally {
      setIsSubmitting(false)
    }
  }, [currentItem, deleteItem, onDeleted])

  return {
    isOpen,
    mode,
    currentItem,
    error,
    isSubmitting,
    openCreate,
    openEdit,
    close,
    submit,
    remove,
  }
}
