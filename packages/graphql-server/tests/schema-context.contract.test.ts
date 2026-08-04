import { describe, expect, it } from "vitest"
import { graphql, parse, subscribe } from "graphql"
import { schema } from "../src/schema/index.js"

/**
 * Contract: the schema-activation vertrag (spec 06) survives the GraphQL
 * boundary end-to-end — `@context` persists through create and reads back,
 * and `hasSchema` filters queries AND subscriptions. Without this, Resonance
 * over GraphQL would receive unfiltered items and new statements would lose
 * their vocabulary (loop-review blocker on #201).
 */

const VOCAB_BASE = "https://real-life-stack.org/vocab/base/v1"
const VOCAB_STATEMENT = "https://real-life-stack.org/vocab/statement/v1"

const CREATE = `
  mutation Create($input: ItemInput!) {
    createItem(input: $input) { id context data }
  }
`

const ITEMS = `
  query Items($filter: ItemFilterInput) {
    items(filter: $filter) { id context }
  }
`

async function createStatement(id: string) {
  const result = await graphql({
    schema,
    source: CREATE,
    variableValues: {
      input: {
        id,
        type: "statement",
        createdBy: "did:key:alice",
        context: [VOCAB_BASE, VOCAB_STATEMENT],
        data: { title: "Wir brauchen einen zweiten Brunnen" },
      },
    },
  })
  expect(result.errors).toBeUndefined()
  return (result.data as { createItem: { id: string; context: string[] | null } }).createItem
}

describe("GraphQL — @context and hasSchema end-to-end", () => {
  it("persists @context through create and reads it back", async () => {
    const created = await createStatement("stmt-ctx-1")
    expect(created.context).toEqual([VOCAB_BASE, VOCAB_STATEMENT])

    const read = await graphql({ schema, source: ITEMS, variableValues: { filter: { type: "statement" } } })
    expect(read.errors).toBeUndefined()
    const items = (read.data as { items: Array<{ id: string; context: string[] | null }> }).items
    expect(items.find((item) => item.id === "stmt-ctx-1")?.context).toEqual([VOCAB_BASE, VOCAB_STATEMENT])
  })

  it("filters queries by hasSchema — positive and negative", async () => {
    await createStatement("stmt-ctx-2")

    const positive = await graphql({ schema, source: ITEMS, variableValues: { filter: { hasSchema: [VOCAB_STATEMENT] } } })
    expect(positive.errors).toBeUndefined()
    const positiveItems = (positive.data as { items: Array<{ id: string }> }).items
    expect(positiveItems.map(({ id }) => id)).toContain("stmt-ctx-2")
    // Every returned item actually carries the vocabulary — demo items without
    // @context must NOT leak through (that was the "unfiltered items" failure).
    const withContext = (positive.data as { items: Array<{ id: string; context: string[] | null }> }).items
    for (const item of withContext) expect(item.context ?? []).toContain(VOCAB_STATEMENT)

    const negative = await graphql({ schema, source: ITEMS, variableValues: { filter: { hasSchema: ["https://real-life-stack.org/vocab/event/v1"] } } })
    expect(negative.errors).toBeUndefined()
    const negativeItems = (negative.data as { items: Array<{ id: string }> }).items
    expect(negativeItems.map(({ id }) => id)).not.toContain("stmt-ctx-2")
  })

  it("filters the itemsChanged subscription by hasSchema", async () => {
    await createStatement("stmt-ctx-3")
    const iterator = await subscribe({
      schema,
      document: parse(`
        subscription Changed($filter: ItemFilterInput) {
          itemsChanged(filter: $filter) { id context }
        }
      `),
      variableValues: { filter: { hasSchema: [VOCAB_STATEMENT] } },
    })
    if (!(Symbol.asyncIterator in (iterator as object))) {
      throw new Error(`subscription failed: ${JSON.stringify(iterator)}`)
    }
    const first = await (iterator as AsyncIterableIterator<{ data?: { itemsChanged: Array<{ id: string; context: string[] | null }> } }>).next()
    const changed = first.value?.data?.itemsChanged ?? []
    expect(changed.map(({ id }) => id)).toContain("stmt-ctx-3")
    for (const item of changed) expect(item.context ?? []).toContain(VOCAB_STATEMENT)
    await (iterator as AsyncIterableIterator<unknown>).return?.()
  })
})
