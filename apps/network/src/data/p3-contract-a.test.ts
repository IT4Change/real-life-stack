import {
  deriveContext,
  relationRecordFromItem,
  VOCAB_BASE,
  VOCAB_RESOURCE,
  type Item,
  type RelationRecord,
} from "@real-life-stack/data-interface"
import { beforeAll, describe, expect, it } from "vitest"

import campSchedule from "./camp-schedule.json" with { type: "json" }
import {
  buildDwebCampSeedItems,
  dwebCampItemId,
  DWEB_CAMP_SEED_CREATED_AT,
  DWEB_CAMP_SEED_CREATOR,
} from "./network-seed"

let seedItems: Item[]
let resources: Item[]
let relationRecords: RelationRecord[]

beforeAll(async () => {
  seedItems = await buildDwebCampSeedItems()
  resources = seedItems.filter(({ type }) => type === "resource")
  relationRecords = seedItems
    .filter(({ type }) => type === "relation")
    .map(relationRecordFromItem)
    .filter((r): r is RelationRecord => r !== null)
})

describe("P3-Vertrag A — Ressourcen-Seed", () => {
  it("4a: 705 eindeutige Items; Projekte unangetastet", () => {
    expect(seedItems).toHaveLength(705)
    expect(new Set(seedItems.map(({ id }) => id)).size).toBe(705)
    const projects = seedItems.filter(({ type }) => type === "project")
    expect(projects).toHaveLength(65)
    for (const project of projects) {
      expect(project.data).not.toHaveProperty("projectStatus")
      expect(project.data).not.toHaveProperty("status")
    }
  })

  it("4a: exakt 5 Ressourcen, byte-genau aus camp-schedule.json", () => {
    expect(resources).toHaveLength(5)
    const byTitle = new Map(resources.map((r) => [r.data.title, r]))
    for (const src of campSchedule.resources) {
      const item = byTitle.get(src.title)
      expect(item, `Ressource fehlt: ${src.title}`).toBeDefined()
      expect(item!.id).toBe(dwebCampItemId("resource", src.title))
      expect(item!.createdAt).toBe(DWEB_CAMP_SEED_CREATED_AT)
      expect(item!.createdBy).toBe(DWEB_CAMP_SEED_CREATOR)
      expect(item!.data.kind).toBe(src.kind)
      expect(item!.data.availability).toBe(src.availability)
      expect(item!.data).not.toHaveProperty("venue")
      expect(item!["@context"]).toEqual([VOCAB_BASE, VOCAB_RESOURCE])
    }
  })

  it("4a: keine Ressource→Place- oder sonstige Ressourcen-Kante", () => {
    for (const record of relationRecords) {
      expect(record.from).not.toMatch(/^item:resource-/)
      expect(record.to).not.toMatch(/^item:resource-/)
    }
  })

  it("5: kind-Werte aktivieren task/v1 nie — auch Task-Enum-Werte nicht", () => {
    expect(deriveContext("resource", { kind: "tool" }))
      .toEqual([VOCAB_BASE, VOCAB_RESOURCE])
    expect(deriveContext("resource", { kind: "open" }))
      .toEqual([VOCAB_BASE, VOCAB_RESOURCE])
  })
})
