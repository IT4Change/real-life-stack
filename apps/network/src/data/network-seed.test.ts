import { describe, expect, it } from "vitest"
import { VOCAB_BASE, VOCAB_PERSON } from "@real-life-stack/data-interface"

import {
  buildDwebCampSeedItems,
  dwebCampGraph,
  dwebCampItemId,
  dwebCampSeedItems,
  slugSeedValue,
} from "./network-seed"

describe("DWebCamp seed importer", () => {
  it("imports the exact source inventory with stable unique ids", () => {
    expect(dwebCampSeedItems.filter(({ type }) => type === "event")).toHaveLength(109)
    expect(dwebCampSeedItems.filter(({ type }) => type === "person")).toHaveLength(138)
    expect(dwebCampSeedItems.filter(({ type }) => type === "project")).toHaveLength(65)
    expect(dwebCampSeedItems).toHaveLength(312)
    expect(new Set(dwebCampSeedItems.map(({ id }) => id)).size).toBe(312)

    expect(dwebCampItemId("event", "SJXE8X")).toBe("event-sjxe8x")
    expect(dwebCampItemId("person", "Václav Pavlín")).toBe("person-vaclav-pavlin")
    expect(slugSeedValue("The Open Co-op")).toBe("the-open-co-op")
    expect(buildDwebCampSeedItems()).toEqual(buildDwebCampSeedItems())
  })

  it("maps source relations to embedded item targets with the specified metadata", () => {
    const relations = dwebCampSeedItems.flatMap(({ relations = [] }) => relations)
    expect(relations.filter(({ predicate }) => predicate === "attends")).toHaveLength(192)
    expect(relations.filter(({ predicate }) => predicate === "connectedWith")).toHaveLength(97)
    expect(relations.filter(({ predicate }) => predicate === "partOf")).toHaveLength(112)
    expect(relations).toHaveLength(401)

    const adam = dwebCampSeedItems.find(({ id }) => id === "person-adam")
    expect(adam?.relations).toContainEqual({
      predicate: "attends",
      target: "item:event-ntyghs",
      meta: { tense: "has-been", role: "speaker" },
    })
    expect(adam?.relations).toContainEqual({
      predicate: "partOf",
      target: "item:project-sig0lease",
      meta: { context: "NTYGHS" },
    })

    const event = dwebCampSeedItems.find(({ id }) => id === "event-3kgbef")
    expect(event?.relations).toContainEqual({
      predicate: "connectedWith",
      target: "item:project-fsfe",
    })
    expect(event?.tags).toContain("community-commons")

    const itemIds = new Set(dwebCampSeedItems.map(({ id }) => id))
    for (const relation of relations) {
      expect(relation.target.startsWith("item:")).toBe(true)
      expect(itemIds.has(relation.target.slice("item:".length))).toBe(true)
    }
  })

  it("maps the source payload without inventing link or avatar data", () => {
    const quiet = dwebCampSeedItems.find(({ id }) => id === "project-quiet")
    expect(quiet?.data).toEqual({
      title: "Quiet",
      website: "https://tryquiet.org",
      repo: "https://github.com/TryQuiet/quiet",
    })

    const marie = dwebCampSeedItems.find(({ id }) => id === "person-marie")
    expect(marie?.data).toEqual({
      displayName: "Marie",
      avatar: dwebCampGraph.avatars.Marie,
    })
    expect(dwebCampGraph.avatars.Marie.startsWith("https://")).toBe(true)
  })

  it("derives vocabulary contexts from each imported item shape", () => {
    const event = dwebCampSeedItems.find(({ type }) => type === "event")
    const person = dwebCampSeedItems.find(({ type }) => type === "person")
    const project = dwebCampSeedItems.find(({ type }) => type === "project")

    expect(event?.["@context"]).toEqual([VOCAB_BASE])
    expect(person?.["@context"]).toEqual([VOCAB_BASE, VOCAB_PERSON])
    expect(project?.["@context"]).toEqual([VOCAB_BASE])
  })
})
