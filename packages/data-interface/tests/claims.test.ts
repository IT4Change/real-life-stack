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

describe("SignedClaims — reviewer counterproofs (#230 round 1)", () => {
  /** Hand-rolled claim builder that BYPASSES signRelationClaim's own guards,
      so the verifier's strictness is tested independently. */
  async function handSign(payload: Record<string, unknown>, kid: string, privateKey: CryptoKey): Promise<string> {
    const b64u = (bytes: Uint8Array) => {
      let binary = ""
      for (const byte of bytes) binary += String.fromCharCode(byte)
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    }
    const enc = new TextEncoder()
    const header = { alg: "EdDSA", kid, typ: "rls-claim+jws" }
    const input = `${b64u(enc.encode(jcsCanonicalize(header)))}.${b64u(enc.encode(jcsCanonicalize(payload)))}`
    const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, enc.encode(input) as BufferSource))
    return `${input}.${b64u(sig)}`
  }

  async function rawSigner() {
    const keyPair = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey))
    const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    const bytes = new Uint8Array([0xed, 0x01, ...raw])
    let n = 0n
    for (const byte of bytes) n = (n << 8n) | BigInt(byte)
    let encoded = ""
    while (n > 0n) { encoded = B58[Number(n % 58n)] + encoded; n /= 58n }
    return { did: `did:key:z${encoded}`, privateKey: keyPair.privateKey }
  }

  async function canonicalId(createdBy: string, predicate: string, from: string, to: string): Promise<string> {
    const bytes = new TextEncoder().encode(jcsCanonicalize([createdBy, predicate, from, to]))
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    return "rel-" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
  }

  it("rejects a formally correct claim on a NON-CATALOG predicate (blocks)", async () => {
    const { did, privateKey } = await rawSigner()
    const from = "item:a"
    const to = "item:b"
    const record: RelationRecord = {
      id: await canonicalId(did, "blocks", from, to),
      predicate: "blocks", from, to,
      createdBy: did, createdAt: "2026-08-05T09:00:00.000Z",
    }
    const payload = {
      v: "rls-claim/1", profile: "relation-authorial",
      id: record.id, predicate: "blocks", from, to,
      fields: {}, confirmationRef: null, createdBy: did, createdAt: record.createdAt,
    }
    record.claim = await handSign(payload, `${did}#sig-0`, privateKey)
    expect(await verifyRelationClaim(record)).toBe("invalid")
  })

  it("rejects a kid with a wrong fragment (#not-sig-0) even when the DID matches", async () => {
    const { did, privateKey } = await rawSigner()
    const from = `global:${did}`
    const to = "item:s1"
    const record: RelationRecord = {
      id: await canonicalId(did, "votesOn", from, to),
      predicate: "votesOn", from, to,
      fields: { value: "green" },
      createdBy: did, createdAt: "2026-08-05T09:00:00.000Z",
    }
    const payload = {
      v: "rls-claim/1", profile: "relation-authorial",
      id: record.id, predicate: "votesOn", from, to,
      fields: { value: "green" }, confirmationRef: null, createdBy: did, createdAt: record.createdAt,
    }
    record.claim = await handSign(payload, `${did}#not-sig-0`, privateKey)
    expect(await verifyRelationClaim(record)).toBe("invalid")
  })

  it("refuses to SIGN non-I-JSON values (NaN) instead of silently signing null", async () => {
    const { signer, did } = await (async () => {
      const keyPair = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey))
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
          signEd25519: async (input: Uint8Array) =>
            new Uint8Array(await crypto.subtle.sign("Ed25519", keyPair.privateKey, input as BufferSource)),
        } satisfies ClaimSigner,
      }
    })()
    const record: RelationRecord = {
      id: "rel-x", predicate: "votesOn",
      from: `global:${did}`, to: "item:s1",
      fields: { value: Number.NaN },
      createdBy: did, createdAt: "2026-08-05T09:00:00.000Z",
    }
    await expect(signRelationClaim(record, signer)).rejects.toThrow(/I-JSON|finite/i)
  })

  it("rejects at VERIFY time when the record carries non-I-JSON values", async () => {
    const { did, privateKey } = await rawSigner()
    const from = `global:${did}`
    const to = "item:s1"
    const id = await canonicalId(did, "votesOn", from, to)
    // Claim signs the JSON-coerced null; the stored record still holds NaN.
    const payload = {
      v: "rls-claim/1", profile: "relation-authorial",
      id, predicate: "votesOn", from, to,
      fields: { value: null }, confirmationRef: null, createdBy: did, createdAt: "2026-08-05T09:00:00.000Z",
    }
    const record: RelationRecord = {
      id, predicate: "votesOn", from, to,
      fields: { value: Number.NaN },
      createdBy: did, createdAt: "2026-08-05T09:00:00.000Z",
      claim: await handSign(payload, `${did}#sig-0`, privateKey),
    }
    expect(await verifyRelationClaim(record)).toBe("invalid")
  })
})

describe("SignedClaims — authorial catalog (closed, v0.1)", () => {
  it("contains exactly the spec catalog", () => {
    expect([...AUTHORIAL_PREDICATES].sort()).toEqual(["connectedWith", "knows", "takesPlaceAt", "votesOn"])
    expect(isAuthorialPredicate("votesOn")).toBe(true)
    expect(isAuthorialPredicate("blocks")).toBe(false)
  })
})
