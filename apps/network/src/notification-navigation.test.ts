import { describe, expect, it } from "vitest"
import { MockConnector } from "@real-life-stack/mock-connector"
import { applyNotificationNavigation, lensCanDisplay, lensForHints } from "./notification-navigation"

const seed = {
  items: [], groups: [{ id: "alpha", name: "Alpha" }, { id: "beta", name: "Beta" }],
  users: [{ id: "user-1", displayName: "User" }],
  groupMembers: { alpha: ["user-1"], beta: ["user-1"] }, groupItems: { alpha: [], beta: [] },
}

describe("B-T4 — Netzwerk-Cross-Group über den echten Handler-Vertrag", () => {
  it("switches group, selects the target WITHOUT the old-space guard, and picks the lens from hints", async () => {
    const connector = new MockConnector(seed as never)
    await connector.init()
    connector.setCurrentGroup("alpha")
    // The target lives in ANOTHER group — an old-space itemById lookup would drop it.
    connector.setCurrentGroup("beta")
    await connector.createItem({ id: "task-b", type: "task", createdBy: "user-1", data: { status: "open", title: "Fremd" } })
    connector.setCurrentGroup("alpha")

    const selected: string[] = []
    const lenses: string[] = []
    let closed = 0
    let filtersReset = 0
    applyNotificationNavigation(
      { groupId: "beta", subjectId: "task-b", subjectType: "task", moduleHints: { hasPosition: false, hasStart: false, hasStatus: true } },
      { connector, selectNodeId: (id) => selected.push(id), setActiveLens: (lens) => lenses.push(lens), close: () => { closed += 1 }, resetFilters: () => { filtersReset += 1 } },
    )
    expect(filtersReset).toBe(1)

    expect(connector.getCurrentGroup()?.id).toBe("beta")
    expect(selected).toEqual(["task-b"])
    expect(lenses).toEqual(["kanban"])
    expect(closed).toBe(1)
    // The detail resolves reactively AFTER the switch: the target is now visible.
    expect(await connector.getItem("task-b")).not.toBeNull()
  })

  it("lens escalation: the active lens only keeps targets it can display", () => {
    const place = { hasPosition: true, hasStart: false, hasStatus: false }
    const task = { hasPosition: false, hasStart: false, hasStatus: true }
    const post = { hasPosition: false, hasStart: false, hasStatus: false }
    expect(lensCanDisplay("map", place)).toBe(true)
    expect(lensCanDisplay("map", post)).toBe(false)
    expect(lensCanDisplay("kanban", task)).toBe(true)
    expect(lensCanDisplay("kanban", post)).toBe(false)
    expect(lensCanDisplay("list", post)).toBe(true)
    // marketplace renders resources exclusively — a task escalates away
    expect(lensCanDisplay("marketplace", task, "task")).toBe(false)
    expect(lensCanDisplay("marketplace", post, "resource")).toBe(true)
    expect(lensForHints(place)).toBe("map")
    expect(lensForHints(task)).toBe("kanban")
    expect(lensForHints(post)).toBe("list")
  })
})
