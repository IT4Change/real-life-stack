import { describeDataInterfaceContract } from "@real-life-stack/data-interface/testing"
import { MockConnector } from "../src/mock-connector.js"

describeDataInterfaceContract("MockConnector", {
  async makeConnector() {
    const connector = new MockConnector({
      items: [],
      groups: [{ id: "g1", name: "Contract Group", data: {} }],
      users: [{ id: "user-contract", displayName: "Contract User" }],
      groupMembers: { g1: ["user-contract"] },
      groupItems: {},
    } as never, { allowFixtureAuthors: true })
    await connector.init()
    const user = await connector.getCurrentUser()
    if (!user) throw new Error("MockConnector should start authenticated")
    return { connector, currentUserId: user.id }
  },
  async updatableGroup() {
    return "g1"
  },
})
