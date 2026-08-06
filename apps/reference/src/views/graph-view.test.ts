import { describe, expect, it } from "vitest"
import type { Item, RelationRecord, User } from "@real-life-stack/data-interface"

import { graphNodeRef, projectSpaceGraph } from "./graph-view"

const item = (id: string, type: string, data: Record<string, unknown> = {}, relations: Item["relations"] = []): Item =>
  ({ id, type, createdAt: "2026-08-05T10:00:00.000Z", createdBy: "u1", data, relations }) as Item

const USERS: User[] = [
  { id: "u1", displayName: "Anton" },
  { id: "u2", displayName: "Lena" },
]

const labelOf = (typeId: string) => `L:${typeId}`

describe("projectSpaceGraph", () => {
  it("projects card items as nodes and skips system types", () => {
    const { nodes } = projectSpaceGraph(
      [
        item("t1", "task", { title: "Beete" }),
        item("r1", "reaction", {}),
        item("c1", "comment", {}),
        item("rel1", "relation", {}),
      ],
      [], USERS, labelOf,
    )
    expect(nodes.map((n) => n.id)).toEqual(["item:t1"])
  })

  it("adds person nodes only when an edge reaches them", () => {
    const { nodes, edges } = projectSpaceGraph(
      [item("t1", "task", { title: "Beete" }, [{ predicate: "assignedTo", target: "global:u2" }])],
      [], USERS, labelOf,
    )
    expect(nodes.map((n) => n.id).sort()).toEqual(["item:t1", "user:u2"])
    expect(nodes.find((n) => n.id === "user:u2")?.type).toBe("person")
    expect(edges).toEqual([
      { id: "t1|assignedTo|user:u2", sourceId: "item:t1", targetId: "user:u2", predicate: "assignedTo" },
    ])
  })

  it("projects relation records as edges (votesOn person → statement)", () => {
    const record = {
      id: "rel-vote",
      predicate: "votesOn",
      from: "global:u1",
      to: "item:s1",
    } as RelationRecord
    const { edges, nodes } = projectSpaceGraph(
      [item("s1", "statement", { title: "These" })],
      [record], USERS, labelOf,
    )
    expect(edges).toEqual([
      { id: "rel-vote", sourceId: "user:u1", targetId: "item:s1", predicate: "votesOn" },
    ])
    expect(nodes.some((n) => n.id === "user:u1" && n.type === "person")).toBe(true)
  })

  it("drops edges whose endpoint is unknown instead of breaking", () => {
    const { edges } = projectSpaceGraph(
      [item("t1", "task", {}, [
        { predicate: "assignedTo", target: "global:ghost" },
        { predicate: "blocks", target: "item:missing" },
      ])],
      [], USERS, labelOf,
    )
    expect(edges).toEqual([])
  })

  it("connects a cross-space target only when the item really lives in that space", () => {
    const items = [
      item("a", "post", {}, [{ predicate: "answers", target: "space:garden/item:b" }]),
      item("b", "post", {}),
    ]
    const inGarden = { resolveItemSpace: (id: string) => (id === "b" ? "garden" : null) }
    expect(projectSpaceGraph(items, [], USERS, labelOf, inGarden).edges[0]).toMatchObject({
      sourceId: "item:a",
      targetId: "item:b",
    })
  })

  it("drops a cross-space target whose local id collides with a foreign item", () => {
    // `space:other/item:b` points at ANOTHER space's item; a local item that
    // happens to share the id `b` must not be linked to it.
    const items = [
      item("a", "post", {}, [{ predicate: "answers", target: "space:other/item:b" }]),
      item("b", "post", {}),
    ]
    const inGarden = { resolveItemSpace: (id: string) => (id === "b" ? "garden" : null) }
    expect(projectSpaceGraph(items, [], USERS, labelOf, inGarden).edges).toEqual([])
    // Without a resolver the space claim is unverifiable — drop, never guess.
    expect(projectSpaceGraph(items, [], USERS, labelOf).edges).toEqual([])
  })

  it("derives node type labels from the resolver — no fifth type list", () => {
    const { nodeTypes } = projectSpaceGraph([item("t1", "task", {})], [], USERS, labelOf)
    expect(nodeTypes).toEqual([
      expect.objectContaining({ id: "task", label: "L:task" }),
    ])
  })
})

describe("projectSpaceGraph — Namensraum für Knoten-Ids (rls#248)", () => {
  it("haelt Item und User mit GLEICHER Roh-Id auseinander", () => {
    // Kollidierende Ids sind kein Konstrukt: Item-Ids und DIDs/User-Ids
    // stammen aus verschiedenen Quellen und teilen keinen Namensraum.
    const collide = "shared-id"
    const users: User[] = [{ id: collide, displayName: "Lena" }]
    const { nodes, edges } = projectSpaceGraph(
      [item(collide, "task", { title: "Beete" }, [{ predicate: "assignedTo", target: `global:${collide}` }])],
      [], users, labelOf,
    )
    // Zwei getrennte Knoten, nicht einer.
    expect(nodes).toHaveLength(2)
    const person = nodes.find((n) => n.type === "person")
    const task = nodes.find((n) => n.type === "task")
    expect(person).toBeDefined()
    expect(task).toBeDefined()
    expect(person!.id).not.toBe(task!.id)
    // Und die Kante zeigt auf den PERSONEN-Knoten.
    expect(edges).toHaveLength(1)
    expect(edges[0].sourceId).toBe(task!.id)
    expect(edges[0].targetId).toBe(person!.id)
  })

  it("kodiert den Identitaetstyp in der Knoten-Id, dekodierbar per graphNodeRef", () => {
    const { nodes } = projectSpaceGraph(
      [item("t1", "task", {}, [{ predicate: "assignedTo", target: "global:u2" }])],
      [], USERS, labelOf,
    )
    const refs = nodes.map((n) => graphNodeRef(n.id))
    expect(refs).toEqual(
      expect.arrayContaining([
        { kind: "item", id: "t1" },
        { kind: "user", id: "u2" },
      ]),
    )
  })
})
