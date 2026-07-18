import { beforeEach, describe, expect, it } from "vitest"
import { get, createStore } from "idb-keyval"
import { LocalConnector } from "../src/local-connector.js"

const seed = { items: [], groups: [{ id: "alpha", name: "Alpha" }, { id: "beta", name: "Beta" }], users: [{ id: "alice" }], groupMembers: { alpha: ["alice"], beta: ["alice"] }, groupItems: { alpha: [], beta: [] } }

describe("Notification contracts — LocalConnector", () => {
  beforeEach(async () => { await (globalThis as any).indexedDB?.deleteDatabase?.("keyval-store") })

  it("A-T1/T2: scoped activity is an all-space union despite an active workspace", async () => {
    const connector = new LocalConnector(seed); await connector.init()
    connector.setCurrentGroup("alpha"); await connector.createItem({ id: "same", type: "task", createdBy: "x", data: {} })
    connector.setCurrentGroup("beta"); await connector.createItem({ id: "same", type: "task", createdBy: "x", data: {} })
    expect((await connector.getScopedActivity()).map((value) => value.groupId).sort()).toEqual(["alpha", "beta"])
  })

  it("A-T3: persists notification state additively without reseeding", async () => {
    const first = new LocalConnector(seed); await first.init()
    await first.updateNotificationState({ op: "mute", groupId: "alpha" })
    await first.updateNotificationState({ op: "markRead", keys: { [JSON.stringify(["alpha", "entry"])]: "2026-07-18T10:00:00.000Z" } })
    const second = new LocalConnector(seed); await second.init()
    expect(await second.getNotificationState()).toMatchObject({ mutedGroupIds: { alpha: true }, readEntryKeys: { [JSON.stringify(["alpha", "entry"])]: "2026-07-18T10:00:00.000Z" } })
  })

  it("A-T4: prunes read exceptions in (entry.ts, key) order and advances the frontier", async () => {
    const connector = new LocalConnector(seed); await connector.init()
    const keys = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [JSON.stringify(["alpha", String(index).padStart(3, "0")]), `2026-07-18T10:00:${String(index % 60).padStart(2, "0")}.000Z`]))
    await connector.updateNotificationState({ op: "markRead", keys })
    const state = await connector.getNotificationState()
    expect(Object.keys(state.readEntryKeys)).toHaveLength(500)
    expect(state.readUpToTs).toBeDefined()
  })
})
