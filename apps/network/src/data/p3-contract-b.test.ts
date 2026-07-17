import {
  relationRecordFromItem,
  VOCAB_BASE,
  VOCAB_EVENT,
  VOCAB_PLACE,
  type Item,
  type RelationRecord,
} from "@real-life-stack/data-interface"
import { beforeAll, describe, expect, it } from "vitest"

import campSchedule from "./camp-schedule.json" with { type: "json" }
import { buildDwebCampSeedItems, dwebCampItemId } from "./network-seed"

let seedItems: Item[]
let byId: Map<string, Item>
let events: Item[]
let places: Item[]
let relationRecords: RelationRecord[]

beforeAll(async () => {
  seedItems = await buildDwebCampSeedItems()
  byId = new Map(seedItems.map((item) => [item.id, item]))
  events = seedItems.filter(({ type }) => type === "event")
  places = seedItems.filter(({ type }) => type === "place")
  relationRecords = seedItems
    .filter(({ type }) => type === "relation")
    .map(relationRecordFromItem)
    .filter((r): r is RelationRecord => r !== null)
})

describe("P3-Vertrag B — Schedule-Seed", () => {
  it("4b: 836 eindeutige Items (339 Domain + 497 Records); Bestand bleibt Teilmenge", () => {
    expect(seedItems).toHaveLength(836)
    expect(new Set(seedItems.map(({ id }) => id)).size).toBe(836)
    expect(seedItems.filter(({ type }) => type === "relation")).toHaveLength(497)
    const predicates = new Map<string, number>()
    for (const r of relationRecords) {
      predicates.set(r.predicate, (predicates.get(r.predicate) ?? 0) + 1)
    }
    expect(predicates.get("attends")).toBe(192)
    expect(predicates.get("connectedWith")).toBe(97)
    expect(predicates.get("partOf")).toBe(99)
    expect(predicates.get("takesPlaceAt")).toBe(109)
    // ID-Stabilität: bekannter P1b-Vektor bleibt byte-identisch
    expect(byId.has(
      "rel-5b412a2b673962f16ff89324a7a9cb84b90d5c412d10203e66f62f6dcdb00bbc",
    )).toBe(true)
  })

  it("4b: alle 109 Events mit parsebarem start, end > start, event/v1 aktiv", () => {
    expect(events).toHaveLength(109)
    for (const event of events) {
      const start = Date.parse(String(event.data.start))
      const end = Date.parse(String(event.data.end))
      expect(Number.isFinite(start), `start unparsebar: ${event.id}`).toBe(true)
      expect(Number.isFinite(end), `end unparsebar: ${event.id}`).toBe(true)
      expect(end).toBeGreaterThan(start)
      expect(event["@context"]).toContain(VOCAB_EVENT)
    }
  })

  it("4b: bijektiver Code-Join und genau eine takesPlaceAt-Kante je Event", () => {
    const scheduleIds = campSchedule.sessions.map(
      (s: { code: string }) => dwebCampItemId("event", s.code),
    )
    expect(new Set(scheduleIds).size).toBe(109)
    expect(new Set(events.map(({ id }) => id))).toEqual(new Set(scheduleIds))

    const takesPlaceAt = relationRecords.filter(
      ({ predicate }) => predicate === "takesPlaceAt",
    )
    const fromCounts = new Map<string, number>()
    for (const record of takesPlaceAt) {
      fromCounts.set(record.from, (fromCounts.get(record.from) ?? 0) + 1)
      expect(record.from).toMatch(/^item:event-/)
      expect(record.to).toMatch(/^item:place-/)
      expect(byId.has(record.from.slice("item:".length))).toBe(true)
      expect(byId.has(record.to.slice("item:".length))).toBe(true)
    }
    expect(fromCounts.size).toBe(109)
    for (const count of fromCounts.values()) expect(count).toBe(1)
  })

  it("4b: 15 Places byte-genau aus camp-schedule.json, Point in [lng, lat]", () => {
    expect(places).toHaveLength(15)
    const byName = new Map(places.map((p) => [p.data.locationName, p]))
    for (const venue of campSchedule.venues) {
      const item = byName.get(venue.name)
      expect(item, `Place fehlt: ${venue.name}`).toBeDefined()
      expect(item!.id).toBe(dwebCampItemId("place", venue.name))
      expect(item!.data.title).toBe(venue.name)
      expect(item!.data.position).toEqual(venue.position)
      const pos = item!.data.position as { type: string; coordinates: [number, number] }
      expect(pos.type).toBe("Point")
      const [lng, lat] = pos.coordinates
      // Camp-Gelände Brandenburg: lng ~12.40, lat ~52.12 — vertauschte
      // Achsen fallen hier sofort auf.
      expect(lng).toBeGreaterThan(12)
      expect(lng).toBeLessThan(13)
      expect(lat).toBeGreaterThan(52)
      expect(lat).toBeLessThan(53)
      expect(item!["@context"]).toContain(VOCAB_PLACE)
    }
  })
})
