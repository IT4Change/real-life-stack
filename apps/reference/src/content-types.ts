import { defaultColumns, type ContentTypeConfig } from "@real-life-stack/toolkit"

/**
 * The app's content types in one place — the shared registry both create and
 * edit draw from, so a type's fields are defined once and the detail edit can be
 * type-driven (any item editable with *its* fields, in any module). Fields follow
 * the spec field-vocabulary; `peopleRelation` declares how a type links people
 * (task → assignedTo, event → invited) for the shared submission mapper.
 *
 * Today this is a static list. It is shaped as data (+ {@link resolveContentType})
 * so it can later be sourced per space from the connector (user-definable types,
 * Scheibe 3) without touching the consuming views.
 */
export const ALL_CONTENT_TYPES: ContentTypeConfig[] = [
  {
    id: "post",
    label: "Post",
    defaultWidgets: ["text"],
    submitLabel: "Posten",
  },
  {
    id: "event",
    label: "Veranstaltung",
    defaultWidgets: ["title", "text", "date", "location"],
    submitLabel: "Erstellen",
    // Declared ahead of enabling the widget: when events get a people widget,
    // attendees link via `invited` (not `assignedTo`). No "people" in
    // defaultWidgets yet → inactive for now.
    peopleRelation: { predicate: "invited" },
  },
  {
    id: "place",
    label: "Ort",
    defaultWidgets: ["title", "text", "location"],
    submitLabel: "Erstellen",
  },
  {
    id: "statement",
    label: "Aussage",
    defaultWidgets: ["title", "text", "tags"],
    widgetLabels: { title: "Aussage", text: "Kontext" },
    submitLabel: "Einbringen",
  },
  {
    id: "task",
    label: "Task",
    defaultWidgets: ["title", "text", "status", "people", "tags"],
    widgetLabels: { text: "Beschreibung", people: "Zugewiesen" },
    statusOptions: defaultColumns.map((col) => ({ id: col.id, label: col.label })),
    defaultStatus: "open",
    groupRequired: true,
    peopleRelation: { predicate: "assignedTo" },
  },
]

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
