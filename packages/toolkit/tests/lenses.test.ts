import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { Item } from "@real-life-stack/data-interface"
import { describe, expect, it, vi } from "vitest"

import { KanbanBoard } from "../src/components/kanban/kanban-board"
import { GridView } from "../src/components/lens/grid-view"
import { ListView } from "../src/components/lens/list-view"

function item(id: string, type: string, data: Record<string, unknown>, createdAt = "2026-07-08T10:00:00.000Z"): Item {
  return { id, type, createdAt, createdBy: "seed", data }
}

describe("read-only lenses", () => {
  it("1/3: ListView renders every non-relation item and no relation record", () => {
    const items = [
      item("task-1", "task", { title: "Aufgabe", status: "open" }),
      item("resource-1", "resource", { title: "Lötstation", kind: "tool" }),
      item("relation-1", "relation", { title: "Unsichtbare Kante", status: "open", kind: "tool" }),
    ]

    const markup = renderToStaticMarkup(createElement(ListView, { items }))

    expect(markup).toContain("Aufgabe")
    expect(markup).toContain("Lötstation")
    expect(markup).not.toContain("Unsichtbare Kante")
    expect(markup).not.toContain("<input")
  })

  it("1: GridView leaves relation records out while rendering type-specific cards", () => {
    const items = [
      item("person-ada", "person", { displayName: "Ada Lovelace", avatarUrl: "https://example.test/ada.png" }),
      item("project-rls", "project", { title: "Real Life Stack", website: "https://real-life-stack.org", repo: "https://github.com/real-life-org/real-life-stack" }),
      item("resource-1", "resource", { title: "Lötstation", kind: "tool", availability: "frei nutzbar" }),
      item("event-1", "event", { title: "Eröffnung", start: "2026-07-08T19:00:00+02:00" }),
      item("relation-1", "relation", { title: "Unsichtbare Kante" }),
    ]

    const markup = renderToStaticMarkup(createElement(GridView, { items }))

    expect(markup).toContain("Ada Lovelace")
    expect(markup).toContain("Website: https://real-life-stack.org")
    expect(markup).toContain("Repo: https://github.com/real-life-org/real-life-stack")
    expect(markup).toContain("frei nutzbar")
    expect(markup).toContain("Start: 2026-07-08T19:00:00+02:00")
    expect(markup).not.toContain("Unsichtbare Kante")
  })

  it("1/2/6: read-only resource board groups usable kind values only and exposes no drag action", () => {
    const onMoveItem = vi.fn()
    const onExternalDrop = vi.fn()
    const items = [
      item("resource-tool", "resource", { title: "Tool", kind: "tool" }, "2026-07-08T10:00:00.000Z"),
      item("resource-space", "resource", { title: "Space", kind: "space" }, "2026-07-08T11:00:00.000Z"),
      item("resource-skill", "resource", { title: "Skill", kind: "skill" }, "2026-07-08T12:00:00.000Z"),
      item("resource-empty", "resource", { title: "Ohne Art", kind: "  " }),
      item("relation-1", "relation", { title: "Unsichtbare Kante", kind: "tool" }),
    ]

    const markup = renderToStaticMarkup(createElement(KanbanBoard, {
      items,
      statusField: "kind",
      readOnly: true,
      onMoveItem,
      onExternalDrop,
    }))

    expect(markup).toContain(">tool<")
    expect(markup).toContain(">space<")
    expect(markup).toContain(">skill<")
    expect(markup).toContain("Tool")
    expect(markup).toContain("Space")
    expect(markup).toContain("Skill")
    expect(markup).not.toContain("Ohne Art")
    expect(markup).not.toContain("Unsichtbare Kante")
    expect(markup).not.toContain("draggable")
    expect(onMoveItem).not.toHaveBeenCalled()
    expect(onExternalDrop).not.toHaveBeenCalled()
  })

  it("6: default statusField remains status and read-only cards sort by createdAt, title, id", () => {
    const defaultMarkup = renderToStaticMarkup(createElement(KanbanBoard, {
      items: [item("task-done", "task", { title: "Fertig", status: "done" })],
      readOnly: true,
    }))
    expect(defaultMarkup).toContain("Erledigt")
    expect(defaultMarkup).toContain("Fertig")

    const markup = renderToStaticMarkup(createElement(KanbanBoard, {
      items: [
        item("resource-z", "resource", { title: "Alpha", kind: "tool" }, "2026-07-08T11:00:00.000Z"),
        item("resource-b", "resource", { title: "Alpha", kind: "tool" }, "2026-07-08T11:00:00.000Z"),
        item("resource-a", "resource", { title: "Zulu", kind: "tool" }, "2026-07-08T10:00:00.000Z"),
      ],
      statusField: "kind",
      readOnly: true,
    }))

    expect(markup.indexOf("Zulu")).toBeLessThan(markup.indexOf("Alpha"))
    const firstAlpha = markup.indexOf("Alpha")
    const secondAlpha = markup.indexOf("Alpha", firstAlpha + 1)
    expect(firstAlpha).toBeGreaterThan(-1)
    expect(secondAlpha).toBeGreaterThan(firstAlpha)
    expect(markup.indexOf('data-item-id="resource-b"')).toBeLessThan(
      markup.indexOf('data-item-id="resource-z"'),
    )
  })
})
