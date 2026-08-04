/**
 * Parametrised DataInterface contract suite (rls#214).
 *
 * ONE set of contract cases, run by every connector's test file with its own
 * harness — so a new filter, persisted field, or capability is proven against
 * Local, Mock, WoT AND GraphQL automatically instead of silently dropping at
 * one boundary (the #201 failure mode: hasSchema/@context vanished at the
 * GraphQL transport and nothing went red).
 *
 * The suite is capability-gated: connectors without a capability skip its
 * cases via the same public type guards apps use. Scope-specific behaviour
 * (owner-space create, cross-space ids) stays in the per-connector contract
 * tests — this suite covers the scope-independent core contract.
 *
 * Imported from `@real-life-stack/data-interface/testing` by TEST files only;
 * vitest is a peer of the consuming test runner, never a runtime dependency.
 */
import { describe, expect, it } from "vitest"
import type { DataInterface, Item, RelationRecord } from "../index.js"
import {
  deriveRelationRecordId,
  hasRelationRecords,
  hasRelationRecordWriter,
  isWritable,
} from "../index.js"

export interface ContractContext {
  connector: DataInterface
  /** The authenticated user the harness signed in. */
  currentUserId: string
  dispose?: () => Promise<void> | void
}

export interface ContractFeatures {
  /**
   * Whether `observe()` reflects writes in-process. Transports whose live
   * updates need external infrastructure (e.g. GraphQL over websockets)
   * set false; their query path is still fully covered.
   */
  observeReflectsWrites?: boolean
}

export interface ContractHarness {
  makeConnector(): Promise<ContractContext>
  features?: ContractFeatures
}

let uniqueCounter = 0
const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${uniqueCounter++}`

const VOCAB_A = "https://real-life-stack.org/vocab/statement/v1"
const VOCAB_B = "https://real-life-stack.org/vocab/event/v1"

export function describeDataInterfaceContract(name: string, harness: ContractHarness): void {
  describe(`DataInterface contract — ${name}`, () => {
    async function withConnector<T>(run: (context: ContractContext) => Promise<T>): Promise<T> {
      const context = await harness.makeConnector()
      try {
        return await run(context)
      } finally {
        await context.dispose?.()
      }
    }

    describe("item filters (positive AND negative per parameter)", () => {
      it("filters by type", async () => {
        await withConnector(async ({ connector, currentUserId }) => {
          if (!isWritable(connector)) return
          const type = unique("ct-type")
          const created = await connector.createItem({ type, createdBy: currentUserId, data: { title: "a" } })
          const hit = await connector.getItems({ type })
          expect(hit.map(({ id }) => id)).toContain(created.id)
          for (const item of hit) expect(item.type).toBe(type)
          const miss = await connector.getItems({ type: unique("ct-none") })
          expect(miss).toEqual([])
        })
      })

      it("filters by hasField", async () => {
        await withConnector(async ({ connector, currentUserId }) => {
          if (!isWritable(connector)) return
          const marker = unique("ctField")
          const created = await connector.createItem({
            type: unique("ct-hf"),
            createdBy: currentUserId,
            data: { [marker]: "x" },
          })
          const hit = await connector.getItems({ hasField: [marker] })
          expect(hit.map(({ id }) => id)).toContain(created.id)
          for (const item of hit) expect(marker in item.data).toBe(true)
          const miss = await connector.getItems({ hasField: [unique("ctNone")] })
          expect(miss).toEqual([])
        })
      })

      it("filters by hasTag (AND semantics)", async () => {
        await withConnector(async ({ connector, currentUserId }) => {
          if (!isWritable(connector)) return
          const tagA = unique("ct-tag-a")
          const tagB = unique("ct-tag-b")
          const both = await connector.createItem({
            type: unique("ct-tags"),
            createdBy: currentUserId,
            data: { title: "both" },
            tags: [tagA, tagB],
          })
          const onlyA = await connector.createItem({
            type: unique("ct-tags"),
            createdBy: currentUserId,
            data: { title: "only-a" },
            tags: [tagA],
          })
          const hitA = await connector.getItems({ hasTag: [tagA] })
          expect(hitA.map(({ id }) => id)).toEqual(expect.arrayContaining([both.id, onlyA.id]))
          const hitBoth = await connector.getItems({ hasTag: [tagA, tagB] })
          expect(hitBoth.map(({ id }) => id)).toContain(both.id)
          expect(hitBoth.map(({ id }) => id)).not.toContain(onlyA.id)
        })
      })

      it("filters by hasSchema (every listed vocabulary must be active)", async () => {
        await withConnector(async ({ connector, currentUserId }) => {
          if (!isWritable(connector)) return
          const type = unique("ct-schema")
          const withVocab = await connector.createItem({
            type,
            createdBy: currentUserId,
            "@context": [VOCAB_A],
            data: { title: "with" },
          })
          const withoutVocab = await connector.createItem({
            type,
            createdBy: currentUserId,
            data: { title: "without" },
          })
          const hit = await connector.getItems({ hasSchema: [VOCAB_A] })
          expect(hit.map(({ id }) => id)).toContain(withVocab.id)
          expect(hit.map(({ id }) => id)).not.toContain(withoutVocab.id)
          for (const item of hit) expect(item["@context"] ?? []).toContain(VOCAB_A)
          const miss = await connector.getItems({ type, hasSchema: [VOCAB_A, VOCAB_B] })
          expect(miss.map(({ id }) => id)).not.toContain(withVocab.id)
        })
      })

      it("filters by createdBy", async () => {
        await withConnector(async ({ connector, currentUserId }) => {
          if (!isWritable(connector)) return
          const type = unique("ct-author")
          const mine = await connector.createItem({ type, createdBy: currentUserId, data: {} })
          const hit = await connector.getItems({ type, createdBy: currentUserId })
          expect(hit.map(({ id }) => id)).toContain(mine.id)
          const miss = await connector.getItems({ type, createdBy: unique("ct-nobody") })
          expect(miss).toEqual([])
        })
      })

      it("applies limit and offset as a window over the filtered result", async () => {
        await withConnector(async ({ connector, currentUserId }) => {
          if (!isWritable(connector)) return
          const type = unique("ct-page")
          const first = await connector.createItem({ type, createdBy: currentUserId, data: { title: "1" } })
          const second = await connector.createItem({ type, createdBy: currentUserId, data: { title: "2" } })
          const page1 = await connector.getItems({ type, limit: 1 })
          expect(page1).toHaveLength(1)
          const page2 = await connector.getItems({ type, limit: 1, offset: 1 })
          expect(page2).toHaveLength(1)
          expect(new Set([page1[0]!.id, page2[0]!.id])).toEqual(new Set([first.id, second.id]))
        })
      })
    })

    describe("persistence roundtrip", () => {
      it("persists data, tags, @context and relations through create → getItem", async () => {
        await withConnector(async ({ connector, currentUserId }) => {
          if (!isWritable(connector)) return
          const tag = unique("ct-rt-tag")
          const created = await connector.createItem({
            type: unique("ct-rt"),
            createdBy: currentUserId,
            "@context": [VOCAB_A, VOCAB_B],
            data: { title: "roundtrip", nested: { deep: true } },
            tags: [tag],
            relations: [{ predicate: "relatesTo", target: "item:ct-target" }],
          })
          const read = await connector.getItem(created.id)
          expect(read).not.toBeNull()
          expect(read!.data).toEqual({ title: "roundtrip", nested: { deep: true } })
          expect(read!.tags).toEqual([tag])
          expect(read!["@context"]).toEqual([VOCAB_A, VOCAB_B])
          expect(read!.relations).toEqual([{ predicate: "relatesTo", target: "item:ct-target" }])
          expect(read!.createdBy).toBe(currentUserId)
          expect(typeof read!.createdAt).toBe("string")
        })
      })

      it("updateItem replaces data and deleteItem removes the item", async () => {
        await withConnector(async ({ connector, currentUserId }) => {
          if (!isWritable(connector)) return
          const created = await connector.createItem({
            type: unique("ct-ud"),
            createdBy: currentUserId,
            data: { title: "old", stale: "drop-me" },
          })
          const updated = await connector.updateItem(created.id, { data: { title: "new" } })
          expect(updated.data).toEqual({ title: "new" })
          expect((await connector.getItem(created.id))!.data).toEqual({ title: "new" })
          await connector.deleteItem(created.id)
          expect(await connector.getItem(created.id)).toBeNull()
        })
      })

      it("observe reflects a create for a matching filter", async () => {
        if (harness.features?.observeReflectsWrites === false) return
        await withConnector(async ({ connector, currentUserId }) => {
          if (!isWritable(connector)) return
          const type = unique("ct-obs")
          const created = await connector.createItem({ type, createdBy: currentUserId, data: {} })
          const observable = connector.observe({ type })
          // Contract: after the write settled, a fresh observation of the
          // matching filter contains the item (initial fetch or live update).
          await new Promise((resolve) => setTimeout(resolve, 0))
          const ids = () => observable.current.map(({ id }) => id)
          if (!ids().includes(created.id)) {
            await new Promise<void>((resolve) => {
              const stop = observable.subscribe(() => { stop(); resolve() })
            })
          }
          expect(ids()).toContain(created.id)
        })
      })
    })

    describe("relation-record contract (capability-gated)", () => {
      it("stamps createdBy from the authenticated identity and derives the canonical id", async () => {
        await withConnector(async ({ connector, currentUserId }) => {
          if (!hasRelationRecordWriter(connector)) return
          const statementId = unique("ct-stmt")
          const record = await connector.createRelationRecord({
            predicate: "votesOn",
            from: `global:${currentUserId}`,
            to: `item:${statementId}`,
            fields: { value: "green" },
          })
          expect(record.createdBy).toBe(currentUserId)
          expect(record.id).toBe(
            await deriveRelationRecordId(currentUserId, "votesOn", `global:${currentUserId}`, `item:${statementId}`),
          )
          expect(record.fields).toEqual({ value: "green" })
        })
      })

      it("is idempotent for the own tuple and readable through the record projection", async () => {
        await withConnector(async ({ connector, currentUserId }) => {
          if (!hasRelationRecordWriter(connector) || !hasRelationRecords(connector)) return
          const statementId = unique("ct-stmt")
          const input = { predicate: "votesOn", from: `global:${currentUserId}`, to: `item:${statementId}` }
          const first = await connector.createRelationRecord(input)
          const again = await connector.createRelationRecord(input)
          expect(again.id).toBe(first.id)
          const records = await connector.getRelationRecords({ predicate: "votesOn", to: `item:${statementId}` })
          expect(records.map(({ id }: RelationRecord) => id)).toEqual([first.id])
        })
      })

      it("fails on a pre-seeded canonical id with a foreign identity", async () => {
        await withConnector(async ({ connector, currentUserId }) => {
          if (!hasRelationRecordWriter(connector) || !isWritable(connector)) return
          const statementId = unique("ct-stmt")
          const id = await deriveRelationRecordId(currentUserId, "votesOn", `global:${currentUserId}`, `item:${statementId}`)
          await connector.createItem({
            id,
            type: "relation",
            createdBy: unique("ct-mallory"),
            data: { predicate: "votesOn", value: "red" },
            relations: [
              { predicate: "from", target: `global:${unique("ct-mallory")}` },
              { predicate: "to", target: `item:${statementId}` },
            ],
          })
          await expect(
            connector.createRelationRecord({ predicate: "votesOn", from: `global:${currentUserId}`, to: `item:${statementId}` }),
          ).rejects.toThrow(/collision/i)
        })
      })

      it("refuses to update or delete another author's record", async () => {
        await withConnector(async ({ connector, currentUserId }) => {
          if (!hasRelationRecordWriter(connector) || !isWritable(connector)) return
          const statementId = unique("ct-stmt")
          const foreignAuthor = unique("ct-bob")
          const foreignId = await deriveRelationRecordId(foreignAuthor, "votesOn", `global:${foreignAuthor}`, `item:${statementId}`)
          await connector.createItem({
            id: foreignId,
            type: "relation",
            createdBy: foreignAuthor,
            data: { predicate: "votesOn", value: "red" },
            relations: [
              { predicate: "from", target: `global:${foreignAuthor}` },
              { predicate: "to", target: `item:${statementId}` },
            ],
          })
          await expect(connector.updateRelationRecord(foreignId, { fields: { value: "green" } })).rejects.toThrow(/authorized/i)
          await expect(connector.deleteRelationRecord(foreignId)).rejects.toThrow(/authorized/i)
          expect(await connector.getItem(foreignId)).not.toBeNull()
        })
      })
    })
  })
}
