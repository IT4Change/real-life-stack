import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { DataInterface, Item, Observable } from "@real-life-stack/data-interface"

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

function staticObservable<T>(value: T): Observable<T> {
  return { current: value, loaded: true, subscribe: () => () => {} }
}

const ME = "did:key:me"
const OTHER = "did:key:other"
const STATEMENT = "statement-1"

function voteItem(id: string, createdBy: string, value: string): Item {
  return {
    id,
    type: "vote",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdBy,
    data: { value },
    relations: [{ predicate: "votesOn", target: `item:${STATEMENT}` }],
  }
}

interface FakeWrites {
  created: unknown[]
  updated: Array<{ id: string; updates: unknown }>
  deleted: string[]
}

function connector(existingVotes: Item[], opts?: { userId?: string | null }): { connector: DataInterface; writes: FakeWrites } {
  const writes: FakeWrites = { created: [], updated: [], deleted: [] }
  const userId = opts?.userId === undefined ? ME : opts.userId
  const fake = {
    init: async () => {},
    dispose: async () => {},
    getItems: async () => [],
    getItem: async () => null,
    observe: () => staticObservable<Item[]>([]),
    observeItem: () => staticObservable<Item | null>(null),
    // ItemWriter
    createItem: vi.fn(async (input: { id?: string }) => { writes.created.push(input); return { ...input } }),
    updateItem: vi.fn(async (id: string, updates: unknown) => { writes.updated.push({ id, updates }); return {} }),
    deleteItem: vi.fn(async (id: string) => { writes.deleted.push(id) }),
    // RelationCapable
    getRelatedItems: vi.fn(async () => existingVotes),
    observeRelatedItems: vi.fn(() => staticObservable<Item[]>(existingVotes)),
    // Authenticatable
    getCurrentUser: async () => (userId ? { id: userId, displayName: "Me" } : null),
    observeCurrentUser: () => staticObservable(userId ? { id: userId, displayName: "Me" } : null),
    getUser: async (id: string) => ({ id, displayName: id }),
    getAuthState: () => (userId ? "authenticated" : "unauthenticated"),
    authenticate: async () => { throw new Error("unused") },
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

describe("useVotes — write contract", () => {
  it("casts a vote as an OWN item with the deterministic id and votesOn relation", async () => {
    const { connector: c, writes } = connector([])
    harness.connector = c
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    await result.vote("green")

    expect(writes.created).toHaveLength(1)
    const created = writes.created[0] as { id: string; type: string; createdBy: string; data: { value: string }; relations: Array<{ predicate: string; target: string }> }
    expect(created.id).toBe(`vote:${STATEMENT}:${ME}`) // structural one-vote-per-user
    expect(created.type).toBe("vote")
    expect(created.createdBy).toBe(ME)
    expect(created.data.value).toBe("green")
    expect(created.relations).toEqual([{ predicate: "votesOn", target: `item:${STATEMENT}` }])
    expect(writes.updated).toHaveLength(0)
    expect(writes.deleted).toHaveLength(0)
  })

  it("switches stance via updateItem on the OWN vote item — no delete/create churn", async () => {
    const mine = voteItem(`vote:${STATEMENT}:${ME}`, ME, "green")
    const { connector: c, writes } = connector([mine])
    harness.connector = c
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    await result.vote("red")

    expect(writes.updated).toEqual([{ id: mine.id, updates: { data: { value: "red" } } }])
    expect(writes.created).toHaveLength(0)
    expect(writes.deleted).toHaveLength(0)
  })

  it("withdraws the vote via deleteItem when the same value is cast again", async () => {
    const mine = voteItem(`vote:${STATEMENT}:${ME}`, ME, "yellow")
    const { connector: c, writes } = connector([mine])
    harness.connector = c
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    await result.vote("yellow")

    expect(writes.deleted).toEqual([mine.id])
    expect(writes.created).toHaveLength(0)
    expect(writes.updated).toHaveLength(0)
  })

  it("never votes anonymously: no user → no write and canVote=false", async () => {
    const { connector: c, writes } = connector([], { userId: null })
    harness.connector = c
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    expect(result.canVote).toBe(false)
    await result.vote("green")
    expect(writes.created).toHaveLength(0)
  })
})

describe("useVotes — aggregation", () => {
  it("aggregates the distribution and marks the own stance", () => {
    harness.connector = connector([
      voteItem("v1", OTHER, "green"),
      voteItem("v2", "did:key:third", "green"),
      voteItem("v3", "did:key:fourth", "red"),
      voteItem(`vote:${STATEMENT}:${ME}`, ME, "yellow"),
    ]).connector
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    expect(result.summary).toEqual({ green: 2, yellow: 1, red: 1, total: 4, myVote: "yellow" })
  })

  it("ignores malformed vote values", () => {
    harness.connector = connector([
      voteItem("v1", OTHER, "green"),
      voteItem("v2", "did:key:third", "purple"),
    ]).connector
    const result = renderHookSettled(() => hooks.useVotes(STATEMENT))
    expect(result.summary.total).toBe(1)
    expect(result.summary.green).toBe(1)
  })
})
