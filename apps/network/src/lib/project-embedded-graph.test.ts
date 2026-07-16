import type { Item } from "@real-life-stack/data-interface"
import { describe, expect, it } from "vitest"

import { dwebCampSeedItems } from "../data/network-seed"
import { projectEmbeddedGraph } from "./project-embedded-graph"

describe("projectEmbeddedGraph", () => {
  it("projects DWebCamp items into stable graph nodes and visual edges", () => {
    const first = projectEmbeddedGraph(dwebCampSeedItems)
    const second = projectEmbeddedGraph(dwebCampSeedItems)

    expect(first).toEqual(second)
    expect(first.nodes).toHaveLength(312)
    expect(first.edges).toHaveLength(388)
    expect(first.nodes).toContainEqual({
      id: "person-marie",
      label: "Marie",
      type: "person",
      avatarUrl: "https://talx.dod.ngo/media/avatars/MS3PPW_22hqsdk_thumbnail_default.webp",
    })
    expect(first.edges).toContainEqual({
      id: "person-adam::attends::event-ntyghs",
      sourceId: "person-adam",
      targetId: "event-ntyghs",
      predicate: "attends",
    })
  })

  it("deduplicates visual edges while preserving all relations on the items", () => {
    const michael = dwebCampSeedItems.find(({ id }) => id === "person-michael-suantak")
    const identiKeyRelations = michael?.relations?.filter(
      ({ predicate, target }) => predicate === "partOf" && target === "item:project-asorcom",
    )

    expect(identiKeyRelations).toHaveLength(3)
    expect(projectEmbeddedGraph(dwebCampSeedItems).edges).toContainEqual({
      id: "person-michael-suantak::partOf::project-asorcom",
      sourceId: "person-michael-suantak",
      targetId: "project-asorcom",
      predicate: "partOf",
    })
  })

  it("ignores unsupported and unresolved targets and falls back to the item id as label", () => {
    const items: Item[] = [
      {
        id: "source",
        type: "custom",
        createdAt: "2026-07-16T00:00:00.000Z",
        createdBy: "test",
        data: {},
        relations: [
          { predicate: "sameSpace", target: "item:target" },
          { predicate: "missing", target: "item:missing" },
          { predicate: "identity", target: "global:did:key:abc" },
          { predicate: "crossSpace", target: "space:other/item:target" },
        ],
      },
      {
        id: "target",
        type: "custom",
        createdAt: "2026-07-16T00:00:00.000Z",
        createdBy: "test",
        data: { title: "Target" },
      },
    ]

    expect(projectEmbeddedGraph(items)).toEqual({
      nodes: [
        { id: "source", label: "source", type: "custom" },
        { id: "target", label: "Target", type: "custom" },
      ],
      edges: [
        {
          id: "source::sameSpace::target",
          sourceId: "source",
          targetId: "target",
          predicate: "sameSpace",
        },
      ],
    })
  })

  it("derives graph thumbnails from canonical URLs and supports legacy avatar fields", () => {
    const item = (id: string, data: Item["data"]): Item => ({
      id,
      type: "person",
      createdAt: "2026-07-16T00:00:00.000Z",
      createdBy: "test",
      data,
    })

    expect(projectEmbeddedGraph([
      item("canonical", { avatarUrl: "https://dwebcamp.org/media/person.jpg" }),
      item("avatar", { avatar: "https://example.com/avatar.jpg" }),
      item("thumbnail", { avatarThumbnail: "https://example.com/thumbnail.jpg" }),
    ]).nodes.map(({ avatarUrl }) => avatarUrl)).toEqual([
      "https://dwebcamp.org/media/person.thumbnail.jpg",
      "https://example.com/avatar.jpg",
      "https://example.com/thumbnail.jpg",
    ])
  })
})
