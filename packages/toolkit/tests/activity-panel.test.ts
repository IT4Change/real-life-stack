import { createElement } from "react"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ActivityPanel } from "../src/components/activity/activity-panel"

describe("ActivityPanel", () => {
  it("11. ignores forward-compatible unknown actions and still renders known entries", () => {
    const html = renderToStaticMarkup(createElement(ActivityPanel, { entries: [
      { id: "future", ts: "2026-01-01T00:00:00.000Z", actor: "user-1", action: "future" as never, targetId: "x", targetType: "task", summary: "Must not render" },
      { id: "known", ts: "2026-01-01T00:00:01.000Z", actor: "user-1", action: "update", targetId: "y", targetType: "task", summary: "Visible update" },
    ] }))

    expect(html).toContain("Visible update")
    expect(html).not.toContain("Must not render")
  })

  it("A0 renders an unknown target type neutrally and never as an item link", () => {
    const html = renderToStaticMarkup(createElement(ActivityPanel, {
      entries: [{ id: "membership", ts: "2026-01-01T00:00:00.000Z", actor: "maria", action: "create", targetId: "did:example:toni", targetType: "membership", summary: "Toni" }],
      onOpenTarget: () => {}, isTargetOpenable: () => true,
    }))

    expect(html).toContain("maria</strong> · membership-Ereignis")
    expect(html).not.toContain("Toni")
    expect(html).not.toContain("<button")
  })
})
