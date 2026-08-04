import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import type { RelationRecord } from "../src/index"
import {
  AUTHORIAL_PREDICATES,
  isAuthorialPredicate,
  jcsCanonicalize,
  signRelationClaim,
  verifyRelationClaim,
  type ClaimSigner,
} from "../src/claims"

const REPO_ROOT = join(__dirname, "..", "..", "..")
const VECTORS = JSON.parse(
  readFileSync(join(REPO_ROOT, "docs", "spec", "schemas", "claims", "vectors", "rls-claim-1.json"), "utf8"),
) as {
  vectors: Array<{
    name: string
    expect: "valid" | "invalid"
    record: Omit<RelationRecord, "claim">
    jws: string
  }>
}

describe("SignedClaims — canonical spec vectors (binding, spec 08)", () => {
  for (const vector of VECTORS.vectors) {
    it(`${vector.name} → ${vector.expect}`, async () => {
      const record: RelationRecord = { ...vector.record, claim: vector.jws }
      expect(await verifyRelationClaim(record)).toBe(vector.expect)
    })
  }

  it("a record without any claim is invalid", async () => {
    const record: RelationRecord = { ...VECTORS.vectors[0]!.record }
    expect(await verifyRelationClaim(record)).toBe("invalid")
  })
})

describe("SignedClaims — sign/verify roundtrip", () => {
  async function testSigner(): Promise<{ signer: ClaimSigner; did: string }> {
    const keyPair = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey))
    // did:key: multicodec 0xed 0x01 + raw pubkey, base58btc, z-prefix
    const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    const bytes = new Uint8Array([0xed, 0x01, ...raw])
    let n = 0n
    for (const byte of bytes) n = (n << 8n) | BigInt(byte)
    let encoded = ""
    while (n > 0n) { encoded = B58[Number(n % 58n)] + encoded; n /= 58n }
    const did = `did:key:z${encoded}`
    return {
      did,
      signer: {
        kid: `${did}#sig-0`,
        signEd25519: async (bytes: Uint8Array) =>
          new Uint8Array(await crypto.subtle.sign("Ed25519", keyPair.privateKey, bytes as BufferSource)),
      },
    }
  }

  it("signs an authorial record so that verification yields valid — and detects tampering", async () => {
    const { signer, did } = await testSigner()
    const record: RelationRecord = {
      // id derived below by signRelationClaim consumers — here we compute it
      // via the same rule the verifier enforces, so use a placeholder first.
      id: "placeholder",
      predicate: "votesOn",
      from: `global:${did}`,
      to: "item:statement-rt",
      fields: { value: "green" },
      createdBy: did,
      createdAt: "2026-08-04T18:00:00.000Z",
    }
    // Canonical id per spec 08 rule 4 (same derivation the verifier checks).
    const idBytes = new TextEncoder().encode(jcsCanonicalize([did, "votesOn", record.from, record.to]))
    const digest = await crypto.subtle.digest("SHA-256", idBytes)
    record.id = "rel-" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")

    record.claim = await signRelationClaim(record, signer)
    expect(await verifyRelationClaim(record)).toBe("valid")

    // Raw-CRDT tamper after signing: stored value diverges from the claim.
    const tampered: RelationRecord = { ...record, fields: { value: "red" } }
    expect(await verifyRelationClaim(tampered)).toBe("invalid")
  })

  it("refuses to sign when the signer kid does not match createdBy", async () => {
    const { signer } = await testSigner()
    const record: RelationRecord = {
      id: "rel-x",
      predicate: "votesOn",
      from: "global:did:key:zSomeoneElse",
      to: "item:s",
      createdBy: "did:key:zSomeoneElse",
      createdAt: "2026-08-04T18:00:00.000Z",
    }
    await expect(signRelationClaim(record, signer)).rejects.toThrow(/createdBy/i)
  })
})

describe("SignedClaims — authorial catalog (closed, v0.1)", () => {
  it("contains exactly the spec catalog", () => {
    expect([...AUTHORIAL_PREDICATES].sort()).toEqual(["connectedWith", "knows", "takesPlaceAt", "votesOn"])
    expect(isAuthorialPredicate("votesOn")).toBe(true)
    expect(isAuthorialPredicate("blocks")).toBe(false)
  })
})
