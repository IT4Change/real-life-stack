import { receiveInboxMessage } from "@real-life/wot-core/application"
import { InMemoryMessageIdHistory } from "@real-life/wot-core/adapters"
import type {
  MessageIdHistoryPort,
  MessagingAdapter,
  WireMessage,
} from "@real-life/wot-core/ports"
import {
  INBOX_MESSAGE_TYPE,
  assertAttestationDeliveryBody,
  createAckMessage,
  createDidKeyResolver,
  decodeBase64Url,
  evaluateInboxAckDisposition,
  isAttestationReceiptBody,
  isDidcommMessage,
} from "@real-life/wot-core/protocol"
import type {
  DidResolver,
  DidcommPlaintextMessage,
  InboxAckLocalOutcome,
  ProtocolCryptoAdapter,
} from "@real-life/wot-core/protocol"
import type { IdentitySession } from "@real-life/wot-core/types"
import { logReceptionDropTrace } from "./reception-trace.js"

export interface IncomingAttestationDelivery {
  vcJws: string
  /** Authenticated Inner-JWS sender, never the outer routing field. */
  senderDid: string
  outerId: string
}

export interface IncomingAttestationReceipt {
  jti: string
  /** Authenticated Inner-JWS sender. */
  senderDid: string
  outerId: string
}

type AttestationListener = (delivery: IncomingAttestationDelivery) => void | Promise<void>
type ReceiptListener = (receipt: IncomingAttestationReceipt) => void | Promise<void>

interface PendingDelivery<T> {
  value: T
  recordProcessed: () => Promise<void>
}

export interface InboxReceptionHostOptions {
  messaging: MessagingAdapter
  identity: IdentitySession
  crypto: ProtocolCryptoAdapter
  didResolver?: DidResolver
  messageIdHistory?: MessageIdHistoryPort
  now?: () => Date
  maxAgeMs?: number
}

/**
 * Composition-root owner for Sync-003 inbox/1.0 and its ack/1.0 disposition.
 * Membership inbox types remain owned by the replication adapter.
 */
export class InboxReceptionHost {
  private readonly messaging: MessagingAdapter
  private readonly identity: IdentitySession
  private readonly crypto: ProtocolCryptoAdapter
  private readonly didResolver: DidResolver
  private readonly messageIdHistory: MessageIdHistoryPort
  private readonly now: () => Date
  private readonly maxAgeMs: number | undefined
  private attestationListeners = new Set<AttestationListener>()
  private receiptListeners = new Set<ReceiptListener>()
  private pendingAttestations: Array<PendingDelivery<IncomingAttestationDelivery>> = []
  private pendingReceipts: Array<PendingDelivery<IncomingAttestationReceipt>> = []
  private unsubscribe: (() => void) | null = null

  constructor(options: InboxReceptionHostOptions) {
    this.messaging = options.messaging
    this.identity = options.identity
    this.crypto = options.crypto
    this.didResolver = options.didResolver ?? createDidKeyResolver()
    this.messageIdHistory = options.messageIdHistory ?? new InMemoryMessageIdHistory()
    this.now = options.now ?? (() => new Date())
    this.maxAgeMs = options.maxAgeMs
  }

  start(): void {
    if (this.unsubscribe) return
    this.unsubscribe = this.messaging.onMessage(async (message: WireMessage) => {
      if (!isDidcommMessage(message) || message.type !== INBOX_MESSAGE_TYPE) return
      await this.handle(message)
    })
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.attestationListeners.clear()
    this.receiptListeners.clear()
    this.pendingAttestations = []
    this.pendingReceipts = []
  }

  onAttestation(listener: AttestationListener): () => void {
    this.attestationListeners.add(listener)
    this.flushPendingAttestations()
    return () => { this.attestationListeners.delete(listener) }
  }

  onAttestationReceipt(listener: ReceiptListener): () => void {
    this.receiptListeners.add(listener)
    this.flushPendingReceipts()
    return () => { this.receiptListeners.delete(listener) }
  }

  private async handle(message: DidcommPlaintextMessage<object>): Promise<void> {
    const result = await receiveInboxMessage({
      message,
      ownDid: this.identity.getDid(),
      decryptEcies: (ecies) => this.identity.decryptForMe({
        ephemeralPublicKey: decodeBase64Url(ecies.epk),
        nonce: decodeBase64Url(ecies.nonce),
        ciphertext: decodeBase64Url(ecies.ciphertext),
      }),
      crypto: this.crypto,
      didResolver: this.didResolver,
      messageIdHistory: this.messageIdHistory,
      now: this.now,
      expectedTypes: [INBOX_MESSAGE_TYPE],
      ...(this.maxAgeMs === undefined ? {} : { maxAgeMs: this.maxAgeMs }),
    })

    if (result.decision === "reject") {
      if (result.reason === "replay") {
        await this.conclude(
          message.id,
          { kind: "duplicate", source: "replay-history" },
          "duplicate-known",
        )
      } else {
        // `detail` trägt den konkreten Inner-JWS-Fehler (z.B. "created_time
        // too old") — ohne ihn ist der Sammelgrund im Feld nicht diagnostizierbar.
        console.warn("[wot-connector] rejected inbox/1.0 message:", result.reason, result.detail ?? "")
        logReceptionDropTrace(
          "inbox/1.0 rejected",
          result.detail === undefined ? result.reason : `${result.reason} — ${result.detail}`,
          { reason: result.reason, messageId: message.id },
        )
      }
      return
    }

    if (isAttestationReceiptBody(result.body)) {
      const receipt: IncomingAttestationReceipt = {
        jti: result.body.jti,
        senderDid: result.senderDid,
        outerId: result.outerId,
      }
      if (this.receiptListeners.size === 0) {
        if (!this.pendingReceipts.some(({ value }) => value.outerId === receipt.outerId)) {
          this.pendingReceipts.push({ value: receipt, recordProcessed: result.recordProcessed })
        }
        return
      }
      const outcome = await this.dispatchReceipt(receipt)
      await this.conclude(receipt.outerId, outcome, "unique", result.recordProcessed)
      return
    }

    let delivery: IncomingAttestationDelivery
    try {
      assertAttestationDeliveryBody(result.body)
      delivery = {
        vcJws: result.body.vcJws,
        senderDid: result.senderDid,
        outerId: result.outerId,
      }
    } catch (error) {
      console.warn("[wot-connector] invalid attestation inbox body:", error)
      await this.conclude(
        result.outerId,
        { kind: "invalid-rejected", rejection: "malformed", authoritativeStateChanged: false },
        "unique",
        result.recordProcessed,
      )
      return
    }

    if (this.attestationListeners.size === 0) {
      if (!this.pendingAttestations.some(({ value }) => value.outerId === delivery.outerId)) {
        this.pendingAttestations.push({ value: delivery, recordProcessed: result.recordProcessed })
      }
      return
    }
    const outcome = await this.dispatchAttestation(delivery)
    await this.conclude(delivery.outerId, outcome, "unique", result.recordProcessed)
  }

  private flushPendingAttestations(): void {
    if (this.attestationListeners.size === 0 || this.pendingAttestations.length === 0) return
    const pending = this.pendingAttestations.splice(0)
    void (async () => {
      for (const { value, recordProcessed } of pending) {
        const outcome = await this.dispatchAttestation(value)
        await this.conclude(value.outerId, outcome, "unique", recordProcessed)
      }
    })()
  }

  private flushPendingReceipts(): void {
    if (this.receiptListeners.size === 0 || this.pendingReceipts.length === 0) return
    const pending = this.pendingReceipts.splice(0)
    void (async () => {
      for (const { value, recordProcessed } of pending) {
        const outcome = await this.dispatchReceipt(value)
        await this.conclude(value.outerId, outcome, "unique", recordProcessed)
      }
    })()
  }

  private async dispatchAttestation(delivery: IncomingAttestationDelivery): Promise<InboxAckLocalOutcome> {
    try {
      for (const listener of [...this.attestationListeners]) await listener(delivery)
      return { kind: "applied", durable: true }
    } catch (error) {
      console.debug("[wot-connector] attestation inbox apply incomplete:", error)
      return { kind: "processing-incomplete", waitingOn: "durable-apply" }
    }
  }

  private async dispatchReceipt(receipt: IncomingAttestationReceipt): Promise<InboxAckLocalOutcome> {
    try {
      for (const listener of [...this.receiptListeners]) await listener(receipt)
      return { kind: "applied", durable: true }
    } catch (error) {
      console.debug("[wot-connector] attestation receipt apply incomplete:", error)
      return { kind: "processing-incomplete", waitingOn: "durable-apply" }
    }
  }

  private async conclude(
    outerId: string,
    outcome: InboxAckLocalOutcome,
    replayCheck: "unique" | "duplicate-known",
    recordProcessed?: () => Promise<void>,
  ): Promise<void> {
    const disposition = evaluateInboxAckDisposition({
      messageKind: "inbox",
      decryption: "complete",
      innerVerification: "complete",
      replayCheck,
      localOutcome: outcome,
    })
    if (disposition.action === "do-not-ack") return
    await recordProcessed?.()
    if (disposition.action !== "send-ack") return
    const ack = createAckMessage({
      id: crypto.randomUUID(),
      from: this.identity.getDid(),
      createdTime: Math.floor(this.now().getTime() / 1000),
      thid: outerId,
      body: { messageId: outerId },
    })
    try {
      await this.messaging.send(ack)
    } catch (error) {
      console.warn("[wot-connector] failed to send ack/1.0:", error)
    }
  }
}
