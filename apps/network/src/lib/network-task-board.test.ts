import type { Item } from "@real-life-stack/data-interface"
import { MockConnector } from "@real-life-stack/mock-connector"
import { defaultColumns, kanbanItemsByColumn } from "@real-life-stack/toolkit"
import { beforeAll, describe, expect, it } from "vitest"

import { buildDwebCampSeedItems } from "../data/network-seed"
import { moveNetworkTask, networkTaskBoardItems } from "./network-task-board"

let tasks: Item[]

beforeAll(async () => {
  tasks = networkTaskBoardItems(await buildDwebCampSeedItems())
})

describe("network task board", () => {
  it("6: projects its seven camp tasks into the default 3/2/2 workflow columns", () => {
    const byColumn = kanbanItemsByColumn(tasks, defaultColumns, "status", false)

    expect(tasks).toHaveLength(7)
    expect(byColumn.get("open")).toHaveLength(3)
    expect(byColumn.get("in-progress")).toHaveLength(2)
    expect(byColumn.get("done")).toHaveLength(2)
  })

  it("6: board drag writes status and target-column order through the ItemWriter", async () => {
    const connector = new MockConnector({
      items: [],
      groups: [{ id: "dwebcamp", name: "DWebCamp" }],
      users: [],
      groupMembers: { dwebcamp: [] },
      groupItems: { dwebcamp: [] },
    })
    connector.injectSeedItems(await buildDwebCampSeedItems(), "dwebcamp")
    connector.setCurrentGroup("dwebcamp")
    const visibleTasks = networkTaskBoardItems(await connector.getItems())
    const moved = visibleTasks.find(({ data }) => data.status === "open")
    expect(moved).toBeDefined()

    await moveNetworkTask(connector, visibleTasks, moved!.id, "done", 0)

    const updatedTasks = networkTaskBoardItems(await connector.getItems())
    const updatedMoved = updatedTasks.find(({ id }) => id === moved!.id)
    expect(updatedMoved?.data.status).toBe("done")
    expect(updatedMoved?.data.order).toBe(0)
    expect(updatedTasks.filter(({ data }) => data.status === "done")).toHaveLength(3)
    await connector.dispose()
  })
})
