import type { Item, Relation } from "@real-life-stack/data-interface"
import { builder } from "../builder.js"

export const RelationType = builder.objectRef<Relation>("Relation").implement({
  fields: (t) => ({
    predicate: t.exposeString("predicate"),
    target: t.exposeString("target"),
    meta: t.field({
      type: "JSON",
      nullable: true,
      resolve: (relation) => relation.meta ?? null,
    }),
  }),
})

export const ItemType = builder.objectRef<Item>("Item").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    type: t.exposeString("type"),
    createdAt: t.field({
      type: "DateTime",
      resolve: (item) => item.createdAt,
    }),
    createdBy: t.exposeString("createdBy"),
    // Gesetzt vom Server beim Update (siehe store.updateItem) — nie vom
    // Client geliefert, sonst koennte er einen fremden Bearbeiter eintragen.
    updatedAt: t.exposeString("updatedAt", { nullable: true }),
    updatedBy: t.exposeString("updatedBy", { nullable: true }),
    // GraphQL field names cannot start with "@" — `context` carries the
    // item's `@context` vocabulary list (spec 06 schema activation).
    context: t.stringList({
      nullable: true,
      resolve: (item) => item["@context"] ?? null,
    }),
    tags: t.stringList({
      nullable: true,
      resolve: (item) => item.tags ?? null,
    }),
    schema: t.exposeString("schema", { nullable: true }),
    schemaVersion: t.exposeInt("schemaVersion", { nullable: true }),
    data: t.field({
      type: "JSON",
      resolve: (item) => item.data,
    }),
    relations: t.field({
      type: [RelationType],
      nullable: true,
      resolve: (item) => item.relations ?? null,
    }),
    _source: t.exposeString("_source", { nullable: true }),
    _included: t.boolean({
      nullable: true,
      resolve: (item) => (item as Item & { _included?: boolean })._included ?? null,
    }),
  }),
})

// --- Input Types ---

export const ItemFilterInputType = builder.inputType("ItemFilterInput", {
  fields: (t) => ({
    type: t.string(),
    hasField: t.stringList(),
    /** Spec 06: every listed @context vocabulary must be active on the item. */
    hasSchema: t.stringList(),
    /** AND semantics: every listed tag must be present (spec 07). */
    hasTag: t.stringList(),
    createdBy: t.string(),
    /** Viewport bounding box [west, south, east, north] (spec: map module). */
    bbox: t.floatList(),
    limit: t.int(),
    offset: t.int(),
  }),
})

export const RelationInputType = builder.inputType("RelationInput", {
  fields: (t) => ({
    predicate: t.string({ required: true }),
    target: t.string({ required: true }),
    meta: t.field({ type: "JSON" }),
  }),
})

export const ItemInputType = builder.inputType("ItemInput", {
  fields: (t) => ({
    id: t.id(),
    type: t.string({ required: true }),
    createdBy: t.string({ required: true }),
    /** The item's @context vocabulary list (spec 06). */
    context: t.stringList(),
    tags: t.stringList(),
    data: t.field({ type: "JSON", required: true }),
    relations: t.field({ type: [RelationInputType] }),
  }),
})

export const ItemUpdateInputType = builder.inputType("ItemUpdateInput", {
  fields: (t) => ({
    context: t.stringList(),
    tags: t.stringList(),
    data: t.field({ type: "JSON" }),
    relations: t.field({ type: [RelationInputType] }),
  }),
})
