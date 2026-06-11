import { describe, it, expect } from "vitest"
import type { Item } from "@real-life-stack/data-interface"
import {
  buildCreatePayload,
  buildUpdatePayload,
  type ItemEditorPayload,
} from "../src/hooks/use-item-editor"

const BASE = "https://real-life-stack.org/vocab/base/v1"
const EVENT = "https://real-life-stack.org/vocab/event/v1"
const TASK = "https://real-life-stack.org/vocab/task/v1"

function makeExistingItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    type: "task",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "user-9",
    data: {},
    ...overrides,
  }
}

describe("buildCreatePayload", () => {
  it("derives @context from type+data when the mapper omits it", () => {
    const mapped: ItemEditorPayload = {
      type: "task",
      data: { title: "Beete vorbereiten", status: "open" },
    }
    const payload = buildCreatePayload(mapped, "user-1")
    expect(payload["@context"]).toEqual([BASE, TASK])
  })

  it("respects an explicit @context override from the mapper", () => {
    const mapped: ItemEditorPayload = {
      type: "event",
      data: { start: "2026-07-15T18:00:00Z" },
      "@context": [BASE, EVENT, "https://real-life-stack.org/vocab/place/v1"],
    }
    const payload = buildCreatePayload(mapped, "user-1")
    expect(payload["@context"]).toEqual([
      BASE,
      EVENT,
      "https://real-life-stack.org/vocab/place/v1",
    ])
  })

  it("createdBy fallback chain: mapped > currentUserId > anonymous", () => {
    expect(buildCreatePayload({ type: "post", data: {}, createdBy: "explicit" }, "user-1").createdBy).toBe("explicit")
    expect(buildCreatePayload({ type: "post", data: {} }, "user-1").createdBy).toBe("user-1")
    expect(buildCreatePayload({ type: "post", data: {} }, undefined).createdBy).toBe("anonymous")
  })

  it("omits tags when the mapper omits or empties them", () => {
    expect(buildCreatePayload({ type: "post", data: {} }, "user-1").tags).toBeUndefined()
    expect(buildCreatePayload({ type: "post", data: {}, tags: [] }, "user-1").tags).toBeUndefined()
  })

  it("includes tags when the mapper supplies non-empty tags", () => {
    const payload = buildCreatePayload(
      { type: "post", data: {}, tags: ["garten"] },
      "user-1",
    )
    expect(payload.tags).toEqual(["garten"])
  })

  it("preserves relations only when the mapper supplies them", () => {
    expect(buildCreatePayload({ type: "task", data: {} }, "user-1").relations).toBeUndefined()
    expect(
      buildCreatePayload(
        {
          type: "task",
          data: {},
          relations: [{ predicate: "assignedTo", target: "global:user-2" }],
        },
        "user-1",
      ).relations,
    ).toHaveLength(1)
  })
})

describe("buildUpdatePayload", () => {
  it("computes @context from the mapped data when not overridden", () => {
    const update = buildUpdatePayload(
      {
        type: "task",
        data: { title: "Beete", status: "in-progress" },
      },
      makeExistingItem(),
    )
    expect(update["@context"]).toEqual([BASE, TASK])
  })

  it("respects an explicit @context override", () => {
    const update = buildUpdatePayload(
      {
        type: "task",
        data: {},
        "@context": [BASE, TASK],
      },
      makeExistingItem(),
    )
    expect(update["@context"]).toEqual([BASE, TASK])
  })

  it("preserves an explicit empty tags array (caller signals 'clear')", () => {
    const update = buildUpdatePayload(
      { type: "task", data: {}, tags: [] },
      makeExistingItem({ tags: ["legacy"] }),
    )
    expect(update.tags).toEqual([])
  })

  it("omits tags from the patch when the mapper doesn't set them", () => {
    const update = buildUpdatePayload(
      { type: "task", data: {} },
      makeExistingItem({ tags: ["keep"] }),
    )
    expect("tags" in update).toBe(false)
  })

  it("preserves relations only when the mapper sets them", () => {
    const update = buildUpdatePayload(
      { type: "task", data: {} },
      makeExistingItem(),
    )
    expect("relations" in update).toBe(false)

    const updateWithRel = buildUpdatePayload(
      {
        type: "task",
        data: {},
        relations: [{ predicate: "assignedTo", target: "global:user-2" }],
      },
      makeExistingItem(),
    )
    expect(updateWithRel.relations).toHaveLength(1)
  })
})
