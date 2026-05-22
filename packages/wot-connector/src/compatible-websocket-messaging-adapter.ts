import type { MessagingAdapter } from "@real-life/wot-core"
import type {
  DeliveryReceipt,
  MessageEnvelope,
  MessagingState,
} from "@real-life/wot-core"
import {
  buildBrokerAuthTranscript,
  createBrokerAuthTranscriptSigningBytes,
  formatBrokerChallengeResponseSignature,
} from "@real-life/wot-core/protocol"

export type BrokerAuthSigningMode = "sync-003" | "legacy-hex-raw-nonce"

export interface BrokerAuthSigningPlan {
  signingBytes: Uint8Array
  mode: BrokerAuthSigningMode
}

export type SignBrokerAuthBytesFn = (signingBytes: Uint8Array) => Promise<Uint8Array>

const LEGACY_HEX_NONCE_PATTERN = /^[0-9a-fA-F]{64}$/

export function createBrokerAuthSigningPlan(input: {
  did: string
  deviceId: string
  nonce: string
}): BrokerAuthSigningPlan {
  try {
    const transcript = buildBrokerAuthTranscript(input)
    return {
      signingBytes: createBrokerAuthTranscriptSigningBytes(transcript),
      mode: "sync-003",
    }
  } catch (error) {
    if (!LEGACY_HEX_NONCE_PATTERN.test(input.nonce)) throw error
    return {
      signingBytes: new TextEncoder().encode(input.nonce),
      mode: "legacy-hex-raw-nonce",
    }
  }
}

export class CompatibleWebSocketMessagingAdapter implements MessagingAdapter {
  private ws: WebSocket | null = null
  private state: MessagingState = "disconnected"
  private messageCallbacks = new Set<(envelope: MessageEnvelope) => void | Promise<void>>()
  private receiptCallbacks = new Set<(receipt: DeliveryReceipt) => void>()
  private stateCallbacks = new Set<(state: MessagingState) => void>()
  private transportMap = new Map<string, string>()
  private pendingReceipts = new Map<string, (receipt: DeliveryReceipt) => void>()
  private earlyMessageBuffer: MessageEnvelope[] = []
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null
  private readonly heartbeatIntervalMs = 15_000
  private readonly heartbeatTimeoutMs = 5_000
  private readonly sendTimeoutMs: number

  private readonly deviceId: string
  private readonly signBrokerAuthBytes: SignBrokerAuthBytesFn
  private connectedDid: string | null = null
  private peerCount = 0

  constructor(
    private relayUrl: string,
    options: {
      deviceId?: string
      signBrokerAuthBytes: SignBrokerAuthBytesFn
      sendTimeoutMs?: number
    },
  ) {
    this.deviceId = options.deviceId ?? crypto.randomUUID()
    this.signBrokerAuthBytes = options.signBrokerAuthBytes
    this.sendTimeoutMs = options.sendTimeoutMs ?? 10_000
  }

  async connect(myDid: string): Promise<void> {
    if (this.state === "connected" && this.connectedDid === myDid) return
    if (this.state === "connected") await this.disconnect()

    this.setState("connecting")

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.relayUrl)

      const fail = (error: Error) => {
        this.setState("error")
        this.ws?.close()
        reject(error)
      }

      const sendRegister = () => {
        this.ws?.send(JSON.stringify({ type: "register", did: myDid, deviceId: this.deviceId }))
      }

      this.ws.onopen = () => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          sendRegister()
          return
        }

        const ws = this.ws
        if (!ws) {
          fail(new Error("WebSocket closed before registration"))
          return
        }

        const checkAndSend = () => {
          if (ws.readyState === WebSocket.OPEN) {
            sendRegister()
          } else if (ws.readyState === WebSocket.CONNECTING) {
            setTimeout(checkAndSend, 10)
          } else {
            fail(new Error("WebSocket closed before registration"))
          }
        }
        setTimeout(checkAndSend, 10)
      }

      this.ws.onmessage = (event) => {
        let msg: any
        try {
          msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString())
        } catch {
          console.warn("[WebSocket] Received malformed JSON, ignoring")
          return
        }

        switch (msg.type) {
          case "challenge":
            this.respondToChallenge(myDid, String(msg.nonce ?? ""))
              .catch((error) => {
                fail(new Error(
                  `Broker-auth signing failed: ${error instanceof Error ? error.message : String(error)}`,
                ))
              })
            break

          case "registered":
            this.connectedDid = myDid
            this.peerCount = typeof msg.peers === "number" ? msg.peers : 0
            this.setState("connected")
            this.startHeartbeat()
            resolve()
            break

          case "message":
            this.handleIncomingMessage(msg.envelope as MessageEnvelope)
            break

          case "receipt": {
            const receipt = msg.receipt as DeliveryReceipt
            const pending = this.pendingReceipts.get(receipt.messageId)
            if (pending) {
              this.pendingReceipts.delete(receipt.messageId)
              pending(receipt)
            }
            for (const cb of this.receiptCallbacks) cb(receipt)
            break
          }

          case "pong":
            this.handlePong()
            break

          case "error":
            if (this.state === "connecting") {
              fail(new Error(`Relay error: ${msg.message}`))
            }
            break
        }
      }

      this.ws.onerror = () => {
        if (this.state === "connecting") {
          fail(new Error(`WebSocket connection failed to ${this.relayUrl}`))
        }
      }

      this.ws.onclose = () => {
        this.setState("disconnected")
      }
    })
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat()
    this.connectedDid = null
    this.earlyMessageBuffer.length = 0
    this.pendingReceipts.clear()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setState("disconnected")
  }

  getState(): MessagingState {
    return this.state
  }

  getPeerCount(): number {
    return this.peerCount
  }

  onStateChange(callback: (state: MessagingState) => void): () => void {
    this.stateCallbacks.add(callback)
    return () => {
      this.stateCallbacks.delete(callback)
    }
  }

  async send(envelope: MessageEnvelope): Promise<DeliveryReceipt> {
    if (this.state !== "connected" || !this.ws) {
      throw new Error("CompatibleWebSocketMessagingAdapter: must call connect() before send()")
    }

    return new Promise<DeliveryReceipt>((resolve, reject) => {
      const timer = this.sendTimeoutMs > 0
        ? setTimeout(() => {
          this.pendingReceipts.delete(envelope.id)
          reject(new Error(`Send timeout: no receipt from relay after ${this.sendTimeoutMs}ms`))
        }, this.sendTimeoutMs)
        : null

      this.pendingReceipts.set(envelope.id, (receipt) => {
        if (timer) clearTimeout(timer)
        resolve(receipt)
      })

      if (this.ws!.readyState !== WebSocket.OPEN) {
        if (timer) clearTimeout(timer)
        this.pendingReceipts.delete(envelope.id)
        reject(new Error("WebSocket not open"))
        return
      }

      this.ws!.send(JSON.stringify({ type: "send", envelope }))
    })
  }

  onMessage(callback: (envelope: MessageEnvelope) => void | Promise<void>): () => void {
    this.messageCallbacks.add(callback)

    if (this.earlyMessageBuffer.length > 0) {
      const buffered = this.earlyMessageBuffer.splice(0)
      for (const envelope of buffered) {
        void this.handleIncomingMessage(envelope)
      }
    }

    return () => {
      this.messageCallbacks.delete(callback)
    }
  }

  onReceipt(callback: (receipt: DeliveryReceipt) => void): () => void {
    this.receiptCallbacks.add(callback)
    return () => {
      this.receiptCallbacks.delete(callback)
    }
  }

  async registerTransport(did: string, transportAddress: string): Promise<void> {
    this.transportMap.set(did, transportAddress)
  }

  async resolveTransport(did: string): Promise<string | null> {
    return this.transportMap.get(did) ?? null
  }

  private async respondToChallenge(myDid: string, nonce: string): Promise<void> {
    const plan = createBrokerAuthSigningPlan({
      did: myDid,
      deviceId: this.deviceId,
      nonce,
    })
    const signatureBytes = await this.signBrokerAuthBytes(plan.signingBytes)
    const signature = formatBrokerChallengeResponseSignature(signatureBytes)
    this.ws?.send(
      JSON.stringify({
        type: "challenge-response",
        did: myDid,
        deviceId: this.deviceId,
        nonce,
        signature,
      }),
    )
  }

  private setState(newState: MessagingState) {
    this.state = newState
    for (const cb of this.stateCallbacks) cb(newState)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      if (this.state !== "connected" || !this.ws) {
        this.stopHeartbeat()
        return
      }
      if (this.ws.readyState !== WebSocket.OPEN) return
      this.ws.send(JSON.stringify({ type: "ping" }))
      this.heartbeatTimeout = setTimeout(() => {
        this.stopHeartbeat()
        if (this.ws) {
          this.ws.close()
          this.ws = null
        }
        this.setState("disconnected")
      }, this.heartbeatTimeoutMs)
    }, this.heartbeatIntervalMs)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  private async handleIncomingMessage(envelope: MessageEnvelope): Promise<void> {
    if (this.messageCallbacks.size === 0) {
      this.earlyMessageBuffer.push(envelope)
      return
    }

    let processed = false
    for (const cb of this.messageCallbacks) {
      try {
        await cb(envelope)
        processed = true
      } catch (err) {
        console.error("Message callback error:", err)
      }
    }
    if (processed && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "ack", messageId: envelope.id }))
    }
  }

  private handlePong(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }
}
