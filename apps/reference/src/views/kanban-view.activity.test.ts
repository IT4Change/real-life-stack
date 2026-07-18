import { describe, expect, it } from "vitest"
import { MockConnector } from "@real-life-stack/mock-connector"
import { handleKanbanDrag } from "./kanban-view"

describe("Kanban drag activity", () => {
  it("6. runs the app drag handler through the connector and records an update", async () => {
    const connector = new MockConnector({
      items: [], groups: [], users: [{ id: "user-1", displayName: "User" }], groupMembers: {}, groupItems: {},
    })
    await connector.init()
    const task = await connector.createItem({ id: "task-1", type: "task", createdBy: "forged", data: { status: "open", order: 0, title: "Drag me" } })

    handleKanbanDrag([task], task.id, "done", 0, (id, updates) => connector.updateItem(id, updates))

    await expect.poll(async () => (await connector.getActivity()).filter((entry) => entry.action === "update").length).toBe(1)
    expect((await connector.getItem(task.id))?.data.status).toBe("done")
  })
})
