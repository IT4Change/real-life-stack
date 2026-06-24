import type { Item, Relation } from "@real-life-stack/data-interface"
import type { ContentTypeConfig, ItemEditorMapper, WidgetData } from "@real-life-stack/toolkit"
import { resolveContentType } from "./content-types"

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
  // `group` is the item's group/space association, persisted via the connector
  // (moveItemToGroup in useItemEditor) — never written into item.data.
  // `people` becomes relations (below), not item.data. `tags` is top-level.
  const { text, tags: submittedTags, group: _group, people, ...rest } = submission.data
  const cleaned = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => {
      if (v === "" || v === null || v === undefined) return false
      if (Array.isArray(v) && v.length === 0) return false
      return true
    }),
  )
  const type = existingItem?.type ?? submission.contentType
  const typeConfig = resolveContentType(type)
  const itemData: Record<string, unknown> = {
    ...(existingItem?.data ?? {}),
    ...cleaned,
    ...(text ? { [textFieldFor(type)]: text } : {}),
  }
  // Tags live top-level (spec 07-tags.md); drop any legacy data.tags so a
  // migrated item doesn't keep a stale copy in its data.
  delete itemData.tags
  // Create default: a fresh status-bearing item (task) lands in its default
  // column if no status was picked. (Order is left unset → sorts to the top;
  // the board reassigns concrete order on the first drag.)
  if (!existingItem && typeConfig?.defaultStatus && !itemData.status) {
    itemData.status = typeConfig.defaultStatus
  }
  const tags =
    Array.isArray(submittedTags) && submittedTags.length > 0 ? submittedTags : existingItem?.tags

  // People → relations on the type's predicate (task→assignedTo, event→invited).
  // Only managed when the `people` field was part of the submission (widget
  // shown); relations with other predicates are preserved.
  const predicate = typeConfig?.peopleRelation?.predicate
  let relations: Relation[] | undefined
  if (predicate && Array.isArray(people)) {
    const others = (existingItem?.relations ?? []).filter((r) => r.predicate !== predicate)
    const assigned: Relation[] = people.map((id: string) => ({ predicate, target: `global:${id}` }))
    relations = [...others, ...assigned]
  } else {
    relations = existingItem?.relations
  }

  return {
    type,
    data: itemData,
    ...(tags ? { tags } : {}),
    ...(relations ? { relations } : {}),
  }
}

/**
 * Inject the group/sharing-scope widget into content types: the available groups
 * as options + the current space as default. The composer auto-shows the `group`
 * widget in edit mode when ≥2 options exist. The chosen group is persisted as the
 * item's group association by `useItemEditor` (not as item data). Shared across
 * modules so every item type gets the same sharing-scope picker.
 */
export function withGroupOptions(
  types: ContentTypeConfig[],
  groups: { id: string; name: string }[],
  currentGroupId?: string,
  personalGroupId?: string | null,
): ContentTypeConfig[] {
  // Options = the user's personal/private space („Privat", the „share with
  // nobody" target) + the shared groups. Only surface a picker when there's a
  // real choice (≥2 options): private vs. one group, or two groups. With a single
  // option the item just lands there (no widget — not shown, not toggleable).
  const options: { id: string; name: string }[] = []
  if (personalGroupId) options.push({ id: personalGroupId, name: "Privat" })
  options.push(...groups.map((g) => ({ id: g.id, name: g.name })))
  if (options.length < 2) return types

  // Default to the current space; in the personal/overview view (no concrete
  // space) default to „Privat" so a new item stays private unless shared.
  const defaultGroup =
    currentGroupId && options.some((o) => o.id === currentGroupId)
      ? currentGroupId
      : personalGroupId ?? undefined
  return types.map((t) => ({
    ...t,
    groupOptions: options,
    ...(defaultGroup ? { defaultGroup } : {}),
    // Add "group" to defaultWidgets so it shows at create time too (not only edit).
    ...(t.defaultWidgets.includes("group")
      ? {}
      : { defaultWidgets: [...t.defaultWidgets, "group"] }),
  }))
}

/** Pre-fill the edit composer from an item's stored data (inverse of the mapper). */
export function itemToComposerData(item: Item): Partial<WidgetData> {
  const d = item.data as Record<string, unknown>
  const text = d[textFieldFor(item.type)]
  // People come from the type's relation predicate (assignedTo / invited / …).
  const predicate = resolveContentType(item.type)?.peopleRelation?.predicate
  const people = predicate
    ? (item.relations ?? [])
        .filter((r) => r.predicate === predicate)
        .map((r) => r.target.replace(/^global:/, ""))
    : []
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
    ...(typeof d.status === "string" ? { status: d.status } : {}),
    ...(people.length > 0 ? { people } : {}),
    tags: item.tags ?? [],
  }
}
