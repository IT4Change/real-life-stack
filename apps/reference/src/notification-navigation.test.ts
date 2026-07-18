// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import type { Group } from "@real-life-stack/data-interface"
import { NotificationCenter, type NotificationCandidate } from "@real-life-stack/toolkit"
import { buildNotificationRoute } from "./notification-navigation"

const groups: Group[] = [
  { id: "garten", name: "Gartenprojekt", data: { modules: ["feed", "map", "kanban", "calendar"] } },
  { id: "nachbarn", name: "Nachbarschaft", data: { modules: ["feed"] } },
]

function candidate(overrides: Partial<NotificationCandidate>): NotificationCandidate {
  const readKey = JSON.stringify(["garten", "e1"])
  return {
    groupId: "garten", groupName: "Gartenprojekt", subjectId: "p1", subjectType: "post", subjectTitle: "Test",
    semanticAction: "reacted", priority: "high", muted: false,
    entryId: "e1", readKey, actorId: "did:maria", actor: { id: "did:maria", displayName: "Maria" },
    ts: "2026-07-18T10:00:00.000Z", targetExists: true,
    readKeys: { [readKey]: "2026-07-18T10:00:00.000Z" }, actorCount: 1, isRead: false,
    ...overrides,
  } as NotificationCandidate
}

import { moduleCanDisplay } from "./notification-navigation"

describe("Linsen-Eskalation — moduleCanDisplay", () => {
  const task = { hasPosition: false, hasStart: false, hasStatus: true }
  const place = { hasPosition: true, hasStart: false, hasStatus: false }
  const event = { hasPosition: false, hasStart: true, hasStatus: false }
  it("feed shows only content/start items — pure tasks and places escalate", () => {
    expect(moduleCanDisplay("feed", task, "task")).toBe(false)
    expect(moduleCanDisplay("feed", place, "place")).toBe(false)
    expect(moduleCanDisplay("feed", event, "event")).toBe(true)
    expect(moduleCanDisplay("feed", { hasPosition: false, hasStart: false, hasStatus: false }, "post")).toBe(true)
    expect(moduleCanDisplay("kanban", task, "task")).toBe(true)
    expect(moduleCanDisplay("map", task, "task")).toBe(false)
  })
  it("unknown scope (overview) resolves against the full module set, not just feed", () => {
    expect(buildNotificationRoute(candidate({ groupId: "__overview__", moduleHints: { hasPosition: false, hasStart: false, hasStatus: true } }), groups))
      .toBe("/__overview__/kanban/p1")
  })
})

describe("B-T4 — Klick-Sprünge über die echten App-Verträge", () => {
  it("builds ONE canonical cross-group route with the module from the shared resolver", () => {
    expect(buildNotificationRoute(candidate({ moduleHints: { hasPosition: true, hasStart: false, hasStatus: false } }), groups))
      .toBe("/garten/map/p1")
    expect(buildNotificationRoute(candidate({ moduleHints: { hasPosition: false, hasStart: true, hasStatus: false } }), groups))
      .toBe("/garten/calendar/p1")
    // A group without the hinted module falls back through the resolver.
    expect(buildNotificationRoute(candidate({ groupId: "nachbarn", moduleHints: { hasPosition: true, hasStart: false, hasStatus: false } }), groups))
      .toBe("/nachbarn/feed/p1")
    // No hints (e.g. plain post) → default module.
    expect(buildNotificationRoute(candidate({}), groups)).toBe("/garten/feed/p1")
  })

  it("a rendered subject click travels through the real route builder exactly once", async () => {
    const navigations: string[] = []
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const target = candidate({ moduleHints: { hasPosition: false, hasStart: false, hasStatus: true }, subjectType: "task", subjectTitle: "Duschen putzen" })
    await act(async () => {
      root.render(createElement(NotificationCenter, {
        notifications: [target],
        onOpenSubject: (notification: NotificationCandidate) => navigations.push(buildNotificationRoute(notification, groups)),
      }))
    })
    const listItem = [...host.querySelectorAll("li")].find((li) => li.textContent?.includes("Duschen putzen"))
    expect(listItem, "notification row rendered").toBeTruthy()
    const row = listItem!.querySelector("button")
    expect(row, "clickable subject sentence rendered").toBeTruthy()
    await act(async () => { row!.click() })
    expect(navigations).toEqual(["/garten/kanban/p1"])
    await act(async () => { root.unmount() })
    host.remove()
  })

  it("deleted candidates render without a clickable subject", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const tombstone = candidate({ semanticAction: "deleted", priority: "low", moduleHints: undefined, subjectTitle: "Wegposten", subjectId: "p9", targetExists: false })
    const clicks: string[] = []
    await act(async () => {
      root.render(createElement(NotificationCenter, {
        notifications: [tombstone],
        onOpenSubject: (notification: NotificationCandidate) => clicks.push(notification.subjectId),
      }))
    })
    // deleted ist Niedrig-Prio → im „Gruppen"-Tab sichtbar
    const groupsTab = [...host.querySelectorAll("button, [role=tab]")].find((el) => el.textContent?.trim() === "Gruppen")
    expect(groupsTab, "Gruppen tab rendered").toBeTruthy()
    await act(async () => {
      // Radix TabsTrigger aktiviert auf mousedown, nicht erst auf click
      groupsTab!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
      ;(groupsTab as HTMLElement).click()
    })
    const listItem = [...host.querySelectorAll("li")].find((li) => li.textContent?.includes("Wegposten"))
    expect(listItem, "tombstone row rendered").toBeTruthy()
    // The sentence itself must NOT be a button; only the group-name link may be.
    const sentenceButton = [...listItem!.querySelectorAll("button")].find((button) => !button.textContent?.includes("Gartenprojekt"))
    if (sentenceButton) await act(async () => { sentenceButton.click() })
    expect(clicks).toEqual([])
    await act(async () => { root.unmount() })
    host.remove()
  })
})
