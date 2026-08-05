import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { DataInterface, Observable, RelationRecord, RelationRecordInput } from "@real-life-stack/data-interface"

interface HookSlot {
  cleanup?: () => void
  deps?: readonly unknown[]
  value?: unknown
}

const harness = {
  connector: null as unknown as DataInterface,
  hookIndex: 0,
  slots: [] as HookSlot[],
}

function sameDeps(left: readonly unknown[] | undefined, right: readonly unknown[]): boolean {
  return left !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
}

function resetHarness(): void {
  for (const slot of harness.slots) slot?.cleanup?.()
  harness.hookIndex = 0
  harness.slots = []
}

function renderHook<T>(render: () => T): T {
  harness.hookIndex = 0
  return render()
}

/** Render twice: effects fill state slots (e.g. currentUserId) on the first pass. */
function renderHookSettled<T>(render: () => T): T {
  renderHook(render)
  return renderHook(render)
}

/** Render, flush async verdict effects, render again — the fail-closed
    aggregation only counts after verification settles. */
async function renderHookVerified<T>(render: () => T): Promise<T> {
  renderHook(render)
  renderHook(render)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return renderHook(render)
}

function staticObservable<T>(value: T): Observable<T> {
  return { current: value, loaded: true, subscribe: () => () => {} }
}

const ME = "did:key:me"
const OTHER = "did:key:other"
const STATEMENT = "statement-1"

function voteRecord(id: string, voter: string, value: string, overrides: Partial<RelationRecord> = {}): RelationRecord {
  return {
    id,
    predicate: "votesOn",
    from: `global:${voter}`,
    to: `item:${STATEMENT}`,
    fields: { value },
    createdBy: voter,
    createdAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  }
}

interface FakeWrites {
  created: RelationRecordInput[]
  updated: Array<{ id: string; updates: unknown }>
  deleted: string[]
}

/**
 * Stateful record fake: writes mutate the record set, so a second serialized
 * vote() call reads the effect of the first — the double-click contract.
 */
function connector(initialRecords: RelationRecord[], opts?: { userId?: string | null; authenticatable?: boolean; verdicts?: false | ((record: RelationRecord) => "valid" | "invalid" | "trusted") }) {
  const writes: FakeWrites = { created: [], updated: [], deleted: [] }
  const records = [...initialRecords]
  const userId = opts?.userId === undefined ? ME : opts.userId
  const matches = (filter?: { predicate?: string; to?: string }) =>
    records.filter((record) =>
      (filter?.predicate === undefined || record.predicate === filter.predicate) &&
      (filter?.to === undefined || record.to === filter.to))
  const fake: Record<string, unknown> = {
    init: async () => {},
    dispose: async () => {},
    getItems: async () => [],
    getItem: async () => null,
    observe: () => staticObservable([]),
    observeItem: () => staticObservable(null),
    // RelationRecordCapable
    getRelationRecords: vi.fn(async (filter?: { predicate?: string; to?: string }) => matches(filter)),
    observeRelationRecords: vi.fn((filter?: { predicate?: string; to?: string }) => staticObservable(matches(filter))),
    getRelationNeighbors: async () => [],
    observeRelationNeighbors: () => staticObservable([]),
    // RelationRecordWriterCapable — stamps createdBy like the real facade and
    // mirrors its IDEMPOTENCE: an existing record of the same canonical tuple
    // is returned UNCHANGED (fields are not reconciled — issue #211).
    createRelationRecord: vi.fn(async (input: RelationRecordInput) => {
      writes.created.push(input)
      const existing = records.find((record) =>
        record.predicate === input.predicate && record.from === input.from && record.to === input.to)
      if (existing) return existing
      const record = voteRecord(`rel-${records.length}`, userId ?? "nobody", String(input.fields?.value), {
        predicate: input.predicate,
        from: input.from,
        to: input.to,
      })
      records.push(record)
      return record
    }),
    updateRelationRecord: vi.fn(async (id: string, updates: { fields?: Record<string, unknown> }) => {
      writes.updated.push({ id, updates })
      const record = records.find((candidate) => candidate.id === id)
      if (record && updates.fields) record.fields = updates.fields
      return record
    }),
    deleteRelationRecord: vi.fn(async (id: string) => {
      writes.deleted.push(id)
      const index = records.findIndex((candidate) => candidate.id === id)
      if (index >= 0) records.splice(index, 1)
    }),
  }
  if (opts?.verdicts !== false) {
    // Default: authoritative-style trusted verdict, overridable per record.
    const verdictFor = typeof opts?.verdicts === "function" ? opts.verdicts : () => "trusted" as const
    fake.verifyRecordClaim = vi.fn(async (record: RelationRecord) => verdictFor(record))
  }
  if (opts?.authenticatable !== false) {
    Object.assign(fake, {
      getCurrentUser: async () => (userId ? { id: userId, displayName: "Me" } : null),
      observeCurrentUser: () => staticObservable(userId ? { id: userId, displayName: "Me" } : null),
      getUser: async (id: string) => ({ id, displayName: `Name of ${id}` }),
      getAuthState: () => staticObservable({ status: userId ? "authenticated" : "unauthenticated" }),
      getAuthMethods: () => [],
      authenticate: async () => { throw new Error("unused") },
      logout: async () => {},
    })
  }
  return { connector: fake as unknown as DataInterface, writes }
}

let hooks: typeof import("../src/hooks/use-votes")

beforeAll(async () => {
  vi.doMock("react", () => ({
    startTransition: (callback: () => void) => callback(),
    useMemo: <T>(factory: () => T, deps: readonly unknown[]) => {
      const index = harness.hookIndex++
      const previous = harness.slots[index]
      if (previous && sameDeps(previous.deps, deps)) return previous.value as T
      const value = factory()
      harness.slots[index] = { deps, value }
      return value
    },
    useCallback: <T>(callback: T, deps: readonly unknown[]) => {
      const index = harness.hookIndex++
      const previous = harness.slots[index]
      if (previous && sameDeps(previous.deps, deps)) return previous.value as T
      harness.slots[index] = { deps, value: callback }
      return callback
    },
    useState: <T>(initial: T) => {
      const index = harness.hookIndex++
      const slot = harness.slots[index] ?? (harness.slots[index] = { value: typeof initial === "function" ? (initial as () => T)() : initial })
      const setter = (next: T | ((prev: T) => T)) => {
        slot.value = typeof next === "function" ? (next as (prev: T) => T)(slot.value as T) : next
      }
      return [slot.value as T, setter] as const
    },
    useRef: <T>(initial: T) => {
      const index = harness.hookIndex++
      const slot = harness.slots[index] ?? (harness.slots[index] = { value: { current: initial } })
      return slot.value as { current: T }
    },
    useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
      const index = harness.hookIndex++
      const previous = harness.slots[index]
      if (previous && sameDeps(previous.deps, deps)) return
      previous?.cleanup?.()
      const cleanup = effect()
      harness.slots[index] = { deps, ...(typeof cleanup === "function" ? { cleanup } : {}) }
    },
  }))
  vi.doMock("../src/hooks/connector-context", () => ({
    useConnector: () => harness.connector,
  }))
  hooks = await import("../src/hooks/use-votes")
})

beforeEach(resetHarness)

describe("useVotes — write contract (auth-bound record facade)", () => {
  it("casts a vote through createRelationRecord with the canonical author-bound input — never a caller-supplied createdBy", async () => {
    const { connector: c, writes } = connector([])
    harness.connector = c
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    await result.vote("green")

    expect(writes.created).toEqual([{
      predicate: "votesOn",
      from: `global:${ME}`,
      to: `item:${STATEMENT}`,
      fields: { value: "green" },
    }])
    expect("createdBy" in (writes.created[0] as object)).toBe(false)
    expect(writes.updated).toHaveLength(0)
    expect(writes.deleted).toHaveLength(0)
  })

  it("switches stance via updateRelationRecord on the OWN record — no delete/create churn", async () => {
    const mine = voteRecord("rel-mine", ME, "green")
    const { connector: c, writes } = connector([mine])
    harness.connector = c
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    await result.vote("red")

    expect(writes.updated).toEqual([{ id: "rel-mine", updates: { fields: { value: "red" } } }])
    expect(writes.created).toHaveLength(0)
    expect(writes.deleted).toHaveLength(0)
  })

  it("withdraws the vote via deleteRelationRecord when the same value is cast again", async () => {
    const mine = voteRecord("rel-mine", ME, "yellow")
    const { connector: c, writes } = connector([mine])
    harness.connector = c
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    await result.vote("yellow")

    expect(writes.deleted).toEqual(["rel-mine"])
    expect(writes.created).toHaveLength(0)
    expect(writes.updated).toHaveLength(0)
  })

  it("resolves rapid serialized same-value clicks against FRESH records: create, then withdraw", async () => {
    // Two quick green clicks with no re-render in between: the second must see
    // the first one's record (fresh read) and withdraw it — not compare
    // against the stale rendered myVote and vote again.
    const { connector: c, writes } = connector([])
    harness.connector = c
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    await result.vote("green")
    await result.vote("green")

    expect(writes.created).toHaveLength(1)
    expect(writes.deleted).toEqual(["rel-0"])
  })

  it("repairs an existing canonical record with an INVALID value via update — no permanently optimistic vote (#211)", async () => {
    // The idempotent create returns the pre-existing broken record unchanged;
    // the hook must detect the mismatch and repair the OWN record.
    const broken = voteRecord("rel-mine", ME, "purple")
    const { connector: c, writes } = connector([broken])
    harness.connector = c
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    await result.vote("green")

    expect(writes.updated).toEqual([{ id: "rel-mine", updates: { fields: { value: "green" } } }])
    expect(writes.deleted).toHaveLength(0)
  })

  it("repairs an existing canonical record with a MISSING value the same way (#211)", async () => {
    const broken = voteRecord("rel-mine", ME, "unused", { fields: {} })
    const { connector: c, writes } = connector([broken])
    harness.connector = c
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    await result.vote("yellow")

    expect(writes.updated).toEqual([{ id: "rel-mine", updates: { fields: { value: "yellow" } } }])
    expect(writes.deleted).toHaveLength(0)
  })

  it("never votes anonymously: no user → no write and canVote=false", async () => {
    const { connector: c, writes } = connector([], { userId: null })
    harness.connector = c
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    expect(result.canVote).toBe(false)
    await result.vote("green")
    expect(writes.created).toHaveLength(0)
  })

  it("requires Authenticatable: a writer without identity cannot vote", async () => {
    const { connector: c, writes } = connector([], { authenticatable: false })
    harness.connector = c
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    expect(result.canVote).toBe(false)
    await result.vote("green")
    expect(writes.created).toHaveLength(0)
  })
})

describe("useVotes — aggregation (shared validation)", () => {
  it("aggregates the distribution and marks the own stance", async () => {
    harness.connector = connector([
      voteRecord("rel-1", OTHER, "green"),
      voteRecord("rel-2", "did:key:third", "green"),
      voteRecord("rel-3", "did:key:fourth", "red"),
      voteRecord("rel-4", ME, "yellow"),
    ]).connector
    const result = await renderHookVerified(() => hooks.useVotes(STATEMENT))
    expect(result.summary).toEqual({ green: 2, yellow: 1, red: 1, total: 4, myVote: "yellow" })
  })

  it("ignores forged records (endpoint not bound to author) and malformed values", async () => {
    harness.connector = connector([
      voteRecord("rel-1", OTHER, "green"),
      // Forged: claims OTHER's endpoint but was written by a third DID.
      voteRecord("rel-2", OTHER, "red", { createdBy: "did:key:mallory" }),
      voteRecord("rel-3", "did:key:third", "purple"),
    ]).connector
    const result = await renderHookVerified(() => hooks.useVotes(STATEMENT))
    expect(result.summary).toEqual({ green: 1, yellow: 0, red: 0, total: 1 })
  })

  it("counts at most one vote per voter even when duplicate records exist", async () => {
    harness.connector = connector([
      voteRecord("rel-b", OTHER, "green"),
      voteRecord("rel-a", OTHER, "red"),
    ]).connector
    const result = await renderHookVerified(() => hooks.useVotes(STATEMENT))
    expect(result.summary.total).toBe(1)
    expect(result.summary.red).toBe(1) // deterministic winner: smallest record id
  })
})

describe("useVotes — claim verdicts (fail closed, spec 08 L1-L3)", () => {
  it("counts only after verification settles — fail closed from the first frame", async () => {
    harness.connector = connector([voteRecord("rel-1", OTHER, "green")]).connector
    // First frames: verdicts pending → nothing counts.
    const early = renderHookSettled(() => hooks.useVotes(STATEMENT))
    expect(early.summary.total).toBe(0)
    // After the verdict effect settles: counted (monotone unverified→counted).
    const settled = await renderHookVerified(() => hooks.useVotes(STATEMENT))
    expect(settled.summary).toEqual({ green: 1, yellow: 0, red: 0, total: 1 })
  })

  it("invalid records never count", async () => {
    harness.connector = connector([
      voteRecord("rel-good", OTHER, "green"),
      voteRecord("rel-bad", "did:key:third", "red"),
    ], { verdicts: (record) => (record.id === "rel-bad" ? "invalid" : "valid") }).connector
    const result = await renderHookVerified(() => hooks.useVotes(STATEMENT))
    expect(result.summary).toEqual({ green: 1, yellow: 0, red: 0, total: 1 })
  })

  it("a connector WITHOUT the verification capability yields an empty authorial aggregate", async () => {
    harness.connector = connector([voteRecord("rel-1", OTHER, "green")], { verdicts: false }).connector
    const result = await renderHookVerified(() => hooks.useVotes(STATEMENT))
    expect(result.summary.total).toBe(0)
  })
})

describe("useVotes — verdict binds CONTENT, not just the record id (#235 review)", () => {
  it("a content change under the same id does NOT reuse the old valid verdict", async () => {
    const record = voteRecord("rel-1", OTHER, "green")
    // Emit-capable observable, like the real record stream.
    let current = [record]
    const listeners = new Set<(value: RelationRecord[]) => void>()
    const live = {
      get current() { return current },
      loaded: true,
      subscribe: (callback: (value: RelationRecord[]) => void) => {
        listeners.add(callback)
        return () => listeners.delete(callback)
      },
    }
    const { connector: c } = connector([record], {
      // Content-dependent verdict: green is valid, red is invalid.
      verdicts: (candidate) => ((candidate.fields as { value?: string }).value === "green" ? "valid" : "invalid"),
    })
    ;(c as unknown as { observeRelationRecords: ReturnType<typeof vi.fn> }).observeRelationRecords
      .mockImplementation(() => live)
    harness.connector = c
    const counted = await renderHookVerified(() => hooks.useVotes(STATEMENT))
    expect(counted.summary.total).toBe(1)

    // A manipulated peer write: SAME id, changed content, emitted as a new
    // array — exactly what the real observable does.
    current = [{ ...record, fields: { value: "red" } }]
    for (const listener of listeners) listener(current)

    // FAIL CLOSED immediately: the stale id-keyed verdict must not carry
    // over to different content — even BEFORE re-verification settles.
    const early = renderHook(() => hooks.useVotes(STATEMENT))
    expect(early.summary.total).toBe(0)

    // And after settling, the invalid verdict keeps it out.
    const settled = await renderHookVerified(() => hooks.useVotes(STATEMENT))
    expect(settled.summary.total).toBe(0)
  })
})

describe("useVoteUsers — transparent voter list", () => {
  it("subscribes to the records observable instead of a one-shot read", () => {
    const { connector: c } = connector([voteRecord("rel-1", OTHER, "green")])
    const subscribeSpy = vi.fn(() => () => {})
    const observeSpy = (c as unknown as { observeRelationRecords: ReturnType<typeof vi.fn> }).observeRelationRecords
    observeSpy.mockImplementation(() => ({
      current: [voteRecord("rel-1", OTHER, "green")],
      loaded: true,
      subscribe: subscribeSpy,
    }))
    harness.connector = c
    renderHookSettled(() => hooks.useVoteUsers(STATEMENT))
    expect(observeSpy).toHaveBeenCalled()
    // The reactive contract: the hook actually SUBSCRIBES — a later record
    // change re-renders the voter list, it is not a one-shot read.
    expect(subscribeSpy).toHaveBeenCalled()
  })
})
