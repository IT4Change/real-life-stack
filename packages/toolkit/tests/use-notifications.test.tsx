// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import { applyNotificationStatePatch, createObservable, type ScopedActivityEntry } from "@real-life-stack/data-interface"
import { ConnectorProvider } from "../src/hooks/connector-context"
import { useMarkNotificationsSeen, useNotifications } from "../src/hooks/use-notifications"
import { NotificationCenter } from "../src/components/activity/notification-center"

function notificationEntry(id: string): ScopedActivityEntry {
  return { groupId: "other", targetExists: true, isPersonal: false, actor: { id: "maria", displayName: "Maria" }, subject: { id: "post", type: "post", createdBy: "self", title: "Post" }, entry: { id, ts: "2026-07-18T11:00:00.000Z", actor: "maria", action: "create", targetId: "post", targetType: "reaction", summary: "" } }
}

function connector() {
  const scoped = createObservable<ScopedActivityEntry[]>([])
  const notifications = createObservable({ readEntryKeys: {}, mutedGroupIds: {} })
  const updates = vi.fn(async (patch: Parameters<typeof applyNotificationStatePatch>[1]) => {
    notifications.set(applyNotificationStatePatch(notifications.current, patch))
  })
  const groups = createObservable([{ id: "other", name: "Andere", data: {} }])
  const user = createObservable({ id: "self", displayName: "Self" })
  return { scoped, updates, stateObs: notifications, getScopedActivity: async () => scoped.current, observeScopedActivity: () => scoped, observeNotificationState: () => notifications, updateNotificationState: updates, getNotificationState: async () => notifications.current,
    getGroups: async () => groups.current, observeGroups: () => groups, getMembers: async () => [], observeMembers: () => createObservable([]), getCurrentGroup: () => groups.current[0], observeCurrentGroup: () => createObservable(groups.current[0]), setCurrentGroup: () => {}, createGroup: async () => groups.current[0], updateGroup: async () => groups.current[0], deleteGroup: async () => {}, inviteMember: async () => {}, removeMember: async () => {},
    getCurrentUser: async () => user.current, observeCurrentUser: () => user, getUser: async () => user.current, getAuthState: () => createObservable({ status: "authenticated" as const }), getAuthMethods: () => [], authenticate: async () => user.current, logout: async () => {},
  }
}

function Probe({ markSeen = false }: { markSeen?: boolean }) {
  const result = useNotifications()
  if (markSeen) useMarkNotificationsSeen(result)
  return <output data-badge={result.badgeCount} data-count={result.notifications.length} />
}

describe("useNotifications", () => {
  it("reprojects each scoped activity emission and keeps its mutation stable", async () => {
    const fake = connector(); const host = document.createElement("div"); const root = createRoot(host); document.body.append(host)
    await act(async () => root.render(createElement(ConnectorProvider, { connector: fake as never }, createElement(Probe))))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); fake.scoped.set([notificationEntry("new")]) })
    expect(host.querySelector("output")?.dataset).toMatchObject({ count: "1", badge: "1" })
    root.unmount(); host.remove()
  })

  it("marks the frontier exactly once for a center opening despite cloned state emissions", async () => {
    const fake = connector(); const host = document.createElement("div"); const root = createRoot(host); document.body.append(host)
    fake.scoped.set([notificationEntry("new")])
    await act(async () => root.render(createElement(ConnectorProvider, { connector: fake as never }, createElement(Probe, { markSeen: true }))))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(fake.updates).toHaveBeenCalledTimes(1)
    expect(fake.updates).toHaveBeenCalledWith({ op: "markSeen", ts: "2026-07-18T11:00:00.000Z" })

    // A state RESET (logout/re-login wipes lastSeenTs) with the SAME maxTs is
    // a new, legitimate write — the guard must not suppress it (Sol SF1).
    await act(async () => { fake.stateObs.set({ readEntryKeys: {}, mutedGroupIds: {} }) })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(fake.updates).toHaveBeenCalledTimes(2)
    root.unmount(); host.remove()
  })
})

function CenterProbe() {
  const result = useNotifications()
  return createElement(NotificationCenter, {
    notifications: result.notifications,
    onMarkRead: (keys) => void result.update?.({ op: "markRead", keys }),
    onMarkAllRead: () => result.maxTs && void result.update?.({ op: "markAllReadUpTo", ts: result.maxTs }),
    onOpenSubject: () => {},
  })
}

describe("Center read-state integration (Repro Anton 19.07.)", () => {
  it("'Alle als gelesen' clears the unread dots through the real state round-trip", async () => {
    const fake = connector(); const host = document.createElement("div"); const root = createRoot(host); document.body.append(host)
    fake.scoped.set([notificationEntry("n1")])
    await act(async () => root.render(createElement(ConnectorProvider, { connector: fake as never }, createElement(CenterProbe))))
    expect(host.querySelectorAll('[aria-label="Ungelesen"]').length).toBeGreaterThan(0)
    const button = [...host.querySelectorAll("button")].find((el) => el.textContent === "Alle als gelesen")
    expect(button, "mark-all button rendered").toBeTruthy()
    await act(async () => { button!.click(); await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(host.querySelectorAll('[aria-label="Ungelesen"]')).toHaveLength(0)
    root.unmount(); host.remove()
  })

  it("clicking a notification marks its bundle read (dot disappears)", async () => {
    const fake = connector(); const host = document.createElement("div"); const root = createRoot(host); document.body.append(host)
    fake.scoped.set([notificationEntry("n1")])
    await act(async () => root.render(createElement(ConnectorProvider, { connector: fake as never }, createElement(CenterProbe))))
    const row = [...host.querySelectorAll("button")].find((el) => el.textContent?.includes("Maria"))
    expect(row, "subject row rendered").toBeTruthy()
    await act(async () => { row!.click(); await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(host.querySelectorAll('[aria-label="Ungelesen"]')).toHaveLength(0)
    root.unmount(); host.remove()
  })
})
