import {
  relationRecordFromItem,
  type Item,
  type RelationRecord,
} from "@real-life-stack/data-interface"
import { beforeAll, describe, expect, it } from "vitest"

import { buildDwebCampSeedItems } from "../data/network-seed"
import { projectRelationGraph } from "./project-relation-graph"

let seedItems: Item[]
let seedRecords: RelationRecord[]

beforeAll(async () => {
  seedItems = await buildDwebCampSeedItems()
  seedRecords = seedItems
    .map(relationRecordFromItem)
    .filter((record): record is RelationRecord => record !== null)
})

function item(id: string, data: Item["data"] = {}, type = "custom"): Item {
  return {
    id,
    type,
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "test",
    data,
  }
}

function record(
  id: string,
  from: string,
  to: string,
  predicate = "connectedWith",
): RelationRecord {
  return {
    id,
    predicate,
    from,
    to,
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "test",
  }
}

describe("projectRelationGraph", () => {
  it("projects DWebCamp records into stable graph nodes and edges", () => {
    const first = projectRelationGraph(seedItems, seedRecords)
    const second = projectRelationGraph(seedItems, seedRecords)

    expect(first).toEqual(second)
    expect(first.nodes).toHaveLength(339)
    expect(first.edges).toHaveLength(497)
    const marie = first.nodes.find(({ id }) => id === "person-marie")
    expect(marie).toMatchObject({
      id: "person-marie",
      label: "Marie",
      type: "person",
    })
    expect(marie?.avatarUrl).toMatch(/^data:image\/webp;base64,/)
    const avatarNodes = first.nodes.filter(({ avatarUrl }) => avatarUrl !== undefined)
    expect(avatarNodes).toHaveLength(111)
    expect(avatarNodes.every(({ avatarUrl }) => avatarUrl?.startsWith("data:image/"))).toBe(true)
    expect(first.edges).toContainEqual({
      id: "rel-a51546e70eb70bec300eb5d67fa96c5a8fdee4adb7e61e7469b44226378b8117",
      sourceId: "person-adam",
      targetId: "event-ntyghs",
      predicate: "attends",
    })
  })

  it("never turns relation items into graph nodes", () => {
    const projection = projectRelationGraph(seedItems, seedRecords)

    expect(seedItems.filter(({ type }) => type === "relation")).toHaveLength(497)
    expect(projection.nodes.some(({ type }) => type === "relation")).toBe(false)
  })

  it("ignores unsupported and dangling endpoints", () => {
    const items = [
      item("source"),
      item("target", { title: "Target" }),
      item("rel-storage", { predicate: "stored" }, "relation"),
    ]
    const records = [
      record("valid", "item:source", "item:target", "sameSpace"),
      record("missing", "item:source", "item:missing"),
      record("identity", "item:source", "global:did:key:abc"),
      record("cross-space", "item:source", "space:other/item:target"),
      record("relation-endpoint", "item:source", "item:rel-storage"),
    ]

    expect(projectRelationGraph(items, records)).toEqual({
      nodes: [
        { id: "source", label: "source", type: "custom" },
        { id: "target", label: "Target", type: "custom" },
      ],
      edges: [
        {
          id: "valid",
          sourceId: "source",
          targetId: "target",
          predicate: "sameSpace",
        },
      ],
    })
  })

  it("derives graph thumbnails from canonical URLs and supports legacy avatar fields", () => {
    expect(projectRelationGraph([
      item("canonical", { avatarUrl: "https://dwebcamp.org/media/person.jpg" }, "person"),
      item("avatar", { avatar: "https://example.com/avatar.jpg" }, "person"),
      item("thumbnail", { avatarThumbnail: "https://example.com/thumbnail.jpg" }, "person"),
    ], []).nodes.map(({ avatarUrl }) => avatarUrl)).toEqual([
      "https://dwebcamp.org/media/person.thumbnail.jpg",
      "https://example.com/avatar.jpg",
      "https://example.com/thumbnail.jpg",
    ])
  })
})
