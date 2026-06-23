import type { Item } from "@real-life-stack/data-interface"
import type { ItemEditorMapper, WidgetData } from "@real-life-stack/toolkit"

// The composer surfaces free text as `data.text`, but the spec stores it as
// `content` for posts (base/v1) and `description` for everything else (events,
// places, …). One rule, keyed by the item type — shared across all modules.
function textFieldFor(type: string): "content" | "description" {
  return type === "post" ? "content" : "description"
}

/**
 * Composer submission → item payload, shared by every module (Feed, Calendar,
 * Map). Strips empty composer defaults (status/title/… initialise to "" / [])
 * so e.g. a post doesn't ship `status: ""` — which would leak it onto the
 * Kanban board. Edit-aware: with an `existingItem` it merges onto the existing
 * data and keeps the item's type/tags, so a switch-free edit preserves the
 * fields the user didn't touch.
 */
export const mapComposerSubmission: ItemEditorMapper = (submission, { existingItem }) => {
  const { text, tags: submittedTags, ...rest } = submission.data
  const cleaned = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => {
      if (v === "" || v === null || v === undefined) return false
      if (Array.isArray(v) && v.length === 0) return false
      return true
    }),
  )
  const type = existingItem?.type ?? submission.contentType
  const itemData = {
    ...(existingItem?.data ?? {}),
    ...cleaned,
    ...(text ? { [textFieldFor(type)]: text } : {}),
  }
  const tags =
    Array.isArray(submittedTags) && submittedTags.length > 0 ? submittedTags : existingItem?.tags
  return { type, data: itemData, ...(tags ? { tags } : {}) }
}

/** Pre-fill the edit composer from an item's stored data (inverse of the mapper). */
export function itemToComposerData(item: Item): Partial<WidgetData> {
  const d = item.data as Record<string, unknown>
  const text = d[textFieldFor(item.type)]
  return {
    ...(typeof d.title === "string" ? { title: d.title } : {}),
    ...(typeof text === "string" ? { text } : {}),
    ...(typeof d.start === "string" ? { start: d.start } : {}),
    ...(typeof d.end === "string" ? { end: d.end } : {}),
    ...(typeof d.address === "string" ? { address: d.address } : {}),
    ...(typeof d.locationName === "string" ? { locationName: d.locationName } : {}),
    ...(d.position && typeof d.position === "object"
      ? { position: d.position as WidgetData["position"] }
      : {}),
    tags: item.tags ?? [],
  }
}
