import { vi } from "vitest"
import { createObservable } from "@real-life-stack/data-interface"
import { describeDataInterfaceContract } from "@real-life-stack/data-interface/testing"
import { WotConnector } from "../src/wot-connector.js"
import type { RlsSpaceDoc } from "../src/types.js"

/**
 * Runs the shared DataInterface contract suite against the PRODUCTION
 * WotConnector methods, faking only the adapter boundary (the lightweight
 * activity-log harness pattern). Live observables need the full replication
 * runtime, so observe-reflection is covered by the connector's own
 * reactivity tests — the query/write contract runs here.
 */

const ME = "did:key:contract-user"

function doc(): RlsSpaceDoc {
  return { _type: "rls", items: {}, metadata: { name: "contract", modules: [] } }
}

function handle(value = doc()) {
  return {
    value,
    getDoc: () => value,
    transact: vi.fn((fn: (next: RlsSpaceDoc) => void) => { fn(value) }),
    transactDurable: vi.fn(async (fn: (next: RlsSpaceDoc) => void) => { fn(value) }),
    onRemoteUpdate: () => () => {},
    close: vi.fn(),
  }
}

describeDataInterfaceContract("WotConnector", {
  features: { observeReflectsWrites: false },
  async makeConnector() {
    const current = handle()
    const value = Object.create(WotConnector.prototype) as any
    value.handleReady = Promise.resolve()
    value.currentHandle = current
    value.currentGroupId = "space"
    value.currentUserObs = createObservable({ id: ME, displayName: "Contract User" })
    value.activityObservables = new Map()
    value.activityDirty = false
    value.activityReconciliations = new Map()
    value.handleOpenGeneration = 0
    value.crossGroupIndex = null
    value.itemCache = null
    value.itemObservables = new Map()
    value.itemByIdObservables = new Map()
    value.relatedObservables = new Map()
    value.relatedObservableParams = new Map()
    value.notifyAllObservers = vi.fn(() => { value.itemCache = null })
    return { connector: value as WotConnector, currentUserId: ME }
  },
})
