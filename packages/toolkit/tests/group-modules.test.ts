import { describe, expect, it, vi } from "vitest"

import { createLatestWinsSaver, moveModule } from "../src/components/layout/group-dialog"

/**
 * `data.modules` is an ORDERED array and the nav renders it verbatim —
 * moveModule is the whole ordering contract, so it gets pinned here.
 */
describe("moveModule", () => {
  const mods = ["feed", "kanban", "map"]

  it("moves a module up and down by one", () => {
    expect(moveModule(mods, "kanban", -1)).toEqual(["kanban", "feed", "map"])
    expect(moveModule(mods, "kanban", 1)).toEqual(["feed", "map", "kanban"])
  })

  it("keeps the list unchanged at the edges", () => {
    expect(moveModule(mods, "feed", -1)).toEqual(mods)
    expect(moveModule(mods, "map", 1)).toEqual(mods)
  })

  it("ignores unknown ids", () => {
    expect(moveModule(mods, "ghost", 1)).toEqual(mods)
  })

  it("never mutates the input", () => {
    const input = ["a", "b"]
    moveModule(input, "a", 1)
    expect(input).toEqual(["a", "b"])
  })
})

/** A save whose settlement the test controls explicitly. */
function controlledSave() {
  const calls: Array<{ value: string[]; resolve: () => void; reject: (e: Error) => void }> = []
  const save = (value: string[]) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ value, resolve, reject })
    })
  return { calls, save }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe("createLatestWinsSaver", () => {
  it("runs at most one save and collapses bursts to the latest state", async () => {
    const { calls, save } = controlledSave()
    const onError = vi.fn()
    const push = createLatestWinsSaver(save, onError)

    push(["a"])
    push(["a", "b"])
    push(["b", "a"]) // three rapid clicks while the first save hangs
    expect(calls).toHaveLength(1)

    calls[0].resolve()
    await flush()
    // Intermediate state ["a","b"] is never sent — only the latest.
    expect(calls.map((c) => c.value)).toEqual([["a"], ["b", "a"]])

    calls[1].resolve()
    await flush()
    expect(calls).toHaveLength(2)
    expect(onError).not.toHaveBeenCalled()
  })

  it("a slow older save cannot finish after (and thus overwrite) a newer one", async () => {
    const { calls, save } = controlledSave()
    const push = createLatestWinsSaver(save, vi.fn())

    push(["old"])
    push(["new"])
    // The newer state is not even dispatched until the older save settles —
    // out-of-order completion is impossible by construction.
    expect(calls).toHaveLength(1)
    calls[0].resolve()
    await flush()
    expect(calls[1].value).toEqual(["new"])
  })

  it("surfaces a failure only when nothing newer is pending", async () => {
    const { calls, save } = controlledSave()
    const onError = vi.fn()
    const push = createLatestWinsSaver(save, onError)

    push(["a"])
    calls[0].reject(new Error("offline"))
    await flush()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][1]).toEqual(["a"])
  })

  it("retries with the newer queued state instead of reporting an obsolete failure", async () => {
    const { calls, save } = controlledSave()
    const onError = vi.fn()
    const push = createLatestWinsSaver(save, onError)

    push(["a"])
    push(["b"])
    calls[0].reject(new Error("flaky"))
    await flush()
    expect(calls[1].value).toEqual(["b"])
    expect(onError).not.toHaveBeenCalled()

    calls[1].resolve()
    await flush()
    expect(onError).not.toHaveBeenCalled()
  })
})

describe("createLatestWinsSaver rollback anchor", () => {
  it("hands onError the last CONFIRMED state, not an older baseline", async () => {
    const { calls, save } = controlledSave()
    const onError = vi.fn()
    const push = createLatestWinsSaver(save, onError)

    push(["a"])
    calls[0].resolve() // A ist bestätigt gespeichert
    await flush()
    push(["a", "b"])
    calls[1].reject(new Error("offline")) // B scheitert
    await flush()

    // Rollback-Anker ist A — der Prop-Stand des Aufrufers kann noch auf dem
    // Zustand VOR A hängen (Store-Roundtrip), der Saver weiss es besser.
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][1]).toEqual(["a", "b"]) // failed
    expect(onError.mock.calls[0][2]).toEqual(["a"]) // lastSaved
  })

  it("lastSaved is undefined when nothing was ever confirmed", async () => {
    const { calls, save } = controlledSave()
    const onError = vi.fn()
    const push = createLatestWinsSaver(save, onError)

    push(["a"])
    calls[0].reject(new Error("offline"))
    await flush()
    expect(onError.mock.calls[0][2]).toBeUndefined()
  })
})

describe("createLatestWinsSaver success signal", () => {
  it("reports a confirmed save so the caller can clear a stale error", async () => {
    const { calls, save } = controlledSave()
    const onError = vi.fn()
    const onSaved = vi.fn()
    const push = createLatestWinsSaver(save, onError, onSaved)

    push(["a"])
    calls[0].reject(new Error("offline"))
    await flush()
    expect(onError).toHaveBeenCalledTimes(1)

    push(["a", "b"]) // neuer Versuch nach dem Fehler
    calls[1].resolve()
    await flush()
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved.mock.calls[0][0]).toEqual(["a", "b"])
  })
})
