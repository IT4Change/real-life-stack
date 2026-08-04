import { builder } from "./builder.js"
import type { Relation } from "@real-life-stack/data-interface"
import { ItemType, ItemInputType, ItemUpdateInputType } from "./types/item.js"
import { GroupType, GroupUpdateInputType } from "./types/group.js"
import { UserType } from "./types/user.js"
import * as store from "../store.js"

function castRelations(
  input: { predicate: string; target: string; meta?: unknown }[] | null | undefined,
): Relation[] | undefined {
  if (!input) return undefined
  return input.map((r) => ({
    predicate: r.predicate,
    target: r.target,
    meta: (r.meta as Record<string, unknown>) ?? undefined,
  }))
}

builder.mutationType({
  fields: (t) => ({
    createItem: t.field({
      type: ItemType,
      args: { input: t.arg({ type: ItemInputType, required: true }) },
      resolve: (_root, args) =>
        store.createItem({
          id: args.input.id == null ? undefined : String(args.input.id),
          type: args.input.type,
          createdBy: args.input.createdBy,
          ...(args.input.context ? { "@context": args.input.context } : {}),
          data: args.input.data as Record<string, unknown>,
          relations: castRelations(args.input.relations),
        }),
    }),

    updateItem: t.field({
      type: ItemType,
      args: {
        id: t.arg.id({ required: true }),
        input: t.arg({ type: ItemUpdateInputType, required: true }),
      },
      resolve: (_root, args) =>
        store.updateItem(String(args.id), {
          ...(args.input.context ? { "@context": args.input.context } : {}),
          data: (args.input.data as Record<string, unknown>) ?? undefined,
          relations: castRelations(args.input.relations),
        }),
    }),

    deleteItem: t.field({
      type: "Boolean",
      args: { id: t.arg.id({ required: true }) },
      resolve: (_root, args) => store.deleteItem(String(args.id)),
    }),

    createGroup: t.field({
      type: GroupType,
      args: {
        name: t.arg.string({ required: true }),
        data: t.arg({ type: "JSON" }),
      },
      resolve: (_root, args) =>
        store.createGroup(args.name, (args.data as Record<string, unknown>) ?? undefined),
    }),

    updateGroup: t.field({
      type: GroupType,
      args: {
        id: t.arg.id({ required: true }),
        input: t.arg({ type: GroupUpdateInputType, required: true }),
      },
      resolve: (_root, args) =>
        store.updateGroup(String(args.id), {
          name: args.input.name ?? undefined,
          data: (args.input.data as Record<string, unknown>) ?? undefined,
        }),
    }),

    deleteGroup: t.field({
      type: "Boolean",
      args: { id: t.arg.id({ required: true }) },
      resolve: (_root, args) => store.deleteGroup(String(args.id)),
    }),

    inviteMember: t.field({
      type: "Boolean",
      args: {
        groupId: t.arg.id({ required: true }),
        userId: t.arg.id({ required: true }),
      },
      resolve: (_root, args) =>
        store.inviteMember(String(args.groupId), String(args.userId)),
    }),

    removeMember: t.field({
      type: "Boolean",
      args: {
        groupId: t.arg.id({ required: true }),
        userId: t.arg.id({ required: true }),
      },
      resolve: (_root, args) =>
        store.removeMember(String(args.groupId), String(args.userId)),
    }),

    setCurrentGroup: t.field({
      type: GroupType,
      nullable: true,
      args: { id: t.arg.id({ required: true }) },
      resolve: (_root, args) => store.setCurrentGroup(String(args.id)),
    }),

    authenticate: t.field({
      type: UserType,
      args: {
        method: t.arg.string({ required: true }),
        credentials: t.arg({ type: "JSON" }),
      },
      resolve: (_root, args) => store.authenticate(args.method, args.credentials),
    }),

    logout: t.field({
      type: "Boolean",
      resolve: () => {
        store.logout()
        return true
      },
    }),
  }),
})
