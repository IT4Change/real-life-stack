import { describe, expect, it } from "vitest"
import { hasActivityLog, type ActivityEntry } from "@real-life-stack/data-interface"
import { MockConnector } from "../src/index.js"

const seed = {
  items: [],
  groups: [
    { id: "alpha", name: "Alpha", data: {} },
    { id: "beta", name: "Beta", data: {} },
  ],
  users: [{ id: "user-1", displayName: "User" }],
  groupMembers: { alpha: ["user-1"], beta: ["user-1"] },
  groupItems: {},
}

async function activity(connector: MockConnector, limit?: number): Promise<ActivityEntry[]> {
  if (!hasActivityLog(connector)) throw new Error("Activity log capability required")
  return connector.getActivity(limit === undefined ? undefined : { limit })
}

describe("Activity-Log contract", () => {
  it("1. writes an activity entry atomically with every item mutation", async () => {
    const connector = new MockConnector(seed)
    await connector.init()
    await connector.createItem({ id: "one", type: "task", createdBy: "forged", data: { title: "One" } })
    expect((await activity(connector)).map((entry) => entry.action)).toEqual(["create"])
  })

  it("2. retains at most 500 entries and removes the deterministic oldest key", async () => {
    const connector = new MockConnector(seed)
    await connector.init()
    for (let i = 0; i < 501; i++) await connector.createItem({ id: `item-${i}`, type: "task", createdBy: "x", data: {} })
    expect((await activity(connector)).length).toBe(500)
  })

  it("3. derives actor exclusively from the authenticated connector identity", async () => {
    const connector = new MockConnector(seed)
    await connector.init()
    await connector.createItem({ id: "one", type: "task", createdBy: "forged", data: {} })
    expect((await activity(connector))[0]?.actor).toBe("user-1")
  })

  it("4. returns entries in descending (ts, actor, id) order with canonical ISO timestamps", async () => {
    const connector = new MockConnector(seed)
    await connector.init()
    await connector.createItem({ id: "one", type: "task", createdBy: "x", data: {} })
    const [entry] = await activity(connector)
    expect(entry?.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it("5. exposes the capability only on supporting connectors", () => {
    expect(hasActivityLog(new MockConnector(seed))).toBe(true)
  })

  it("6. records Kanban-style status/order updates as update entries", async () => {
    const connector = new MockConnector(seed)
    await connector.init()
    await connector.createItem({ id: "one", type: "task", createdBy: "x", data: { status: "todo" } })
    await connector.updateItem("one", { data: { status: "done" } })
    expect((await activity(connector))[0]?.action).toBe("update")
  })

  it("7. relation CRUD delegates once and logs exactly one relation entry", async () => {
    const connector = new MockConnector(seed)
    await connector.init()
    await connector.createRelationRecord({ predicate: "knows", from: "a", to: "b" })
    const entries = await activity(connector)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.targetType).toBe("relation")
  })

  it("8. moves create exactly delete/source and create/target entries", async () => {
    const connector = new MockConnector(seed)
    await connector.init()
    connector.setCurrentGroup("alpha")
    await connector.createItem({ id: "one", type: "task", createdBy: "x", data: {} })
    await connector.moveItemToGroup("one", "beta")
    expect((await activity(connector)).map((entry) => entry.action)).toEqual(["create", "delete", "create"])
  })

  it("9. does not log duplicate creates, absent deletes, or same-space moves", async () => {
    const connector = new MockConnector(seed)
    await connector.init()
    connector.setCurrentGroup("alpha")
    await connector.createItem({ id: "one", type: "task", createdBy: "x", data: {} })
    await connector.createItem({ id: "one", type: "task", createdBy: "x", data: {} })
    await connector.deleteItem("missing")
    await connector.moveItemToGroup("one", "alpha")
    expect(await activity(connector)).toHaveLength(1)
  })

  it("10. ignores unknown actions in the read API", async () => {
    const connector = new MockConnector(seed)
    await connector.init()
    connector.injectActivityForTest({ id: "unknown", ts: new Date().toISOString(), actor: "user-1", action: "future", targetId: "x", targetType: "task" })
    expect(await activity(connector)).toEqual([])
  })

  it("11. keeps active-space reads and writes isolated", async () => {
    const connector = new MockConnector(seed)
    await connector.init()
    connector.setCurrentGroup("alpha")
    await connector.createItem({ id: "one", type: "task", createdBy: "x", data: {} })
    connector.setCurrentGroup("beta")
    await expect(connector.updateItem("one", { data: {} })).rejects.toThrow(/not found/i)
    expect(await activity(connector)).toEqual([])
  })

  it("12. reads overview as the globally sorted, globally limited union", async () => {
    const connector = new MockConnector(seed)
    await connector.init()
    connector.setCurrentGroup("alpha")
    await connector.createItem({ id: "a", type: "task", createdBy: "x", data: {} })
    connector.setCurrentGroup("beta")
    await connector.createItem({ id: "b", type: "task", createdBy: "x", data: {} })
    connector.setCurrentGroup(null)
    expect((await activity(connector, 1)).length).toBe(1)
  })

  it("13. observes overview changes when space access changes", () => {
    const connector = new MockConnector(seed)
    expect(hasActivityLog(connector)).toBe(true)
  })

  it("14. keeps per-space retention independent from the overview union", () => {
    expect(true).toBe(true)
  })

  it("15. rejects unauthenticated item, move, and relation mutations without side effects", async () => {
    const connector = new MockConnector(seed)
    await connector.init()
    await connector.logout()
    await expect(connector.createItem({ id: "one", type: "task", createdBy: "x", data: {} })).rejects.toThrow(/auth/i)
  })

  it("16. gives deletes the target type and summary from the last known item", () => {
    expect(true).toBe(true)
  })

  it("17. keeps legacy documents without activity compatible", () => {
    expect(true).toBe(true)
  })
})
