import { describe, it, expect } from "vitest"
import {
  deriveContext,
  VOCAB_BASE,
  VOCAB_EVENT,
  VOCAB_PLACE,
  VOCAB_TASK,
  VOCAB_PERSON,
  VOCAB_RELATION,
} from "../src/index.js"

describe("deriveContext", () => {
  it("always includes base/v1 first, even for empty data and unknown type", () => {
    expect(deriveContext("post", {})).toEqual([VOCAB_BASE])
    expect(deriveContext("anything", { foo: "bar" })).toEqual([VOCAB_BASE])
  })

  it("adds event/v1 when data.start is a non-empty string", () => {
    expect(deriveContext("event", { start: "2026-04-01T10:00:00Z" })).toContain(VOCAB_EVENT)
  })

  it("does NOT add event/v1 for empty or non-string start", () => {
    expect(deriveContext("event", { start: "" })).not.toContain(VOCAB_EVENT)
    expect(deriveContext("event", { start: null })).not.toContain(VOCAB_EVENT)
    expect(deriveContext("event", { start: 123 })).not.toContain(VOCAB_EVENT)
    expect(deriveContext("event", {})).not.toContain(VOCAB_EVENT)
  })

  it("adds place/v1 for GeoJSON Point, LineString, and Polygon positions", () => {
    const point = { type: "Point", coordinates: [13.4, 52.5] }
    const line = { type: "LineString", coordinates: [[13.4, 52.5], [13.5, 52.6]] }
    const poly = { type: "Polygon", coordinates: [[[13.4, 52.5], [13.5, 52.5], [13.5, 52.6], [13.4, 52.5]]] }
    expect(deriveContext("place", { position: point })).toContain(VOCAB_PLACE)
    expect(deriveContext("place", { position: line })).toContain(VOCAB_PLACE)
    expect(deriveContext("place", { position: poly })).toContain(VOCAB_PLACE)
  })

  it("does NOT add place/v1 for non-geometry position values", () => {
    expect(deriveContext("place", { position: null })).not.toContain(VOCAB_PLACE)
    expect(deriveContext("place", { position: { type: "Point", coordinates: [] } })).not.toContain(VOCAB_PLACE)
    expect(deriveContext("place", { position: { type: "MultiPoint", coordinates: [[0, 0]] } })).not.toContain(VOCAB_PLACE)
    expect(deriveContext("place", { position: { lat: 52.5, lng: 13.4 } })).not.toContain(VOCAB_PLACE)
    expect(deriveContext("place", { position: "Berlin" })).not.toContain(VOCAB_PLACE)
  })

  it("adds task/v1 when type === 'task' regardless of status", () => {
    expect(deriveContext("task", {})).toContain(VOCAB_TASK)
    expect(deriveContext("task", { status: "weirdo" })).toContain(VOCAB_TASK)
  })

  it("adds task/v1 when data.status is a spec enum value, regardless of type", () => {
    expect(deriveContext("post", { status: "open" })).toContain(VOCAB_TASK)
    expect(deriveContext("post", { status: "in-progress" })).toContain(VOCAB_TASK)
    expect(deriveContext("post", { status: "done" })).toContain(VOCAB_TASK)
    expect(deriveContext("post", { status: "archived" })).toContain(VOCAB_TASK)
  })

  it("does NOT add task/v1 for status outside the spec enum", () => {
    expect(deriveContext("post", { status: "draft" })).not.toContain(VOCAB_TASK)
    expect(deriveContext("post", { status: "" })).not.toContain(VOCAB_TASK)
  })

  it("adds person/v1 when type === 'person'", () => {
    expect(deriveContext("person", { displayName: "Anton" })).toContain(VOCAB_PERSON)
  })

  it("does NOT add person/v1 for other types even with person-like fields", () => {
    expect(deriveContext("post", { displayName: "Anton" })).not.toContain(VOCAB_PERSON)
  })

  it("adds relation/v1 when type === 'relation'", () => {
    expect(deriveContext("relation", { predicate: "knows" })).toEqual([
      VOCAB_BASE,
      VOCAB_RELATION,
    ])
  })

  it("does NOT add relation/v1 based on a predicate field alone", () => {
    expect(deriveContext("post", { predicate: "knows" })).not.toContain(VOCAB_RELATION)
  })

  it("composes multiple vocabs: event + place for an event with a location", () => {
    const ctx = deriveContext("event", {
      start: "2026-04-01T10:00:00Z",
      position: { type: "Point", coordinates: [13.4, 52.5] },
    })
    expect(ctx).toEqual([VOCAB_BASE, VOCAB_EVENT, VOCAB_PLACE])
  })

  it("composes multiple vocabs: task by type with no extra triggers", () => {
    expect(deriveContext("task", { title: "Do the thing" })).toEqual([VOCAB_BASE, VOCAB_TASK])
  })

  it("preserves a deterministic order: base, event, place, task, person", () => {
    const ctx = deriveContext("person", {
      start: "2026-04-01T10:00:00Z",
      position: { type: "Point", coordinates: [0, 0] },
      status: "open",
    })
    expect(ctx).toEqual([VOCAB_BASE, VOCAB_EVENT, VOCAB_PLACE, VOCAB_TASK, VOCAB_PERSON])
  })

  it("returns a base-only array for opaque types like 'comment' or 'reaction'", () => {
    expect(deriveContext("comment", { content: "hi" })).toEqual([VOCAB_BASE])
    expect(deriveContext("reaction", { emoji: "🙂" })).toEqual([VOCAB_BASE])
  })
})
