import { describe, expect, it } from "vitest"
import { hasNotificationState } from "@real-life-stack/data-interface"
import { MockConnector } from "../src/mock-connector.js"

const seed = {
  items: [],
  groups: [{ id: "alpha", name: "Alpha" }, { id: "beta", name: "Beta" }],
  users: [{ id: "alice", displayName: "Alice" }, { id: "bob", displayName: "Bob" }],
  groupMembers: { alpha: ["alice"], beta: ["bob"] },
  groupItems: { alpha: [], beta: [] },
}

describe("Notification contracts — MockConnector", () => {
  it("A-T1/T2: reads every scope independently of the active workspace and scopes equal naked IDs", async () => {
    const connector = new MockConnector(seed)
    connector.setCurrentGroup("alpha")
    await connector.createItem({ id: "same", type: "task", createdBy: "ignored", data: { title: "Alpha" } })
    connector.setCurrentGroup("beta")
    await connector.createItem({ id: "same", type: "event", createdBy: "ignored", data: { title: "Beta" } })

    const entries = await connector.getScopedActivity()
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ groupId: "alpha", entry: expect.objectContaining({ targetId: "same" }) }),
      expect.objectContaining({ groupId: "beta", entry: expect.objectContaining({ targetId: "same" }) }),
    ]))
    expect(new Set(entries.map(({ groupId, entry }) => JSON.stringify([groupId, entry.id]))).size).toBe(entries.length)
  })

  it("A-T6: resolves live parent/hints and distinguishes deleted target from missing parent", async () => {
    const connector = new MockConnector(seed)
    connector.setCurrentGroup("alpha")
    const parent = await connector.createItem({ id: "parent", type: "task", createdBy: "ignored", data: { title: "Task", start: "2026-07-18", position: { coordinates: [] } } })
    const reaction = await connector.createItem({ id: "reaction", type: "reaction", createdBy: "ignored", data: {}, relations: [{ predicate: "reactsTo", target: `item:${parent.id}` }] })
    await connector.deleteItem(reaction.id)
    const deletedReaction = (await connector.getScopedActivity()).find((value) => value.entry.targetId === reaction.id && value.entry.action === "create")!
    expect(deletedReaction).toMatchObject({ targetExists: false, subject: { id: parent.id, createdBy: "alice", moduleHints: { hasPosition: true, hasStart: true, hasStatus: true } }, actor: { id: "alice" } })
    await connector.deleteItem(parent.id)
    expect((await connector.getScopedActivity()).find((value) => value.entry.targetId === reaction.id && value.entry.action === "create")!.subject).toBeNull()
  })

  it("A-T3/T4: exposes the closed state API and keeps old and late keys read behind the frontier", async () => {
    const connector = new MockConnector(seed)
    expect(hasNotificationState(connector)).toBe(true)
    await connector.updateNotificationState({ op: "markSeen", ts: "2026-07-18T10:00:00.000Z" })
    await connector.updateNotificationState({ op: "markAllReadUpTo", ts: "2026-07-18T10:00:00.000Z" })
    await connector.updateNotificationState({ op: "markRead", keys: { [JSON.stringify(["alpha", "late"])]: "2026-07-18T09:00:00.000Z" } })
    expect(await connector.getNotificationState()).toMatchObject({ lastSeenTs: "2026-07-18T10:00:00.000Z", readUpToTs: "2026-07-18T10:00:00.000Z" })
  })
})
