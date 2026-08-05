import { describe, expect, it } from "vitest"
import { applyItemFilter } from "../src/filter-translation.js"
import type { FilterBuilderLike, SupabaseResult } from "../src/client-types.js"

/** Recording stub: captures the exact PostgREST calls the translation emits. */
function recordingBuilder(): { builder: FilterBuilderLike; calls: Array<[string, ...unknown[]]> } {
  const calls: Array<[string, ...unknown[]]> = []
  const builder = {
    eq: (column: string, value: unknown) => { calls.push(["eq", column, value]); return builder },
    in: (column: string, values: unknown[]) => { calls.push(["in", column, values]); return builder },
    or: (filters: string) => { calls.push(["or", filters]); return builder },
    contains: (column: string, value: unknown) => { calls.push(["contains", column, value]); return builder },
    not: (column: string, operator: string, value: unknown) => { calls.push(["not", column, operator, value]); return builder },
    gte: (column: string, value: unknown) => { calls.push(["gte", column, value]); return builder },
    lte: (column: string, value: unknown) => { calls.push(["lte", column, value]); return builder },
    order: (column: string, options?: { ascending?: boolean }) => { calls.push(["order", column, options]); return builder },
    range: (from: number, to: number) => { calls.push(["range", from, to]); return builder },
    single: () => Promise.resolve({ data: {}, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: <T1, T2>(onfulfilled?: ((value: SupabaseResult<Record<string, unknown>[]>) => T1 | PromiseLike<T1>) | null, onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null) =>
      Promise.resolve({ data: [], error: null } as SupabaseResult<Record<string, unknown>[]>).then(onfulfilled, onrejected),
  } as FilterBuilderLike
  return { builder, calls }
}

const ORDER_CALLS: Array<[string, ...unknown[]]> = [
  ["order", "created_at", { ascending: true }],
  ["order", "id", { ascending: true }],
]

describe("applyItemFilter — ItemFilter → PostgREST translation", () => {
  it("no filter: only the stable ordering", () => {
    const { builder, calls } = recordingBuilder()
    applyItemFilter(builder)
    expect(calls).toEqual(ORDER_CALLS)
  })

  it("type and createdBy become eq filters on their columns", () => {
    const { builder, calls } = recordingBuilder()
    applyItemFilter(builder, { type: "note", createdBy: "user-1" })
    expect(calls).toEqual([
      ["eq", "type", "note"],
      ["eq", "created_by", "user-1"],
      ...ORDER_CALLS,
    ])
  })

  it("hasTag and hasSchema use array containment (AND semantics)", () => {
    const { builder, calls } = recordingBuilder()
    applyItemFilter(builder, { hasTag: ["a", "b"], hasSchema: ["https://real-life-stack.org/vocab/statement/v1"] })
    expect(calls).toEqual([
      ["contains", "tags", ["a", "b"]],
      ["contains", "context", ["https://real-life-stack.org/vocab/statement/v1"]],
      ...ORDER_CALLS,
    ])
  })

  it("empty hasTag/hasSchema arrays match everything — no filter emitted", () => {
    const { builder, calls } = recordingBuilder()
    applyItemFilter(builder, { hasTag: [], hasSchema: [] })
    expect(calls).toEqual(ORDER_CALLS)
  })

  it("hasField becomes a json-path not-null filter per field", () => {
    const { builder, calls } = recordingBuilder()
    applyItemFilter(builder, { hasField: ["position", "start"] })
    expect(calls).toEqual([
      ["not", "data->position", "is", null],
      ["not", "data->start", "is", null],
      ...ORDER_CALLS,
    ])
  })

  it("hasField REJECTS names that cannot be safely embedded in query syntax", () => {
    const { builder } = recordingBuilder()
    for (const hostile of ["a->b", "x,or(id.eq.1)", "a b", "data->>x", ""]) {
      expect(() => applyItemFilter(builder, { hasField: [hostile] })).toThrow(/unsupported field name/)
    }
  })

  it("bbox becomes numeric jsonb-path range filters on position coordinates", () => {
    const { builder, calls } = recordingBuilder()
    applyItemFilter(builder, { bbox: [9, 49, 11, 51] })
    expect(calls).toEqual([
      ["gte", "data->position->coordinates->0", 9],
      ["lte", "data->position->coordinates->0", 11],
      ["gte", "data->position->coordinates->1", 49],
      ["lte", "data->position->coordinates->1", 51],
      ...ORDER_CALLS,
    ])
  })

  it("limit/offset become a range window AFTER the stable ordering", () => {
    const { builder, calls } = recordingBuilder()
    applyItemFilter(builder, { limit: 10, offset: 20 })
    expect(calls).toEqual([...ORDER_CALLS, ["range", 20, 29]])
  })

  it("offset without limit still pages (bounded by the server cap)", () => {
    const { builder, calls } = recordingBuilder()
    applyItemFilter(builder, { offset: 5 })
    expect(calls).toEqual([...ORDER_CALLS, ["range", 5, 1004]])
  })
})
