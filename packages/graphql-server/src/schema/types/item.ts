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
    // GraphQL field names cannot start with "@" — `context` carries the
    // item's `@context` vocabulary list (spec 06 schema activation).
    context: t.stringList({
      nullable: true,
      resolve: (item) => item["@context"] ?? null,
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
  }),
})

// --- Input Types ---

export const ItemFilterInputType = builder.inputType("ItemFilterInput", {
  fields: (t) => ({
    type: t.string(),
    hasField: t.stringList(),
    /** Spec 06: every listed @context vocabulary must be active on the item. */
    hasSchema: t.stringList(),
    createdBy: t.string(),
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
    data: t.field({ type: "JSON", required: true }),
    relations: t.field({ type: [RelationInputType] }),
  }),
})

export const ItemUpdateInputType = builder.inputType("ItemUpdateInput", {
  fields: (t) => ({
    context: t.stringList(),
    data: t.field({ type: "JSON" }),
    relations: t.field({ type: [RelationInputType] }),
  }),
})
