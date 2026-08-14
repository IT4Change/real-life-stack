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

// Real Ed25519 identity: the WoT connector is a signed-mode connector — its
// relation facade claims authorial writes and REFUSES unverifiable signers.
async function makeIdentity() {
  const keyPair = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey))
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
  const bytes = new Uint8Array([0xed, 0x01, ...raw])
  let n = 0n
  for (const byte of bytes) n = (n << 8n) | BigInt(byte)
  let encoded = ""
  while (n > 0n) { encoded = B58[Number(n % 58n)] + encoded; n /= 58n }
  return {
    did: `did:key:z${encoded}`,
    signEd25519: async (input: Uint8Array) =>
      new Uint8Array(await crypto.subtle.sign("Ed25519", keyPair.privateKey, input as BufferSource)),
  }
}

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
  async makeConnector() {
    const identity = await makeIdentity()
    const current = handle()
    const value = Object.create(WotConnector.prototype) as any
    value.handleReady = Promise.resolve()
    value.currentHandle = current
    value.currentGroupId = "space"
    value.currentUserObs = createObservable({ id: identity.did, displayName: "Contract User" })
    value.identity = { getDid: () => identity.did, signEd25519: identity.signEd25519 }
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
    return { connector: value as WotConnector, currentUserId: identity.did }
  },
  // Direkt ins Space-Dokument, ohne Ingress: genau so taucht ein fremdes
  // Item in Wirklichkeit auf — es kommt per Sync von einem anderen Geraet.
  async seedForeignItem({ connector }, item) {
    const doc = (connector as unknown as { currentHandle: { getDoc(): { items: Record<string, unknown> } } })
      .currentHandle.getDoc()
    doc.items[item.id] = {
      id: item.id,
      type: item.type,
      createdBy: item.createdBy,
      createdAt: "2026-08-01T00:00:00.000Z",
      data: item.data ?? {},
      ...(item.relations ? { relations: item.relations } : {}),
    }
  },
})
