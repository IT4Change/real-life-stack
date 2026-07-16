import { deliverInboxMessage } from "@real-life/wot-core/application"
import type { MessagingAdapter } from "@real-life/wot-core/ports"
import {
  ATTESTATION_RECEIPT_BODY_KIND,
  INBOX_MESSAGE_TYPE,
  isVerificationAttestation,
} from "@real-life/wot-core/protocol"
import type {
  AttestationReceiptBody,
  AttestationVcPayload,
  ProtocolCryptoAdapter,
} from "@real-life/wot-core/protocol"
import type {
  Attestation,
  IdentitySession,
} from "@real-life/wot-core/types"

const URN_UUID_PREFIX = "urn:uuid:"
const CANONICAL_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function attestationFromVerifiedVc(
  payload: AttestationVcPayload,
  vcJws: string,
): Attestation {
  const id = typeof payload.jti === "string"
    ? payload.jti
    : typeof payload.id === "string"
      ? payload.id
      : `wot:attestation:${payload.iss}:${payload.sub}:${payload.nbf}`
  const tags = payload.credentialSubject.tags
  const context = payload.credentialSubject.context
  return {
    id,
    from: payload.issuer,
    to: payload.credentialSubject.id,
    claim: payload.credentialSubject.claim,
    ...(typeof payload.inResponseTo === "string" ? { inResponseTo: payload.inResponseTo } : {}),
    ...(Array.isArray(tags) && tags.every((tag) => typeof tag === "string") ? { tags } : {}),
    ...(typeof context === "string" ? { context } : {}),
    createdAt: payload.validFrom,
    vcJws,
    // The marker is derived only from the verified VC type array.
    isVerification: isVerificationAttestation(payload),
  }
}

export function messageIdForAttestation(attestationId: string): string {
  if (attestationId.startsWith(URN_UUID_PREFIX)) {
    const bare = attestationId.slice(URN_UUID_PREFIX.length)
    if (CANONICAL_UUID_V4.test(bare)) return bare
  }
  return crypto.randomUUID()
}

export async function sendAttestationInbox(options: {
  identity: IdentitySession
  attestation: Attestation
  recipientEncryptionPublicKey: Uint8Array
  messaging: MessagingAdapter
  crypto: ProtocolCryptoAdapter
  messageId?: string
}) {
  const envelope = await deliverInboxMessage({
    type: INBOX_MESSAGE_TYPE,
    body: { vcJws: options.attestation.vcJws },
    from: options.identity.getDid(),
    to: options.attestation.to,
    recipientEncryptionPublicKey: options.recipientEncryptionPublicKey,
    sign: (input) => options.identity.signEd25519(input),
    crypto: options.crypto,
    randomId: () => options.messageId ?? messageIdForAttestation(options.attestation.id),
  })
  const receipt = await options.messaging.send(envelope)
  return { envelope, receipt }
}

export async function sendAttestationReceipt(options: {
  identity: IdentitySession
  issuerDid: string
  jti: string
  recipientEncryptionPublicKey: Uint8Array
  messaging: MessagingAdapter
  crypto: ProtocolCryptoAdapter
}): Promise<void> {
  const body: AttestationReceiptBody = {
    kind: ATTESTATION_RECEIPT_BODY_KIND,
    jti: options.jti,
    status: "received",
  }
  const messageId = await deriveReceiptMessageId(
    options.jti,
    options.identity.getDid(),
    options.crypto,
  )
  const envelope = await deliverInboxMessage({
    type: INBOX_MESSAGE_TYPE,
    body,
    from: options.identity.getDid(),
    to: options.issuerDid,
    recipientEncryptionPublicKey: options.recipientEncryptionPublicKey,
    sign: (input) => options.identity.signEd25519(input),
    crypto: options.crypto,
    randomId: () => messageId,
  })
  await options.messaging.send(envelope)
}

async function deriveReceiptMessageId(
  jti: string,
  senderDid: string,
  cryptoAdapter: ProtocolCryptoAdapter,
): Promise<string> {
  const digest = await cryptoAdapter.sha256(
    new TextEncoder().encode(`attestation-receipt:${jti}:${senderDid}`),
  )
  const bytes = digest.slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
