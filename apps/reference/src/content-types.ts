import { defaultColumns, resolveTypePresentation, type ContentTypeConfig } from "@real-life-stack/toolkit"
import { relationAffordanceKey } from "@real-life-stack/data-interface"

import { TYPE_MANIFEST } from "./type-register"

/**
 * The app's content types, COMPOSED from the type register (spec 06): label
 * and widget set come from the Darstellungs-Register, `peopleRelation` derives
 * from the manifest's relation affordances plus the entry's `relationWidgets`.
 * Only genuinely app-specific fields (submit labels, widget captions, kanban
 * columns, group requirements) are declared here.
 *
 * Adding a type therefore means: one manifest entry + one presentation entry
 * (see type-register.tsx) — and, only if needed, an APP_EXTRAS line.
 */
const APP_EXTRAS: Record<string, Partial<ContentTypeConfig>> = {
  post: { submitLabel: "Posten" },
  event: { submitLabel: "Erstellen" },
  place: { submitLabel: "Erstellen" },
  statement: {
    widgetLabels: { title: "Aussage", text: "Kontext" },
    submitLabel: "Einbringen",
  },
  task: {
    widgetLabels: { text: "Beschreibung", people: "Zugewiesen" },
    statusOptions: defaultColumns.map((col) => ({ id: col.id, label: col.label })),
    defaultStatus: "open",
    groupRequired: true,
  },
}

/** Which types the composer offers, in menu order. Every id must exist in the
 *  manifest — resolution throws otherwise, which is the point. */
const COMPOSER_TYPE_IDS = ["post", "event", "place", "statement", "task"] as const

function contentTypeFromRegister(id: string): ContentTypeConfig {
  if (!TYPE_MANIFEST.has(id)) {
    throw new Error(`content-types: "${id}" hat keinen Manifest-Eintrag (Spec 06).`)
  }
  const presentation = resolveTypePresentation(id)
  // peopleRelation = the manifest edge whose composer widget is "people".
  const peopleEdge = (TYPE_MANIFEST.get(id)?.relations ?? []).find(
    (rel) => presentation.relationWidgets?.[relationAffordanceKey(rel)] === "people",
  )
  return {
    id,
    label: presentation.label,
    defaultWidgets: [...(presentation.composerWidgets ?? ["title", "text"])],
    ...(peopleEdge ? { peopleRelation: { predicate: peopleEdge.predicate } } : {}),
    ...APP_EXTRAS[id],
  }
}

export const ALL_CONTENT_TYPES: ContentTypeConfig[] = COMPOSER_TYPE_IDS.map(contentTypeFromRegister)

/** Look up a content type by id (e.g. an item's `type`). */
export function resolveContentType(id: string): ContentTypeConfig | undefined {
  return ALL_CONTENT_TYPES.find((t) => t.id === id)
}

/** Pick a subset by id, preserving registry order — used for per-module create menus. */
export function pickContentTypes(...ids: string[]): ContentTypeConfig[] {
  return ALL_CONTENT_TYPES.filter((t) => ids.includes(t.id))
}

/** Per-module create menus (which types each module's "+" offers). Edit always
 *  uses the full registry, locked to the item's own type. */
export const FEED_CREATE_TYPES = pickContentTypes("post", "event")
export const CALENDAR_CREATE_TYPES = pickContentTypes("event")
export const MAP_CREATE_TYPES = pickContentTypes("place", "event")
export const KANBAN_CREATE_TYPES = pickContentTypes("task")
export const RESONANCE_CREATE_TYPES = pickContentTypes("statement")
