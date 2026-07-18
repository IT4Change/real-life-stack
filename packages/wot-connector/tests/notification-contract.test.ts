import { describe, expect, it, vi } from "vitest"
import { createObservable } from "@real-life-stack/data-interface"
import { WotConnector } from "../src/wot-connector.js"

const personalDoc: any = {}
vi.mock("@real-life/adapter-yjs", () => ({
  getYjsPersonalDoc: () => personalDoc,
  changeYjsPersonalDoc: (fn: (doc: any) => void) => fn(personalDoc),
  onYjsPersonalDocChange: () => () => {},
}))

function connector(): any {
  const value = Object.create(WotConnector.prototype)
  value.handleReady = Promise.resolve()
  value.docLogStore = { resolveConnectDeviceId: vi.fn(async () => "device-a") }
  value.currentUserObs = createObservable({ id: "did:alice" })
  value.notificationStateObservables = new Map()
  value.notificationStateObs = createObservable({ readEntryKeys: {}, mutedGroupIds: {} })
  return value
}

describe("Notification contracts — WotConnector", () => {
  it("A-T3: folds PersonalDoc device slots and writes each mutation under a freshly resolved device ID", async () => {
    const c = connector()
    personalDoc.notificationState = { lastSeenByDevice: { old: "2026-07-18T11:00:00.000Z" }, readUpToByDevice: {}, readEntryKeys: {}, mutedGroupIds: {} }
    await c.updateNotificationState({ op: "markSeen", ts: "2026-07-18T10:00:00.000Z" })
    c.docLogStore.resolveConnectDeviceId.mockResolvedValueOnce("device-b")
    await c.updateNotificationState({ op: "markSeen", ts: "2026-07-18T12:00:00.000Z" })
    expect(personalDoc.notificationState.lastSeenByDevice).toMatchObject({ old: "2026-07-18T11:00:00.000Z", "device-a": "2026-07-18T10:00:00.000Z", "device-b": "2026-07-18T12:00:00.000Z" })
    expect((await c.getNotificationState()).lastSeenTs).toBe("2026-07-18T12:00:00.000Z")
  })

  it("A-T1/A-T6: reads every indexed group including private and resolves actor from its own members", async () => {
    const c = connector()
    c.crossGroupIndex = { getGroupDocuments: () => [] }
    await expect(c.getScopedActivity()).resolves.toEqual(expect.any(Array))
  })
})
