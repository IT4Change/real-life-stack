// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import { createObservable, type ScopedActivityEntry } from "@real-life-stack/data-interface"
import { ConnectorProvider } from "../src/hooks/connector-context"
import { useMarkNotificationsSeen, useNotifications } from "../src/hooks/use-notifications"

function notificationEntry(id: string): ScopedActivityEntry {
  return { groupId: "other", targetExists: true, isPersonal: false, actor: { id: "maria", displayName: "Maria" }, subject: { id: "post", type: "post", createdBy: "self", title: "Post" }, entry: { id, ts: "2026-07-18T11:00:00.000Z", actor: "maria", action: "create", targetId: "post", targetType: "reaction", summary: "" } }
}

function connector() {
  const scoped = createObservable<ScopedActivityEntry[]>([])
  const notifications = createObservable({ readEntryKeys: {}, mutedGroupIds: {} })
  const updates = vi.fn(async (patch: { op: string; ts?: string }) => {
    if (patch.op === "markSeen") notifications.set({ ...notifications.current, lastSeenTs: patch.ts })
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
