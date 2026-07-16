import { describe, expect, it } from "vitest"
import type { Group, Item, User } from "@real-life-stack/data-interface"
import {
  demoGroupItems,
  demoGroups,
  demoItems,
  demoUsers,
} from "@real-life-stack/data-interface/demo-data"
import { MockConnector, type MockConnectorSeed } from "../src/index"

const groups: Group[] = [
  { id: "dwebcamp", name: "DWebCamp" },
  { id: "my-network", name: "Mein Netzwerk" },
]

const users: User[] = [{ id: "user-1", displayName: "Test User" }]

const items: Item[] = [
  {
    id: "person-alice",
    type: "person",
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "user-1",
    data: { displayName: "Alice" },
  },
  {
    id: "project-commons",
    type: "project",
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "user-1",
    data: { title: "Commons" },
  },
]

const seed: MockConnectorSeed = {
  items,
  groups,
  users,
  groupMembers: {
    dwebcamp: ["user-1"],
    "my-network": [],
  },
  groupItems: {
    dwebcamp: ["person-alice", "project-commons"],
    "my-network": [],
  },
}

describe("MockConnector seed injection", () => {
  it("uses injected items, groups, users, memberships, and group scopes", async () => {
    const connector = new MockConnector(seed)

    expect(await connector.getGroups()).toEqual(groups)
    expect(await connector.getCurrentUser()).toEqual(users[0])
    expect(await connector.getMembers("dwebcamp")).toEqual(users)

    connector.setCurrentGroup("dwebcamp")
    expect(await connector.getItems()).toEqual(items)

    connector.setCurrentGroup("my-network")
    expect(await connector.getItems()).toEqual([])
  })

  it("keeps the parameterless demo-data behavior unchanged", async () => {
    const connector = new MockConnector()

    expect(connector.getCurrentGroup()).toBeNull()
    expect(await connector.getCurrentUser()).toEqual(demoUsers[0])
    expect(await connector.getGroups()).toEqual(
      demoGroups.filter((group) => group.data?.scope !== "aggregate"),
    )
    expect(await connector.getItems()).toEqual(demoItems)

    const [groupId, groupItemIds] = Object.entries(demoGroupItems)[0]
    connector.setCurrentGroup(groupId)
    expect((await connector.getItems()).map((item) => item.id)).toEqual(
      demoItems
        .filter((item) => groupItemIds.includes(item.id) || item.type === "feature")
        .map((item) => item.id),
    )
  })
})
