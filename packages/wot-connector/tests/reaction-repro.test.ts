import { describe, expect, it, vi } from "vitest"
import { createObservable } from "@real-life-stack/data-interface"
import { WotConnector } from "../src/wot-connector.js"
import type { RlsSpaceDoc } from "../src/types.js"

function doc(): RlsSpaceDoc {
  return { _type: "rls", items: {}, metadata: { name: "test", modules: [] } }
}

function handle(value = doc()) {
  return {
    value,
    getDoc: () => value,
    transact: vi.fn((fn: (next: RlsSpaceDoc) => void) => { fn(value) }),
    onRemoteUpdate: () => () => {},
    close: vi.fn(),
  }
}

function connector(current: ReturnType<typeof handle>) {
  const value = Object.create(WotConnector.prototype) as any
  value.handleReady = Promise.resolve()
  value.currentHandle = current
  value.currentGroupId = "source"
  value.currentUserObs = createObservable({ id: "did:key:alice", displayName: "Alice" })
  value.activityObservables = new Map()
  value.activityDirty = false
  value.activityReconciliations = new Map()
  value.crossGroupIndex = null
  value.notifyAllObservers = vi.fn()
  value.replication = { openSpace: vi.fn(async () => current) }
  return value as WotConnector
}

describe("reaction flow repro (WoT)", () => {
  it("create reaction with relations → related items → delete", async () => {
    const space = handle()
    const c = connector(space) as any

    await c.createItem({ id: "p1", type: "post", createdBy: "did:key:alice", data: { text: "hi" } })
    const reaction = await c.createItem({
      type: "reaction", createdBy: "did:key:alice", data: { emoji: "👍" },
      relations: [{ predicate: "reactsTo", target: "item:p1" }],
    })
    expect(reaction.id).toBeTruthy()

    const related = await c.getRelatedItems("p1", "reactsTo", { direction: "to" })
    expect(related.map((r: { id: string }) => r.id)).toContain(reaction.id)

    await c.deleteItem(reaction.id)
    expect(space.value.items[reaction.id]).toBeUndefined()
  })
})
