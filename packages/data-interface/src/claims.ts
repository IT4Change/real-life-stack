import type { RelationRecord } from "./index.js"

/**
 * SignedClaims — author binding for relation records (spec 08 → "Autorbindung",
 * rls#209/#227). A claim is a compact Ed25519 JWS whose payload binds the
 * record's full semantic state to its author's DID. It travels IN the record
 * (`data.claim` → projected to `record.claim`), so it survives snapshots,
 * imports and bridges — unlike the sync-log signatures, which cover whole
 * update blobs and are unavailable after a snapshot bootstrap.
 *
 * The canonical test vectors under docs/spec/schemas/claims/vectors/ are
 * binding; the claims test suite runs them verbatim.
 */

export const RLS_CLAIM_V1 = "rls-claim/1"
export const CLAIM_JWS_TYP = "rls-claim+jws"
export const RELATION_AUTHORIAL_PROFILE = "relation-authorial"

/**
 * The CLOSED v0.1 catalog of authorial predicates (spec 08): perspective
 * edges that ARE their author's statement. Never sourced from space data —
 * no client may reinterpret a record's profile.
 */
export const AUTHORIAL_PREDICATES: ReadonlySet<string> = new Set([
  "votesOn",
  "knows",
  "connectedWith",
  "takesPlaceAt",
])

export function isAuthorialPredicate(predicate: string): boolean {
  return AUTHORIAL_PREDICATES.has(predicate)
}

/** Operation-shaped signer — never exposes key material. */
export interface ClaimSigner {
  /** MUST be `<did>#sig-0` of the authenticated identity. */
  kid: string
  signEd25519(bytes: Uint8Array): Promise<Uint8Array>
}

export type ClaimVerdict = "valid" | "invalid" | "trusted"

/** JCS (RFC 8785) for I-JSON values: recursive key sort; JSON.stringify's
    IEEE-754 number serialisation matches JCS for JS numbers. */
export function jcsCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(jcsCanonicalize).join(",")}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${jcsCanonicalize(record[key])}`).join(",")}}`
}

const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

function base58btcDecode(value: string): Uint8Array | null {
  let n = 0n
  for (const char of value) {
    const digit = B58_ALPHABET.indexOf(char)
    if (digit < 0) return null
    n = n * 58n + BigInt(digit)
  }
  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn))
    n >>= 8n
  }
  for (const char of value) {
    if (char === "1") bytes.unshift(0)
    else break
  }
  return new Uint8Array(bytes)
}

/** did:key (Ed25519) → raw 32-byte public key, or null when malformed. */
function ed25519PublicKeyFromDidKey(did: string): Uint8Array | null {
  if (!did.startsWith("did:key:z")) return null
  const decoded = base58btcDecode(did.slice("did:key:z".length))
  if (!decoded || decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) return null
  return decoded.subarray(2)
}

const didFromKid = (kid: string): string => kid.split("#")[0] ?? kid

/** The exact wire payload `rls-claim/1` / `relation-authorial`: all ten
    members ALWAYS present (spec 08 — verifiers compare structurally). */
export function relationAuthorialPayload(record: RelationRecord): Record<string, unknown> {
  return {
    v: RLS_CLAIM_V1,
    profile: RELATION_AUTHORIAL_PROFILE,
    id: record.id,
    predicate: record.predicate,
    from: record.from,
    to: record.to,
    fields: record.fields ?? {},
    confirmationRef: record.confirmationRef ?? null,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  }
}

/**
 * Sign an authorial record. The signer identity MUST be the record author
 * (`kid` = `<createdBy>#sig-0`) — signing in someone else's name is refused
 * at create time, mirroring the inbox-JWS convention.
 */
export async function signRelationClaim(record: RelationRecord, signer: ClaimSigner): Promise<string> {
  if (didFromKid(signer.kid) !== record.createdBy) {
    throw new Error(`Claim signer ${signer.kid} does not match record createdBy ${record.createdBy}`)
  }
  const header = { alg: "EdDSA", kid: signer.kid, typ: CLAIM_JWS_TYP }
  const payload = relationAuthorialPayload(record)
  const signingInput = `${toBase64Url(encoder.encode(jcsCanonicalize(header)))}.${toBase64Url(encoder.encode(jcsCanonicalize(payload)))}`
  const signature = await signer.signEd25519(encoder.encode(signingInput))
  return `${signingInput}.${toBase64Url(signature)}`
}

async function deriveCanonicalRecordId(record: RelationRecord): Promise<string> {
  const bytes = encoder.encode(jcsCanonicalize([record.createdBy, record.predicate, record.from, record.to]))
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return "rel-" + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * Verify a record's claim per spec 08 (the `signed` half of the verdict
 * space; `trusted` is answered by authoritative connectors, never here).
 * Checks, in order: claim present and well-formed, typ header, payload
 * version and profile, kid↔createdBy binding, structural payload↔record
 * equality (all ten members), the canonical id rule, and the Ed25519
 * signature under the key resolved from the kid (did:key — fully local).
 */
export async function verifyRelationClaim(record: RelationRecord): Promise<"valid" | "invalid"> {
  try {
    const claim = record.claim
    if (typeof claim !== "string") return "invalid"
    const parts = claim.split(".")
    if (parts.length !== 3) return "invalid"
    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

    const header = JSON.parse(new TextDecoder().decode(fromBase64Url(headerB64))) as Record<string, unknown>
    if (header.alg !== "EdDSA" || header.typ !== CLAIM_JWS_TYP || typeof header.kid !== "string") return "invalid"

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as Record<string, unknown>
    if (payload.v !== RLS_CLAIM_V1 || payload.profile !== RELATION_AUTHORIAL_PROFILE) return "invalid"
    if (didFromKid(header.kid) !== payload.createdBy) return "invalid"

    // Structural payload ↔ record equality over the exact wire shape.
    const expected = relationAuthorialPayload(record)
    if (jcsCanonicalize(payload) !== jcsCanonicalize(expected)) return "invalid"

    // Canonical id rule (spec 08 rule 4): a record under a wrong key is
    // invalid even with an intact signature.
    if (record.id !== (await deriveCanonicalRecordId(record))) return "invalid"

    const publicKeyBytes = ed25519PublicKeyFromDidKey(didFromKid(header.kid))
    if (!publicKeyBytes) return "invalid"
    const key = await globalThis.crypto.subtle.importKey("raw", publicKeyBytes as BufferSource, "Ed25519", false, ["verify"])
    const valid = await globalThis.crypto.subtle.verify(
      "Ed25519",
      key,
      fromBase64Url(signatureB64) as BufferSource,
      encoder.encode(`${headerB64}.${payloadB64}`) as BufferSource,
    )
    return valid ? "valid" : "invalid"
  } catch {
    return "invalid"
  }
}
