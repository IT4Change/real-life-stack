// @vitest-environment jsdom
import { createElement } from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import { MockConnector } from "@real-life-stack/mock-connector"
import { KanbanBoard } from "@real-life-stack/toolkit"
import { handleKanbanDrag } from "./kanban-view"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("Kanban drag activity", () => {
  it("6. sends a rendered Kanban drop through the app drag handler and records an update", async () => {
    const connector = new MockConnector({
      items: [], groups: [], users: [{ id: "user-1", displayName: "User" }], groupMembers: {}, groupItems: {},
    })
    await connector.init()
    const task = await connector.createItem({ id: "task-1", type: "task", createdBy: "forged", data: { status: "open", order: 0, title: "Drag me" } })

    const container = document.createElement("div")
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(KanbanBoard, {
        items: [task],
        columns: [{ id: "open", label: "Open" }, { id: "done", label: "Done" }],
        onMoveItem: (id, status, position) =>
          handleKanbanDrag([task], id, status, position, (itemId, updates) => connector.updateItem(itemId, updates)),
      }))
    })

    const dataTransfer = { getData: () => task.id, setData: () => {}, effectAllowed: "move", dropEffect: "move" }
    const doneLabel = Array.from(container.querySelectorAll("span")).find((node) => node.textContent === "Done")
    const doneColumn = doneLabel?.closest('[class~="transition-colors"]')
    expect(doneColumn).not.toBeNull()
    const drop = new Event("drop", { bubbles: true, cancelable: true })
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer })
    await act(async () => { doneColumn!.dispatchEvent(drop) })

    await expect.poll(async () => (await connector.getActivity()).filter((entry) => entry.action === "update").length).toBe(1)
    expect((await connector.getItem(task.id))?.data.status).toBe("done")
    await act(async () => root.unmount())
  })
})
