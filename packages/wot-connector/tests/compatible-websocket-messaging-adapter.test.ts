import { describe, expect, it } from "vitest"
import { formatBrokerChallengeNonce } from "@real-life/wot-core/protocol"
import { createBrokerAuthSigningPlan } from "../src/compatible-websocket-messaging-adapter.js"

describe("createBrokerAuthSigningPlan", () => {
  const did = "did:key:z6Mkq3ZL5u1GNj8Enp2D4Y3d6s6FyMe9gYFZ8n3Yy3Yy3Yy3"
  const deviceId = "123e4567-e89b-42d3-a456-426614174000"

  it("uses Sync 003 transcript bytes for canonical broker nonces", () => {
    const nonce = formatBrokerChallengeNonce(new Uint8Array(32).fill(7))

    const plan = createBrokerAuthSigningPlan({ did, deviceId, nonce })

    expect(plan.mode).toBe("sync-003")
    expect(JSON.parse(new TextDecoder().decode(plan.signingBytes))).toEqual({
      did,
      deviceId,
      nonce,
      protocol: "wot/broker-auth/v1",
      type: "challenge-response",
    })
  })

  it("keeps the deployed legacy relay working while it still sends hex nonces", () => {
    const nonce = "b37f7b9e31b0ec97d5cef67423813b214ed76960b8bb4088b63e79dd9c78dcec"

    const plan = createBrokerAuthSigningPlan({ did, deviceId, nonce })

    expect(plan.mode).toBe("legacy-hex-raw-nonce")
    expect(new TextDecoder().decode(plan.signingBytes)).toBe(nonce)
  })

  it("rejects malformed nonces that are neither Sync 003 nor legacy relay shape", () => {
    expect(() => createBrokerAuthSigningPlan({
      did,
      deviceId,
      nonce: "not-a-valid-nonce",
    })).toThrow("Invalid broker nonce")
  })
})
