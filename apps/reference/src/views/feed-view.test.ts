import { describe, expect, it } from "vitest"
import type { Item } from "@real-life-stack/data-interface"
import { selectFeedItems } from "./feed-view"

/**
 * The feed is the "what's new in my network" surface: it shows everything that
 * stands on its own as a card, NOT a hand-picked set of types (spec
 * docs/spec/modules/feed.md → Datenmodell, 06-schema-composition.md →
 * Modul-Konsequenzen). Anton's decision 2026-08-17: a place Timo posts must
 * appear in the feed, not only on the map.
 */
function item(id: string, type: string, createdAt: string, data: Record<string, unknown> = {}): Item {
  return { id, type, createdAt, createdBy: "did:key:timo", data } as Item
}

describe("selectFeedItems", () => {
  it("includes a place — the map is not the only surface it reaches", () => {
    const place = item("place-1", "place", "2026-08-17T10:00:00.000Z", {
      title: "Lichtung Geilebach",
      position: { type: "Point", coordinates: [9.4, 51.3] },
    })

    expect(selectFeedItems([place]).map(({ id }) => id)).toEqual(["place-1"])
  })

  it("includes every card-worthy type, not just posts, events and statements", () => {
    const items = ["post", "event", "place", "task", "person", "project", "resource", "statement"].map(
      (type, i) => item(`${type}-1`, type, `2026-08-0${i + 1}T10:00:00.000Z`),
    )

    expect(selectFeedItems(items)).toHaveLength(items.length)
  })

  it("leaves out what only exists inside another item's card", () => {
    const post = item("p1", "post", "2026-08-01T10:00:00.000Z", { content: "Hallo" })
    // A comment carries `data.content` too — the old content-field query is
    // exactly why it needed a special case here.
    const comment = item("c1", "comment", "2026-08-01T11:00:00.000Z", { content: "Antwort" })
    const reaction = item("r1", "reaction", "2026-08-01T12:00:00.000Z", { emoji: "❤️" })
    const relation = item("rel1", "relation", "2026-08-01T13:00:00.000Z", {})
    const feature = item("f1", "feature", "2026-08-01T14:00:00.000Z", {})

    expect(selectFeedItems([post, comment, reaction, relation, feature]).map(({ id }) => id)).toEqual(["p1"])
  })

  it("sorts newest first", () => {
    const older = item("old", "post", "2026-08-01T10:00:00.000Z")
    const newer = item("new", "place", "2026-08-17T10:00:00.000Z")

    expect(selectFeedItems([older, newer]).map(({ id }) => id)).toEqual(["new", "old"])
  })

  it("does not mutate the caller's array", () => {
    const items = [item("a", "post", "2026-08-01T10:00:00.000Z"), item("b", "post", "2026-08-02T10:00:00.000Z")]

    selectFeedItems(items)

    expect(items.map(({ id }) => id)).toEqual(["a", "b"])
  })
})
