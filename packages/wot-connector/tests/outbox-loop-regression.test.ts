import { afterEach, describe, expect, it } from "vitest"
import * as Y from "yjs"
import { IdentityWorkflow } from "@real-life/wot-core/application"
import {
  InMemoryDocLogStore,
  InMemoryMessagingAdapter,
  InMemoryOutboxStore,
  InProcessLogBroker,
} from "@real-life/wot-core/adapters"
import { WebCryptoProtocolCryptoAdapter } from "@real-life/wot-core"
import { LOG_ENTRY_MESSAGE_TYPE } from "@real-life/wot-core/protocol"
import type { WireMessage } from "@real-life/wot-core/ports"
import { YjsPersonalLogSyncAdapter } from "@real-life/adapter-yjs"

import { createOutboxMessagingRuntime } from "../src/messaging-runtime.js"

const DEVICE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const DEVICE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error("Timed out waiting for condition")
}

function countSuccessfulLogSends(messaging: InMemoryMessagingAdapter) {
  let count = 0
  const baseSend = messaging.send.bind(messaging)
  messaging.send = async (message: WireMessage) => {
    const receipt = await baseSend(message)
    if (message.type === LOG_ENTRY_MESSAGE_TYPE && receipt.status === "accepted") count += 1
    return receipt
  }
  return () => count
}

describe("WoT connector outbox/log wiring — 5000+ loop regression", () => {
  afterEach(() => {
    InMemoryMessagingAdapter.resetAll()
  })

  it("keeps offline log writes only in DocLogStore, drains on reconnect, and never echoes", async () => {
    InMemoryMessagingAdapter.resetAll()
    const protocolCrypto = new WebCryptoProtocolCryptoAdapter()
    const identity = (await new IdentityWorkflow({ crypto: protocolCrypto }).createIdentity({
      passphrase: "test-only",
      storeSeed: false,
    })).identity
    const did = identity.getDid()
    const broker = new InProcessLogBroker()

    const rawA = new InMemoryMessagingAdapter({ broker, socketId: "device-a" })
    const rawB = new InMemoryMessagingAdapter({ broker, socketId: "device-b" })
    const genericOutboxA = new InMemoryOutboxStore()
    const genericOutboxB = new InMemoryOutboxStore()
    const messagingA = createOutboxMessagingRuntime({
      messaging: rawA,
      outboxStore: genericOutboxA,
      trace: false,
    })
    const messagingB = createOutboxMessagingRuntime({
      messaging: rawB,
      outboxStore: genericOutboxB,
      trace: false,
    })
    await messagingA.connect(did)
    await messagingB.connect(did)

    const logA = new InMemoryDocLogStore()
    const logB = new InMemoryDocLogStore()
    await logA.init()
    await logB.init()
    await logA.setDeviceId(DEVICE_A)
    await logB.setDeviceId(DEVICE_B)

    const docA = new Y.Doc()
    const docB = new Y.Doc()
    const personalKey = await identity.deriveFrameworkKey("personal-doc-v1")
    const docId = crypto.randomUUID()
    const syncA = new YjsPersonalLogSyncAdapter({
      doc: docA,
      messaging: messagingA,
      identity,
      personalKey,
      docId,
      docLogStore: logA,
      deviceId: DEVICE_A,
    })
    const syncB = new YjsPersonalLogSyncAdapter({
      doc: docB,
      messaging: messagingB,
      identity,
      personalKey,
      docId,
      docLogStore: logB,
      deviceId: DEVICE_B,
    })
    const sentA = countSuccessfulLogSends(rawA)
    const sentB = countSuccessfulLogSends(rawB)

    syncA.start()
    syncB.start()
    await waitFor(() => syncA.getCoordinator() !== null && syncB.getCoordinator() !== null)
    await Promise.all([
      syncA.getCoordinator()!.catchUp(),
      syncB.getCoordinator()!.catchUp(),
    ])
    // Prime first-publication while online. Subsequent offline writes then pass
    // the cached publication gate, append durably, and fail only at transport.
    docA.getMap("profile").set("online-primer", "ready")
    await waitFor(() => docB.getMap("profile").get("online-primer") === "ready")
    await waitFor(async () => (await logA.getPending()).length === 0)
    const baseSentA = sentA()
    const baseSentB = sentB()

    await messagingA.disconnect()
    const writes = 5
    for (let i = 0; i < writes; i++) {
      docA.getMap("profile").set(`offline-${i}`, `value-${i}`)
    }

    // (a) The log owns offline retry; the generic outbox stays empty.
    await waitFor(async () => (await logA.getPending()).length === writes)
    expect(await genericOutboxA.count()).toBe(0)

    // (b) Reconnect catch-up + resend drains the durable log.
    await messagingA.connect(did)
    await waitFor(async () => (await logA.getPending()).length === 0)
    await waitFor(() => {
      for (let i = 0; i < writes; i++) {
        if (docB.getMap("profile").get(`offline-${i}`) !== `value-${i}`) return false
      }
      return true
    })

    // (c) Applying the remote updates produces no Bob re-broadcast.
    expect(sentB() - baseSentB).toBe(0)
    // (d) Exactly one successful log send per local write — no amplification.
    expect(sentA() - baseSentA).toBe(writes)
    expect(await genericOutboxA.count()).toBe(0)

    syncA.destroy()
    syncB.destroy()
    docA.destroy()
    docB.destroy()
    await messagingA.disconnect()
    await messagingB.disconnect()
  }, 15_000)
})
