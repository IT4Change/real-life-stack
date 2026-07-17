import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { Item } from "@real-life-stack/data-interface"
import { describe, expect, it, vi } from "vitest"

import { KanbanBoard } from "../src/components/kanban/kanban-board"
import { kanbanItemsByColumn, defaultColumns } from "../src/components/kanban/kanban-board"
import { focusActiveItemOnce } from "../src/lib/selection-focus"
import { formatEventRange } from "../src/components/preview/item-meta-row"
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
    expect(markup.match(/data-preview-density="compact"/g)).toHaveLength(2)
  })

  it("1: GridView leaves relation records out while composing comfortable ItemPreview adornments", () => {
    const items = [
      item("person-ada", "person", { displayName: "Ada Lovelace", avatarUrl: "https://example.test/ada.png" }),
      item("project-rls", "project", { title: "Real Life Stack", website: "https://real-life-stack.org", repo: "https://github.com/real-life-org/real-life-stack" }),
      item("resource-1", "resource", { title: "Lötstation", kind: "tool", availability: "frei nutzbar" }),
      item("event-1", "event", { title: "Eröffnung", start: "2026-07-08T19:00:00+02:00" }),
      item("initiative-1", "initiative", { title: "Offene Werkstatt" }),
      item("relation-1", "relation", { title: "Unsichtbare Kante" }),
    ]

    const markup = renderToStaticMarkup(createElement(GridView, { items }))

    expect(markup).toContain("Ada Lovelace")
    expect(markup).toContain('data-slot="avatar"')
    expect(markup).toContain(">AL<")
    expect(markup).toContain("Website: https://real-life-stack.org")
    expect(markup).toContain("Repo: https://github.com/real-life-org/real-life-stack")
    expect(markup).toContain(">tool<")
    expect(markup).toContain("frei nutzbar")
    expect(markup).toContain(formatEventRange("2026-07-08T19:00:00+02:00"))
    expect(markup).toContain(">initiative<")
    expect(markup).not.toContain("Unsichtbare Kante")
    expect(markup.match(/data-preview-density="comfortable"/g)).toHaveLength(5)
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
    expect(markup.match(/data-preview-density="compact"/g)).toHaveLength(3)
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

  it("2: Board membership is field-based, excludes archived defaults and never includes relations", () => {
    const grouped = kanbanItemsByColumn([
      item("task-open", "task", { title: "Offen", status: "open" }),
      item("task-archived", "task", { title: "Archiviert", status: "archived" }),
      item("task-empty", "task", { title: "Kein Status" }),
      item("relation-open", "relation", { title: "Kante", status: "open" }),
    ], defaultColumns, "status", true)

    expect(grouped.get("open")?.map(({ id }) => id)).toEqual(["task-open"])
    expect(grouped.get("in-progress")).toEqual([])
    expect(grouped.get("done")).toEqual([])
  })

  it("8: List, Grid and Board pass the active item to ItemPreview with the default glow", () => {
    const items = [item("task-1", "task", { title: "Aktive Aufgabe", status: "open" })]
    const listMarkup = renderToStaticMarkup(createElement(ListView, { items, activeItemId: "task-1" }))
    const gridMarkup = renderToStaticMarkup(createElement(GridView, { items, activeItemId: "task-1" }))
    const boardMarkup = renderToStaticMarkup(createElement(KanbanBoard, {
      items,
      activeItemId: "task-1",
      readOnly: true,
    }))

    for (const markup of [listMarkup, gridMarkup, boardMarkup]) {
      expect(markup).toContain('data-active-preview="true"')
      expect(markup).toContain("box-shadow:")
      expect(markup).toContain("#64748b")
    }
  })

  it("8: selection focus gates by active id and does not consume a missing target", () => {
    const scrollIntoView = vi.fn()
    const target = { scrollIntoView }
    const focus = (element: typeof target) => element.scrollIntoView({ block: "center" })

    let gate = focusActiveItemOnce(null, "task-1", null, focus)
    expect(gate).toBeNull()
    expect(scrollIntoView).not.toHaveBeenCalled()

    gate = focusActiveItemOnce(gate, "task-1", target, focus)
    expect(gate).toBe("task-1")
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "center" })

    gate = focusActiveItemOnce(gate, "task-1", target, focus)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    gate = focusActiveItemOnce(gate, "task-2", target, focus)
    expect(gate).toBe("task-2")
    expect(scrollIntoView).toHaveBeenCalledTimes(2)

    expect(focusActiveItemOnce(gate, null, target, focus)).toBeNull()
  })
})
