import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

import { createCoalescedRunner } from "../src/coalesced-runner.js"

describe("createCoalescedRunner", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it("fasst mehrere Auslöser innerhalb des Fensters zu EINEM Lauf zusammen", async () => {
    const run = vi.fn(async () => {})
    const trigger = createCoalescedRunner(run, 100)

    for (let i = 0; i < 20; i++) trigger()
    expect(run).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("zieht genau einen Lauf nach, wenn während eines Laufs ausgelöst wird", async () => {
    let release: () => void = () => {}
    const run = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const trigger = createCoalescedRunner(run, 100)

    trigger()
    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(1)

    // Drei Auslöser während der erste Lauf noch hängt
    trigger(); trigger(); trigger()
    release()
    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("bleibt nach einem Fehler auslösbar", async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error("kaputt"))
      .mockResolvedValue(undefined)
    const trigger = createCoalescedRunner(run, 100)

    trigger()
    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(1)

    trigger()
    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("cancel() verhindert einen noch ausstehenden Lauf und lässt keinen Timer zurück", async () => {
    const run = vi.fn(async () => {})
    const trigger = createCoalescedRunner(run, 100)

    trigger()
    trigger.cancel()
    await vi.advanceTimersByTimeAsync(1000)

    expect(run).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
