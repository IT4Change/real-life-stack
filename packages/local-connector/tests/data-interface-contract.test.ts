import { vi } from "vitest"
import { describeDataInterfaceContract } from "@real-life-stack/data-interface/testing"

// Mock idb-keyval (no IndexedDB in Node)
vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn(async (_key: string, updater: (value: unknown) => unknown) => { updater(undefined) }),
  del: vi.fn().mockResolvedValue(undefined),
  createStore: vi.fn().mockReturnValue({}),
}))

// Mock BroadcastChannel (not available in Node)
vi.stubGlobal("BroadcastChannel", class {
  onmessage = null
  postMessage() {}
  close() {}
})

import { LocalConnector } from "../src/local-connector.js"

describeDataInterfaceContract("LocalConnector", {
  async makeConnector() {
    const connector = new LocalConnector({
      items: [],
      groups: [{ id: "g1", name: "Contract Group" }],
      users: [{ id: "user-contract", displayName: "Contract User" }],
      groupMembers: { g1: ["user-contract"] },
    })
    await connector.init()
    const user = await connector.authenticate("local", {})
    return { connector, currentUserId: user.id }
  },
})
