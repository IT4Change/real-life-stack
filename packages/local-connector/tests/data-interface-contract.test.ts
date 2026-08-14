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
    // Fixture mode: the shared suite seeds foreign-author records to probe
    // the facade's collision/authorship rules — impossible through the
    // authoritative default ingress (it binds createdBy to the session).
    // The authoritative/trusted contract itself is covered in
    // vote-relation-store.contract.test.ts.
    const connector = new LocalConnector({
      items: [],
      groups: [{ id: "g1", name: "Contract Group" }, { id: "g2", name: "Move-Ziel" }],
      users: [{ id: "user-contract", displayName: "Contract User" }],
      groupMembers: { g1: ["user-contract"], g2: ["user-contract"] },
    }, { allowFixtureAuthors: true })
    await connector.init()
    const user = await connector.authenticate("local", {})
    return { connector, currentUserId: user.id }
  },
  async updatableGroup() {
    return "g1"
  },
  // Fixture-Modus (siehe makeConnector): der Harness simuliert mehrere Autoren.
  // Die regulaere Autorbindung deckt der connector-eigene Test ab.
  bindsAuthorToSession: false,
  // Der Fixture-Modus laesst createdBy durch — genau dafuer ist er da.
  async seedForeignItem({ connector }, item) {
    await connector.createItem(item as never)
  },
  // Zweiter Space aus dem Seed — echtes Ziel, damit der Move-Guard
  // tatsaechlich geprueft wird und nicht still uebersprungen.
  async movableTarget() {
    return "g2"
  },
})
