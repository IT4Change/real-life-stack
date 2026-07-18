// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import type { Group, NotificationState, ScopedActivityEntry } from "@real-life-stack/data-interface"
import { NotificationCenter, projectNotifications, unreadHighPriorityKeys } from "../src/components/activity/notification-center"

const NOW = new Date("2026-07-18T12:00:00.000Z")
const state = (overrides: Partial<NotificationState> = {}): NotificationState => ({ readEntryKeys: {}, mutedGroupIds: {}, ...overrides })
const group = (id: string): Group => ({ id, name: `Gruppe ${id}`, data: { modules: ["feed", "map"] } } as Group)
const scoped = (overrides: Partial<ScopedActivityEntry> & { id: string }): ScopedActivityEntry => ({
  groupId: "a", targetExists: true, isPersonal: false,
  entry: { id: overrides.id, ts: "2026-07-18T11:00:00.000Z", actor: "maria", action: "create", targetId: "post", targetType: "post", summary: "Post" },
  subject: { id: "post", type: "post", createdBy: "anton", title: "Mein Post", moduleHints: { hasPosition: false, hasStart: false, hasStatus: false } },
  actor: { id: "maria", displayName: "Maria" }, ...overrides,
})
const project = (entries: ScopedActivityEntry[], notificationState = state()) => projectNotifications(entries, { groupsById: new Map([["a", group("a")], ["b", group("b")]]), selfId: "anton" }, notificationState, NOW)

describe("Notification Center contract", () => {
  it("B-T1 projects only live, non-personal, foreign candidates with the closed priority catalogue", () => {
    const candidates = project([
      scoped({ id: "reaction", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", action: "create" } }),
      scoped({ id: "own", actor: { id: "anton" } }),
      scoped({ id: "gone", targetExists: false, entry: { ...scoped({ id: "x" }).entry, targetType: "reaction" } }),
      scoped({ id: "personal", isPersonal: true }),
      scoped({ id: "delete", entry: { ...scoped({ id: "x" }).entry, action: "delete" }, subject: { id: "post", type: "post" } }),
    ])
    expect(candidates.map(({ entryId }) => entryId)).toEqual(["reaction", "delete"])
    expect(candidates[0]).toMatchObject({ semanticAction: "reacted", priority: "high", readKey: JSON.stringify(["a", "reaction"]) })
    expect(candidates[1]).toMatchObject({ semanticAction: "deleted", priority: "low" })
  })

  it("B-T2 collapses lifecycle before semantic bundles and keeps new constituent keys unread", () => {
    const entries = [
      scoped({ id: "create", entry: { ...scoped({ id: "x" }).entry, action: "create", ts: "2026-07-18T10:00:00.000Z" } }),
      scoped({ id: "update", entry: { ...scoped({ id: "x" }).entry, action: "update", ts: "2026-07-18T11:00:00.000Z" } }),
      scoped({ id: "delete", entry: { ...scoped({ id: "x" }).entry, action: "delete", ts: "2026-07-18T11:00:00.000Z" }, subject: { id: "post", type: "post" } }),
      scoped({ id: "r1", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", actor: "maria" } }),
      scoped({ id: "r2", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", actor: "toni", ts: "2026-07-18T10:30:00.000Z" } }),
      scoped({ id: "other-space", groupId: "b", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction" } }),
    ]
    const bundles = project(entries)
    expect(bundles.map((bundle) => [bundle.groupId, bundle.semanticAction])).toEqual(expect.arrayContaining([["a", "deleted"], ["a", "reacted"], ["b", "reacted"]]))
    expect(bundles.find((bundle) => bundle.entryId === "r1")?.actorCount).toBe(2)
    expect(bundles.find((bundle) => bundle.entryId === "r1")?.isRead).toBe(false)
  })

  it("B-T3 couples badge, seen frontier and read frontier including late arrivals", () => {
    const entries = [scoped({ id: "old", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", ts: "2026-07-18T10:00:00.000Z" } }), scoped({ id: "new", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", ts: "2026-07-18T11:00:00.000Z" } })]
    expect(unreadHighPriorityKeys(project(entries, state({ lastSeenTs: "2026-07-18T10:30:00.000Z", readUpToTs: "2026-07-18T10:30:00.000Z" })))).toEqual([JSON.stringify(["a", "new"])])
    expect(project(entries, state({ readUpToTs: "2026-07-18T11:00:00.000Z" })).every((bundle) => bundle.isRead)).toBe(true)
  })

  it("B-T4 uses real center controls for subject, group and non-navigable deletes", async () => {
    const host = document.createElement("div"); document.body.append(host)
    const root = createRoot(host); const subject = vi.fn(); const space = vi.fn()
    await act(async () => root.render(<NotificationCenter notifications={project([scoped({ id: "reaction", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction" } }), scoped({ id: "delete", entry: { ...scoped({ id: "x" }).entry, action: "delete" }, subject: { id: "post", type: "post" } })])} onOpenSubject={subject} onOpenGroup={space} />))
    const buttons = [...host.querySelectorAll("button")]
    await act(async () => (buttons.find((button) => button.textContent?.includes("Maria")) as HTMLButtonElement).click())
    await act(async () => (buttons.find((button) => button.textContent?.includes("Gruppe a")) as HTMLButtonElement).click())
    expect(subject).toHaveBeenCalledTimes(1); expect(space).toHaveBeenCalledWith("a")
    expect(host.textContent).toContain("gelöscht")
    root.unmount(); host.remove()
  })

  it("B-T5 leaves the raw activity panel contract independent of the center", () => {
    expect(project([])).toEqual([])
  })
})
