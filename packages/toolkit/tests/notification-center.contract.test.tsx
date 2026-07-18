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
  subject: { id: "post", type: "post", createdBy: "anton", title: "Mein Post", moduleHints: { hasPosition: false, hasStart: false, hasStatus: false } },
  actor: { id: "maria", displayName: "Maria" }, ...overrides,
  entry: { ts: "2026-07-18T11:00:00.000Z", actor: "maria", action: "create", targetId: "post", targetType: "post", summary: "Post", ...overrides.entry, id: overrides.id },
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
      scoped({ id: "comment-delete", entry: { ...scoped({ id: "x" }).entry, action: "delete", targetType: "comment" } }),
      scoped({ id: "reaction-delete", entry: { ...scoped({ id: "x" }).entry, action: "delete", targetType: "reaction" } }),
      scoped({ id: "unknown", entry: { ...scoped({ id: "x" }).entry, action: "update", targetType: "reaction" } }),
      scoped({ id: "missing-owner", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction" }, subject: { id: "post", type: "post" } }),
    ])
    expect(candidates.map(({ entryId }) => entryId)).toEqual(expect.arrayContaining(["delete", "reaction"]))
    expect(candidates.find(({ entryId }) => entryId === "reaction")).toMatchObject({ semanticAction: "reacted", priority: "high", readKey: JSON.stringify(["a", "reaction"]) })
    expect(candidates.find(({ entryId }) => entryId === "delete")).toMatchObject({ semanticAction: "deleted", priority: "low" })
    expect(candidates.map(({ entryId }) => entryId)).not.toEqual(expect.arrayContaining(["comment-delete", "reaction-delete", "unknown"]))
    const missingOwner = scoped({ id: "missing-owner", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction" }, subject: { id: "other", type: "post" } })
    expect(project([missingOwner])[0]).toMatchObject({ priority: "low" })
    const mutedState = state({ mutedGroupIds: { b: true } })
    expect(unreadHighPriorityKeys(project([scoped({ id: "muted", groupId: "b", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction" } })], mutedState), mutedState)).toEqual([])
  })

  it("B-T2 collapses lifecycle before semantic bundles and keeps new constituent keys unread", () => {
    const entries = [
      scoped({ id: "create", entry: { ...scoped({ id: "x" }).entry, action: "create", ts: "2026-07-18T10:00:00.000Z" } }),
      scoped({ id: "update", entry: { ...scoped({ id: "x" }).entry, action: "update", ts: "2026-07-18T11:00:00.000Z" } }),
      scoped({ id: "delete", entry: { ...scoped({ id: "x" }).entry, action: "delete", ts: "2026-07-18T11:00:00.000Z" }, subject: { id: "post", type: "post" } }),
      scoped({ id: "r1", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", actor: "maria" } }),
      scoped({ id: "r2", actor: { id: "toni" }, entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", actor: "toni", ts: "2026-07-18T10:30:00.000Z" } }),
      scoped({ id: "other-space", groupId: "b", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction" } }),
    ]
    const bundles = project(entries)
    expect(bundles.map((bundle) => [bundle.groupId, bundle.semanticAction])).toEqual(expect.arrayContaining([["a", "deleted"], ["a", "reacted"], ["b", "reacted"]]))
    expect(bundles.find((bundle) => bundle.entryId === "r1")?.actorCount).toBe(2)
    expect(bundles.find((bundle) => bundle.entryId === "r1")?.isRead).toBe(false)
    const equalTs = project([scoped({ id: "a", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", ts: "2026-07-18T11:00:00.000Z", actor: "a" }, actor: { id: "a" } }), scoped({ id: "b", entry: { ...scoped({ id: "x" }).entry, targetType: "comment", ts: "2026-07-18T11:00:00.000Z", actor: "b" }, actor: { id: "b" } })])
    expect(equalTs.map(({ semanticAction }) => semanticAction)).toEqual(expect.arrayContaining(["reacted", "commented"]))
    // Vollständige Gleichstands-Kaskade: gleicher ts + gleiche Lifecycle-Stufe
    // → actorId absteigend entscheidet; gleicher actor → entryId absteigend.
    const actorTie = project([
      scoped({ id: "u1", actor: { id: "anna" }, entry: { ...scoped({ id: "x" }).entry, action: "update", actor: "anna", ts: "2026-07-18T11:00:00.000Z" } }),
      scoped({ id: "u2", actor: { id: "zoe" }, entry: { ...scoped({ id: "x" }).entry, action: "update", actor: "zoe", ts: "2026-07-18T11:00:00.000Z" } }),
    ])
    expect(actorTie.find(({ semanticAction }) => semanticAction === "updated")?.actorId).toBe("zoe")
    const entryTie = project([
      scoped({ id: "e1", entry: { ...scoped({ id: "x" }).entry, action: "update", ts: "2026-07-18T11:00:00.000Z" } }),
      scoped({ id: "e2", entry: { ...scoped({ id: "x" }).entry, action: "update", ts: "2026-07-18T11:00:00.000Z" } }),
    ])
    expect(entryTie.find(({ semanticAction }) => semanticAction === "updated")?.entryId).toBe("e2")
    const boundary = project([scoped({ id: "newest", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", ts: "2026-07-18T11:00:00.000Z" } }), scoped({ id: "inside", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", ts: "2026-07-17T11:00:00.000Z" } }), scoped({ id: "outside", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", ts: "2026-07-17T10:59:59.999Z" } })])
    expect(boundary).toHaveLength(2)
    expect(boundary.find(({ entryId }) => entryId === "newest")?.readKeys).toMatchObject({ [JSON.stringify(["a", "inside"])]: "2026-07-17T11:00:00.000Z" })
  })

  it("B-T3 couples badge, seen frontier and read frontier including late arrivals", () => {
    const entries = [scoped({ id: "old", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", ts: "2026-07-18T10:00:00.000Z" } }), scoped({ id: "new", entry: { ...scoped({ id: "x" }).entry, targetType: "reaction", ts: "2026-07-18T11:00:00.000Z" } })]
    const seen = state({ lastSeenTs: "2026-07-18T10:30:00.000Z", readUpToTs: "2026-07-18T10:30:00.000Z" })
    expect(unreadHighPriorityKeys(project(entries, seen), seen)).toEqual([JSON.stringify(["a", "new"])])
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
    const groupTab = [...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Gruppen") as HTMLButtonElement
    await act(async () => groupTab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })))
    expect([...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Gruppen")?.getAttribute("aria-selected")).toBe("true")
    expect(host.textContent).toContain("gelöscht")
    root.unmount(); host.remove()
  })

  it("B-T5 leaves the raw activity panel contract independent of the center", async () => {
    // The raw history stays reachable (footer handoff) and the existing
    // ActivityPanel keeps rendering its entries untouched by center state.
    const { ActivityPanel } = await import("../src/components/activity/activity-panel")
    const host = document.createElement("div"); document.body.append(host)
    const root = createRoot(host); const openActivity = vi.fn()
    await act(async () => root.render(<NotificationCenter notifications={[]} onOpenActivity={openActivity} />))
    const footer = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Alle Benachrichtigungen ansehen"))
    expect(footer, "footer handoff to the raw history").toBeTruthy()
    await act(async () => footer!.click())
    expect(openActivity).toHaveBeenCalledTimes(1)
    await act(async () => root.render(<ActivityPanel entries={[{ id: "e1", ts: "2026-07-18T11:00:00.000Z", actor: "maria", action: "create", targetId: "post", targetType: "post", summary: "Mein Post" }]} />))
    expect(host.textContent).toContain("Mein Post")
    expect(host.textContent).toContain("erstellt")
    root.unmount(); host.remove()
  })
})
