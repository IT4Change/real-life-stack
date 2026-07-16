import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  AttestationWorkflow,
  IdentityWorkflow,
  VerificationWorkflow,
} from "@real-life/wot-core/application"
import { InMemoryMessagingAdapter } from "@real-life/wot-core/adapters"
import { WebCryptoProtocolCryptoAdapter } from "@real-life/wot-core"
import {
  INBOX_MESSAGE_TYPE,
  decodeBase64Url,
  isDidcommMessage,
  parseQrChallenge,
} from "@real-life/wot-core/protocol"
import type { PublicIdentitySession } from "@real-life/wot-core/types"
import type { WireMessage } from "@real-life/wot-core/ports"

import {
  attestationFromVerifiedVc,
  sendAttestationInbox,
  sendAttestationReceipt,
} from "../src/attestation-wire.js"
import { InboxReceptionHost } from "../src/inbox-reception-host.js"

async function identity(passphrase: string): Promise<PublicIdentitySession> {
  const crypto = new WebCryptoProtocolCryptoAdapter()
  return (await new IdentityWorkflow({ crypto }).createIdentity({
    passphrase,
    storeSeed: false,
  })).identity
}

describe("Sync-003 attestation inbox wire", () => {
  const protocolCrypto = new WebCryptoProtocolCryptoAdapter()
  let alice: PublicIdentitySession
  let bob: PublicIdentitySession
  let aliceMessaging: InMemoryMessagingAdapter
  let bobMessaging: InMemoryMessagingAdapter

  beforeEach(async () => {
    InMemoryMessagingAdapter.resetAll()
    alice = await identity("alice")
    bob = await identity("bob")
    aliceMessaging = new InMemoryMessagingAdapter()
    bobMessaging = new InMemoryMessagingAdapter()
    await aliceMessaging.connect(alice.getDid())
    await bobMessaging.connect(bob.getDid())
  })

  afterEach(async () => {
    await aliceMessaging.disconnect()
    await bobMessaging.disconnect()
    InMemoryMessagingAdapter.resetAll()
  })

  it("delivers only {vcJws} through encrypted inbox/1.0 and authenticates the sender", async () => {
    const workflow = new AttestationWorkflow({ crypto: protocolCrypto })
    const attestation = await workflow.createAttestation({
      issuer: alice,
      subjectDid: bob.getDid(),
      claim: "hat geholfen",
      tags: ["commons"],
    })
    const received = vi.fn()
    const host = new InboxReceptionHost({
      messaging: bobMessaging,
      identity: bob,
      crypto: protocolCrypto,
    })
    host.onAttestation(received)
    host.start()

    const sent: WireMessage[] = []
    const baseSend = aliceMessaging.send.bind(aliceMessaging)
    aliceMessaging.send = async (message) => {
      sent.push(message)
      return baseSend(message)
    }
    await sendAttestationInbox({
      identity: alice,
      attestation,
      recipientEncryptionPublicKey: await bob.getEncryptionPublicKeyBytes(),
      messaging: aliceMessaging,
      crypto: protocolCrypto,
    })

    expect(received).toHaveBeenCalledTimes(1)
    expect(received).toHaveBeenCalledWith(expect.objectContaining({
      vcJws: attestation.vcJws,
      senderDid: alice.getDid(),
    }))
    expect(sent).toHaveLength(1)
    expect(isDidcommMessage(sent[0])).toBe(true)
    expect(sent[0].type).toBe(INBOX_MESSAGE_TYPE)
    expect(JSON.stringify(sent[0])).not.toContain(attestation.claim)
    expect(JSON.stringify(sent[0])).not.toContain(attestation.vcJws)
    host.stop()
  })

  it("routes encrypted app receipts through inbox/1.0 and replay-deduplicates them", async () => {
    const receiptListener = vi.fn()
    const host = new InboxReceptionHost({
      messaging: aliceMessaging,
      identity: alice,
      crypto: protocolCrypto,
    })
    host.onAttestationReceipt(receiptListener)
    host.start()
    const input = {
      identity: bob,
      issuerDid: alice.getDid(),
      jti: "urn:uuid:11111111-1111-4111-8111-111111111111",
      recipientEncryptionPublicKey: await alice.getEncryptionPublicKeyBytes(),
      messaging: bobMessaging,
      crypto: protocolCrypto,
    }

    await sendAttestationReceipt(input)
    await sendAttestationReceipt(input)

    expect(receiptListener).toHaveBeenCalledTimes(1)
    expect(receiptListener).toHaveBeenCalledWith(expect.objectContaining({
      jti: input.jti,
      senderDid: bob.getDid(),
    }))
    host.stop()
  })

  it("derives the verification marker from the verified VC type", async () => {
    const verification = await new VerificationWorkflow({ crypto: protocolCrypto })
      .createVerificationAttestation({
        issuer: alice,
        subjectDid: bob.getDid(),
        challengeNonce: "11111111-1111-4111-8111-111111111111",
      })
    const payload = await new AttestationWorkflow({ crypto: protocolCrypto })
      .verifyAttestationVcJws(verification.vcJws)

    const projected = attestationFromVerifiedVc(payload, verification.vcJws)
    expect(projected.isVerification).toBe(true)
    expect(projected.id).toBe("urn:uuid:11111111-1111-4111-8111-111111111111")
  })

  it("accepts a Trust 002 nonce once and rejects replay plus expiry", async () => {
    const nonce = "550e8400-e29b-41d4-a716-446655440000"
    let now = new Date("2026-07-16T10:00:00Z")
    const ownerWorkflow = new VerificationWorkflow({
      crypto: protocolCrypto,
      randomId: () => nonce,
      now: () => now,
    })
    const scannerWorkflow = new VerificationWorkflow({
      crypto: protocolCrypto,
      now: () => now,
    })

    const { rawJson } = await ownerWorkflow.createOnlineQrChallenge(alice, "Alice", {
      broker: "wss://relay.example",
    })
    const challenge = parseQrChallenge(rawJson)
    expect(challenge).toMatchObject({
      did: alice.getDid(),
      name: "Alice",
      nonce,
      broker: "wss://relay.example",
    })
    expect(decodeBase64Url(challenge.enc)).toEqual(await alice.getEncryptionPublicKeyBytes())

    const verification = await scannerWorkflow.createVerificationAttestation({
      issuer: bob,
      subjectDid: challenge.did,
      challengeNonce: challenge.nonce,
    })
    const payload = await new AttestationWorkflow({
      crypto: protocolCrypto,
      now: () => now,
    }).verifyAttestationVcJws(verification.vcJws)

    expect(await ownerWorkflow.acceptVerifiedVerificationAttestation(alice, payload)).toEqual({
      decision: "accept-in-person",
      nonce,
    })
    expect(await ownerWorkflow.acceptVerifiedVerificationAttestation(alice, payload)).toEqual({
      decision: "reject",
      reason: "nonce-consumed",
    })

    const expiredNonce = "123e4567-e89b-42d3-a456-426614174000"
    const expiredWorkflow = new VerificationWorkflow({
      crypto: protocolCrypto,
      randomId: () => expiredNonce,
      now: () => now,
    })
    await expiredWorkflow.createOnlineQrChallenge(alice, "Alice")
    const expiredVerification = await scannerWorkflow.createVerificationAttestation({
      issuer: bob,
      subjectDid: alice.getDid(),
      challengeNonce: expiredNonce,
    })
    const expiredPayload = await new AttestationWorkflow({
      crypto: protocolCrypto,
      now: () => now,
    }).verifyAttestationVcJws(expiredVerification.vcJws)
    now = new Date("2026-07-16T10:05:01Z")

    expect(await expiredWorkflow.acceptVerifiedVerificationAttestation(alice, expiredPayload)).toEqual({
      decision: "reject",
      reason: "challenge-expired",
    })
  })
})
