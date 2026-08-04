// Generates the canonical SignedClaim test vectors (spec 08 → "Autorbindung").
// Deterministic: fixed seeds, fixed payloads — rerunning must reproduce
// vectors/rls-claim-1.json byte for byte. Node >= 20 (native Ed25519).
//   node docs/spec/schemas/claims/generate-vectors.mjs
import { createPrivateKey, createPublicKey, sign as edSign } from "node:crypto"
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// --- JCS (RFC 8785) for I-JSON values: recursive key sort; JS number
// serialisation via JSON.stringify matches JCS for IEEE-754 doubles. ---
function jcs(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`
}

const b64u = (buf) => Buffer.from(buf).toString("base64url")

// --- Ed25519 from fixed 32-byte seeds (PKCS8 wrapping) ---
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex")
function keyFromSeed(seedByte) {
  const seed = Buffer.alloc(32, seedByte)
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" })
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" })
  const publicKey = spki.subarray(spki.length - 32)
  return { privateKey, publicKey }
}

// --- did:key for Ed25519: multicodec 0xed 0x01 + pubkey, base58btc, 'z' prefix ---
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
function base58btc(bytes) {
  let n = BigInt("0x" + Buffer.from(bytes).toString("hex"))
  let out = ""
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n }
  for (const byte of bytes) { if (byte === 0) out = "1" + out; else break }
  return out
}
const didKey = (publicKey) => "did:key:z" + base58btc(Buffer.concat([Buffer.from([0xed, 0x01]), publicKey]))

function signClaim(payload, key, headerOverrides = {}, signWith = key) {
  const header = { alg: "EdDSA", kid: `${payload.createdBy}#sig-0`, typ: "rls-claim+jws", ...headerOverrides }
  const signingInput = `${b64u(jcs(header))}.${b64u(jcs(payload))}`
  const signature = edSign(null, Buffer.from(signingInput, "ascii"), signWith.privateKey)
  return { header, jws: `${signingInput}.${b64u(signature)}` }
}

const alice = keyFromSeed(0x11)
const mallory = keyFromSeed(0x22)
const ALICE = didKey(alice.publicKey)
const MALLORY = didKey(mallory.publicKey)

const statementTo = "item:statement-zweiter-brunnen"
const from = `global:${ALICE}`
// The record id follows spec 08 rule 4 conceptually; for vectors it is fixed.
const recordId = "rel-testvector-0001"

const basePayload = {
  v: "rls-claim/1",
  profile: "relation-authorial",
  id: recordId,
  predicate: "votesOn",
  from,
  to: statementTo,
  fields: { value: "green" },
  confirmationRef: null,
  createdBy: ALICE,
  createdAt: "2026-08-04T12:00:00.000Z",
}

const updatedPayload = { ...basePayload, fields: { value: "red" } }

const vectors = []

const create = signClaim(basePayload, alice)
vectors.push({
  name: "create-valid",
  expect: "valid",
  description: "Fresh authorial vote claim; verifier resolves the key from kid (did:key), payload matches the stored record.",
  record: { id: recordId, predicate: "votesOn", from, to: statementTo, fields: { value: "green" }, confirmationRef: null, createdBy: ALICE, createdAt: basePayload.createdAt },
  payload: basePayload,
  jws: create.jws,
})

const update = signClaim(updatedPayload, alice)
vectors.push({
  name: "update-resigned-valid",
  expect: "valid",
  description: "Stance change green→red re-signed by the author; same record key, new payload.",
  record: { id: recordId, predicate: "votesOn", from, to: statementTo, fields: { value: "red" }, confirmationRef: null, createdBy: ALICE, createdAt: basePayload.createdAt },
  payload: updatedPayload,
  jws: update.jws,
})

vectors.push({
  name: "snapshot-reverify-valid",
  expect: "valid",
  description: "Identical to create-valid but verified from stored data.claim after a snapshot bootstrap (no log available) — must verify from the record alone.",
  record: vectors[0].record,
  payload: basePayload,
  jws: create.jws,
})

vectors.push({
  name: "field-mismatch-invalid",
  expect: "invalid",
  description: "Claim signs value green but the stored record says red (raw-CRDT tamper after signing) — payload/record mismatch MUST fail.",
  record: { ...vectors[0].record, fields: { value: "red" } },
  payload: basePayload,
  jws: create.jws,
})

const forged = signClaim(basePayload, alice, {}, mallory)
vectors.push({
  name: "foreign-signer-invalid",
  expect: "invalid",
  description: "kid names the author but the signature was produced by another key (mallory) — signature verification MUST fail.",
  record: vectors[0].record,
  payload: basePayload,
  jws: forged.jws,
})

const wrongTyp = signClaim(basePayload, alice, { typ: "vc+jwt" })
vectors.push({
  name: "wrong-typ-invalid",
  expect: "invalid",
  description: "Domain separation: any typ other than rls-claim+jws MUST be rejected even with a valid signature.",
  record: vectors[0].record,
  payload: basePayload,
  jws: wrongTyp.jws,
})

const unknownVersion = { ...basePayload, v: "rls-claim/9" }
const unknownVersionSigned = signClaim(unknownVersion, alice)
vectors.push({
  name: "unknown-version-invalid",
  expect: "invalid",
  description: "Unknown payload version MUST fail closed.",
  record: vectors[0].record,
  payload: unknownVersion,
  jws: unknownVersionSigned.jws,
})

const out = {
  description: "Canonical SignedClaim vectors (rls-claim/1, relation-authorial). Binding for every implementation — see docs/spec/08-relation-records.md → Autorbindung.",
  keys: {
    alice: { did: ALICE, seed: "0x11 * 32 (test-only, deliberately public)" },
    mallory: { did: MALLORY, seed: "0x22 * 32 (test-only, deliberately public)" },
  },
  jcsNote: "Payload/header canonicalisation is RFC 8785 over I-JSON values; the signing input is base64url(JCS(header)) + '.' + base64url(JCS(payload)) as ASCII.",
  vectors,
}

const here = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(here, "vectors"), { recursive: true })
writeFileSync(join(here, "vectors", "rls-claim-1.json"), JSON.stringify(out, null, 2) + "\n")
console.log(`wrote ${vectors.length} vectors — alice=${ALICE}`)
