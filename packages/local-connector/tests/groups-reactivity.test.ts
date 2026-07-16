import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Group } from "@real-life-stack/data-interface"

// Mock idb-keyval (no IndexedDB in Node)
vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn(async (_key: string, updater: (value: unknown) => unknown) => { updater(undefined) }),
  del: vi.fn().mockResolvedValue(undefined),
  createStore: vi.fn().mockReturnValue({}),
}))

// Mock BroadcastChannel (not available in Node)
vi.stubGlobal("BroadcastChannel", class {
  onmessage = null
  postMessage() {}
  close() {}
})

import { LocalConnector } from "../src/local-connector.js"

describe("LocalConnector — Groups Reactivity", () => {
  let connector: LocalConnector

  beforeEach(async () => {
    connector = new LocalConnector({
      items: [],
      groups: [
        { id: "g1", name: "Group 1" },
        { id: "g2", name: "Group 2" },
      ],
      users: [{ id: "user-1", displayName: "Alice" }],
      groupMembers: { g1: ["user-1"], g2: ["user-1"] },
    })
    await connector.init()
    await connector.authenticate("local", {})
  })

  it("observeCurrentGroup returns initial group", () => {
    const observable = connector.observeCurrentGroup()
    expect(observable.current).not.toBeNull()
    expect(observable.current?.id).toBe("g1")
  })

  it("observeCurrentGroup fires on setCurrentGroup", () => {
    const observable = connector.observeCurrentGroup()
    const updates: (Group | null)[] = []
    observable.subscribe((g) => updates.push(g))

    connector.setCurrentGroup("g2")

    expect(updates).toHaveLength(1)
    expect(updates[0]?.id).toBe("g2")
    expect(observable.current?.id).toBe("g2")
  })

  it("observeCurrentGroup fires null when active group is deleted", async () => {
    connector.setCurrentGroup("g2")

    const observable = connector.observeCurrentGroup()
    const updates: (Group | null)[] = []
    observable.subscribe((g) => updates.push(g))

    await connector.deleteGroup("g2")

    // Should have switched to g1 (first remaining group)
    const lastUpdate = updates[updates.length - 1]
    expect(lastUpdate?.id).toBe("g1")
  })

  it("observeCurrentGroup does not fire when switching to same group", () => {
    connector.setCurrentGroup("g1")

    const observable = connector.observeCurrentGroup()
    const updates: (Group | null)[] = []
    observable.subscribe((g) => updates.push(g))

    connector.setCurrentGroup("g1")

    // No update — same group
    expect(updates).toHaveLength(0)
  })

  it("observeGroups fires when a group is created", async () => {
    const observable = connector.observeGroups()
    const updates: Group[][] = []
    observable.subscribe((g) => updates.push(g))

    await connector.createGroup("Group 3")

    expect(updates.length).toBeGreaterThan(0)
    const lastUpdate = updates[updates.length - 1]
    expect(lastUpdate).toHaveLength(3)
    expect(lastUpdate.map((g) => g.name)).toContain("Group 3")
  })

  it("observeGroups fires when a group is renamed", async () => {
    const observable = connector.observeGroups()
    const updates: Group[][] = []
    observable.subscribe((g) => updates.push(g))

    await connector.updateGroup("g1", { name: "Renamed" })

    const lastUpdate = updates[updates.length - 1]
    expect(lastUpdate.find((g) => g.id === "g1")?.name).toBe("Renamed")
  })
})
