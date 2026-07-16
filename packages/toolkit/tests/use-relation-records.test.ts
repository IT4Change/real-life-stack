import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  DataInterface,
  Item,
  Observable,
  RelationRecord,
  RelationRecordCapable,
} from "@real-life-stack/data-interface"

interface HookSlot {
  cleanup?: () => void
  deps?: readonly unknown[]
  value?: unknown
}

const harness = {
  connector: null as unknown as DataInterface,
  hookIndex: 0,
  rerenders: 0,
  slots: [] as HookSlot[],
}

function sameDeps(left: readonly unknown[] | undefined, right: readonly unknown[]): boolean {
  return left !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
}

function resetHarness(): void {
  for (const slot of harness.slots) slot?.cleanup?.()
  harness.hookIndex = 0
  harness.rerenders = 0
  harness.slots = []
}

function renderHook<T>(render: () => T): T {
  harness.hookIndex = 0
  return render()
}

interface TrackedObservable<T> extends Observable<T> {
  emit(value: T): void
  markLoaded(): void
  subscribeSpy: ReturnType<typeof vi.fn>
  unsubscribeSpy: ReturnType<typeof vi.fn>
}

function trackedObservable<T>(initial: T, initiallyLoaded = true): TrackedObservable<T> {
  let current = initial
  let loaded = initiallyLoaded
  const listeners = new Set<(value: T) => void>()
  const unsubscribeSpy = vi.fn()
  const subscribeSpy = vi.fn((callback: (value: T) => void) => {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
      unsubscribeSpy()
    }
  })

  return {
    get current() {
      return current
    },
    get loaded() {
      return loaded
    },
    subscribe: subscribeSpy,
    subscribeSpy,
    unsubscribeSpy,
    emit(value: T) {
      current = value
      for (const listener of listeners) listener(value)
    },
    markLoaded() {
      if (loaded) return
      loaded = true
      for (const listener of listeners) listener(current)
    },
  }
}

function record(id: string, predicate: string): RelationRecord {
  return {
    id,
    predicate,
    from: "item:a",
    to: "item:b",
    createdBy: "did:example:user",
    createdAt: "2026-07-16T00:00:00.000Z",
  }
}

function item(id: string): Item {
  return {
    id,
    type: "person",
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "did:example:user",
    data: {},
  }
}

function connector(capability?: Partial<RelationRecordCapable>): DataInterface {
  return {
    init: async () => {},
    dispose: async () => {},
    getItems: async () => [],
    getItem: async () => null,
    observe: () => trackedObservable<Item[]>([]),
    observeItem: () => trackedObservable<Item | null>(null),
    ...capability,
  } as DataInterface
}

let hooks: typeof import("../src/hooks/use-relation-records")

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
    useReducer: () => {
      harness.hookIndex++
      return [0, () => { harness.rerenders += 1 }]
    },
    useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
      const index = harness.hookIndex++
      const previous = harness.slots[index]
      if (previous && sameDeps(previous.deps, deps)) return
      previous?.cleanup?.()
      const cleanup = effect()
      harness.slots[index] = {
        deps,
        ...(typeof cleanup === "function" ? { cleanup } : {}),
      }
    },
  }))
  vi.doMock("../src/hooks/connector-context", () => ({
    useConnector: () => harness.connector,
  }))
  hooks = await import("../src/hooks/use-relation-records")
})

beforeEach(resetHarness)

afterAll(() => {
  resetHarness()
  vi.doUnmock("react")
  vi.doUnmock("../src/hooks/connector-context")
})

describe("relation record hooks", () => {
  it("reads loaded fresh after an unchanged empty observable marks itself loaded", () => {
    const records = trackedObservable<RelationRecord[]>([], false)
    harness.connector = connector({
      getRelationRecords: async () => [],
      observeRelationRecords: () => records,
      getRelationNeighbors: async () => [],
      observeRelationNeighbors: () => trackedObservable<Item[]>([]),
    })

    const first = renderHook(() => hooks.useRelationRecords())
    expect(first).toEqual({ data: [], isLoading: true, supported: true })

    records.markLoaded()
    expect(harness.rerenders).toBeGreaterThan(0)
    const loaded = renderHook(() => hooks.useRelationRecords())
    expect(loaded).toEqual({ data: [], isLoading: false, supported: true })
    expect(records.subscribeSpy).toHaveBeenCalledTimes(1)
  })

  it("replaces the observable and subscription when filter or connector changes", () => {
    const alpha = trackedObservable([record("alpha", "alpha")])
    const beta = trackedObservable([record("beta", "beta")])
    const betaOnSecondConnector = trackedObservable([record("second", "beta")])
    const observeFirst = vi.fn((filter?: { predicate?: string }) => (
      filter?.predicate === "beta" ? beta : alpha
    ))
    const observeSecond = vi.fn(() => betaOnSecondConnector)
    const capability = (observeRelationRecords: typeof observeFirst): RelationRecordCapable => ({
      getRelationRecords: async () => [],
      observeRelationRecords,
      getRelationNeighbors: async () => [],
      observeRelationNeighbors: () => trackedObservable<Item[]>([]),
    })

    harness.connector = connector(capability(observeFirst))
    expect(renderHook(() => hooks.useRelationRecords({ predicate: "alpha" })).data[0]?.id).toBe("alpha")
    expect(renderHook(() => hooks.useRelationRecords({ predicate: "beta" })).data[0]?.id).toBe("beta")
    expect(alpha.unsubscribeSpy).toHaveBeenCalledTimes(1)

    harness.connector = connector(capability(observeSecond))
    expect(renderHook(() => hooks.useRelationRecords({ predicate: "beta" })).data[0]?.id).toBe("second")
    expect(beta.unsubscribeSpy).toHaveBeenCalledTimes(1)
    expect(observeFirst).toHaveBeenCalledTimes(2)
    expect(observeSecond).toHaveBeenCalledTimes(1)
  })

  it("switches neighbor subscriptions when endpoint or predicate changes", () => {
    const neighborA = trackedObservable([item("a")])
    const neighborB = trackedObservable([item("b")])
    const observeNeighbors = vi.fn((endpoint: string, predicate?: string) => (
      endpoint === "item:b" && predicate === "knows" ? neighborB : neighborA
    ))
    harness.connector = connector({
      getRelationRecords: async () => [],
      observeRelationRecords: () => trackedObservable<RelationRecord[]>([]),
      getRelationNeighbors: async () => [],
      observeRelationNeighbors: observeNeighbors,
    })

    expect(renderHook(() => hooks.useRelationNeighbors("item:a")).data[0]?.id).toBe("a")
    expect(renderHook(() => hooks.useRelationNeighbors("item:b", "knows")).data[0]?.id).toBe("b")
    expect(neighborA.unsubscribeSpy).toHaveBeenCalledTimes(1)
    expect(observeNeighbors).toHaveBeenCalledTimes(2)
  })

  it("returns a loaded, stable unsupported result without subscribing", () => {
    harness.connector = connector()

    const first = renderHook(() => hooks.useRelationRecords())
    const second = renderHook(() => hooks.useRelationRecords())

    expect(first).toEqual({ data: [], isLoading: false, supported: false })
    expect(second.data).toBe(first.data)
  })
})
