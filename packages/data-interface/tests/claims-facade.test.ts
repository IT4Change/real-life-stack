import { describe, expect, it } from "vitest"
import type { CreateItemInput, Item, RelationRecord } from "../src/index"
import {
  createDefaultRelationStore,
  relationRecordFromItem,
  verifyRelationClaim,
  type ClaimSigner,
} from "../src/index"

/**
 * Facade-level SignedClaims contract (spec 08 → Schreibregeln): with a
 * claimSigner the facade signs authorial creates, re-signs updates, repairs
 * claimless own slots, and refuses non-catalog predicates; without a signer
 * behaviour is unchanged (authoritative/none connectors).
 */

async function testSigner(): Promise<{ signer: ClaimSigner; did: string }> {
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
    },
  }
}

function memoryConnector(userId: string) {
  const items = new Map<string, Item>()
  return {
    items,
    connector: {
      init: async () => {},
      dispose: async () => {},
      getItems: async () => [...items.values()],
      getItem: async (id: string) => items.get(id) ?? null,
      observe: () => ({ current: [] as Item[], subscribe: () => () => {} }),
      observeItem: () => ({ current: null, subscribe: () => () => {} }),
      createItem: async (input: CreateItemInput) => {
        if (input.id !== undefined && items.has(input.id)) return items.get(input.id)!
        const item: Item = { ...input, id: input.id ?? `item-${items.size}`, createdAt: "2026-08-04T18:00:00.000Z" }
        items.set(item.id, item)
        return item
      },
      updateItem: async (id: string, updates: Partial<Item>) => {
        const existing = items.get(id)
        if (!existing) throw new Error(`Item not found: ${id}`)
        const next = { ...existing, ...updates, id }
        items.set(id, next)
        return next
      },
      deleteItem: async (id: string) => { items.delete(id) },
      getCurrentUser: async () => ({ id: userId, displayName: "Signer" }),
      observeCurrentUser: () => ({ current: { id: userId }, subscribe: () => () => {} }),
      getUser: async () => null,
      getAuthState: () => ({ current: { status: "authenticated" }, subscribe: () => () => {} }),
      getAuthMethods: () => [],
      authenticate: async () => { throw new Error("unused") },
      logout: async () => {},
    } as never,
  }
}

describe("relation-store facade — SignedClaims write rules", () => {
  it("signs an authorial create so the stored record verifies as valid", async () => {
    const { signer, did } = await testSigner()
    const { connector } = memoryConnector(did)
    const store = createDefaultRelationStore(connector, { claimSigner: signer })

    const record = await store.createRelationRecord({
      predicate: "votesOn",
      from: `global:${did}`,
      to: "item:s1",
      fields: { value: "green" },
    })
    expect(typeof record.claim).toBe("string")
    expect(await verifyRelationClaim(record)).toBe("valid")
  })

  it("re-signs on update — the new state verifies, the old claim would not", async () => {
    const { signer, did } = await testSigner()
    const { connector } = memoryConnector(did)
    const store = createDefaultRelationStore(connector, { claimSigner: signer })

    const created = await store.createRelationRecord({
      predicate: "votesOn",
      from: `global:${did}`,
      to: "item:s1",
      fields: { value: "green" },
    })
    const updated = await store.updateRelationRecord(created.id, { fields: { value: "red" } })
    expect(updated.claim).not.toBe(created.claim)
    expect(await verifyRelationClaim(updated)).toBe("valid")
    // Old claim on new state = the tamper shape the verifier must reject.
    expect(await verifyRelationClaim({ ...updated, claim: created.claim })).toBe("invalid")
  })

  it("repairs an OWN claimless slot on idempotent create (spec: Schreibregel 2)", async () => {
    const { signer, did } = await testSigner()
    const { connector } = memoryConnector(did)
    // Pre-seed the canonical record WITHOUT a claim (legacy / crashed create).
    const plain = createDefaultRelationStore(connector)
    const legacy = await plain.createRelationRecord({
      predicate: "votesOn",
      from: `global:${did}`,
      to: "item:s1",
      fields: { value: "green" },
    })
    expect(legacy.claim).toBeUndefined()

    const store = createDefaultRelationStore(connector, { claimSigner: signer })
    const repaired = await store.createRelationRecord({
      predicate: "votesOn",
      from: `global:${did}`,
      to: "item:s1",
      fields: { value: "green" },
    })
    expect(repaired.id).toBe(legacy.id)
    expect(await verifyRelationClaim(repaired)).toBe("valid")
  })

  it("refuses non-catalog predicates when signing is active (spec: Katalog-Regel)", async () => {
    const { signer, did } = await testSigner()
    const { connector } = memoryConnector(did)
    const store = createDefaultRelationStore(connector, { claimSigner: signer })
    await expect(
      store.createRelationRecord({ predicate: "blocks", from: "item:a", to: "item:b" }),
    ).rejects.toThrow(/catalog|Katalog/i)
  })

  it("fails BEFORE any write when signing is active but the connector lacks updateItem", async () => {
    const { signer, did } = await testSigner()
    const { connector, items } = memoryConnector(did)
    const crippled = { ...(connector as Record<string, unknown>) }
    delete crippled.updateItem
    const { createRelationRecordWith } = await import("../src/index")
    await expect(
      createRelationRecordWith(crippled as never, {
        predicate: "votesOn", from: `global:${did}`, to: "item:s1",
      }, { claimSigner: signer }),
    ).rejects.toThrow(/updateItem/i)
    // Precondition, not post-hoc: no claimless record may be left behind.
    expect(items.size).toBe(0)
  })

  it("refuses to UPDATE a non-catalog record in signed mode", async () => {
    const { signer, did } = await testSigner()
    const { connector } = memoryConnector(did)
    const plain = createDefaultRelationStore(connector)
    const legacy = await plain.createRelationRecord({ predicate: "blocks", from: "item:a", to: "item:b" })
    const store = createDefaultRelationStore(connector, { claimSigner: signer })
    await expect(store.updateRelationRecord(legacy.id, { fields: { note: "x" } })).rejects.toThrow(/catalog|Katalog/i)
  })

  it("without a signer, behaviour is unchanged — no claim, no refusal", async () => {
    const { did } = await testSigner()
    const { connector } = memoryConnector(did)
    const store = createDefaultRelationStore(connector)
    const record = await store.createRelationRecord({
      predicate: "votesOn",
      from: `global:${did}`,
      to: "item:s1",
    })
    expect(record.claim).toBeUndefined()
  })

  it("projects data.claim onto record.claim and keeps it out of fields", () => {
    const item: Item = {
      id: "rel-x",
      type: "relation",
      createdBy: "did:key:zA",
      createdAt: "t",
      data: { predicate: "votesOn", value: "green", claim: "h.p.s" },
      relations: [
        { predicate: "from", target: "global:did:key:zA" },
        { predicate: "to", target: "item:s1" },
      ],
    }
    const record = relationRecordFromItem(item) as RelationRecord
    expect(record.claim).toBe("h.p.s")
    expect(record.fields).toEqual({ value: "green" })
  })
})
