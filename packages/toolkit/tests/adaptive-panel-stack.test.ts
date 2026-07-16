import { describe, expect, it } from "vitest"
import {
  AdaptivePanelScrollLock,
  AdaptivePanelStack,
} from "../src/components/layout/adaptive-panel-stack"

describe("AdaptivePanelStack", () => {
  it("keeps a sidebar inset while a modal is stacked above it", () => {
    const stack = new AdaptivePanelStack()
    const detail = Symbol("detail")
    const profile = Symbol("profile")

    stack.upsert(detail, { mode: "sidebar", side: "right", sidebarWidth: 420 })
    stack.upsert(profile, { mode: "modal", side: "right", sidebarWidth: 400 })

    expect(stack.getInsets()).toEqual({ left: 0, right: 420 })
    expect(stack.isTopmost(detail)).toBe(false)
    expect(stack.isTopmost(profile)).toBe(true)

    stack.remove(profile)
    expect(stack.getInsets()).toEqual({ left: 0, right: 420 })
    expect(stack.isTopmost(detail)).toBe(true)
  })

  it("updates an existing panel without moving it above a newer overlay", () => {
    const stack = new AdaptivePanelStack()
    const detail = Symbol("detail")
    const profile = Symbol("profile")

    stack.upsert(detail, { mode: "sidebar", side: "right", sidebarWidth: 420 })
    stack.upsert(profile, { mode: "modal", side: "right", sidebarWidth: 400 })
    stack.upsert(detail, { mode: "sidebar", side: "right", sidebarWidth: 520 })

    expect(stack.getInsets()).toEqual({ left: 0, right: 520 })
    expect(stack.isTopmost(profile)).toBe(true)
  })

  it("tracks independent left and right sidebar insets", () => {
    const stack = new AdaptivePanelStack()

    stack.upsert(Symbol("left"), { mode: "sidebar", side: "left", sidebarWidth: 300 })
    stack.upsert(Symbol("right"), { mode: "sidebar", side: "right", sidebarWidth: 480 })

    expect(stack.getInsets()).toEqual({ left: 300, right: 480 })
  })

  it("keeps presentation order stable across updates and renews it after close", () => {
    const stack = new AdaptivePanelStack()
    const first = Symbol("first")
    const second = Symbol("second")

    const firstOrder = stack.upsert(first, { mode: "sidebar", side: "right", sidebarWidth: 300 })
    const secondOrder = stack.upsert(second, { mode: "modal", side: "right", sidebarWidth: 400 })

    expect(stack.upsert(first, { mode: "sidebar", side: "right", sidebarWidth: 320 })).toBe(firstOrder)
    expect(secondOrder).toBeGreaterThan(firstOrder)
    expect(stack.isTopmost(second)).toBe(true)

    let compactedSecondOrder = secondOrder
    stack.upsert(second, { mode: "modal", side: "right", sidebarWidth: 400 }, (order) => {
      compactedSecondOrder = order
    })
    stack.remove(first)
    expect(compactedSecondOrder).toBe(1)
    expect(stack.upsert(first, { mode: "sidebar", side: "right", sidebarWidth: 320 })).toBe(2)
    expect(stack.isTopmost(first)).toBe(true)
  })

  it("can retain exit ordering without retaining a sidebar inset", () => {
    const stack = new AdaptivePanelStack()
    const sidebar = Symbol("sidebar")

    stack.upsert(sidebar, {
      mode: "sidebar",
      side: "right",
      sidebarWidth: 420,
      insetActive: false,
    })

    expect(stack.getInsets()).toEqual({ left: 0, right: 0 })
    expect(stack.isTopmost(sidebar)).toBe(true)
  })
})

describe("AdaptivePanelScrollLock", () => {
  it("keeps scrolling locked until the last panel releases it", () => {
    const lock = new AdaptivePanelScrollLock()
    const target = { style: { overflow: "auto" } }
    const first = Symbol("first")
    const second = Symbol("second")

    lock.acquire(first, target)
    lock.acquire(second, target)
    lock.release(first, target)
    expect(target.style.overflow).toBe("hidden")

    lock.release(second, target)
    expect(target.style.overflow).toBe("auto")
  })

  it("handles StrictMode-style release and reacquire cycles", () => {
    const lock = new AdaptivePanelScrollLock()
    const target = { style: { overflow: "" } }
    const first = Symbol("first")
    const second = Symbol("second")

    lock.acquire(first, target)
    lock.acquire(second, target)
    lock.release(first, target)
    lock.release(second, target)
    lock.acquire(first, target)
    lock.acquire(second, target)
    lock.release(second, target)
    lock.release(first, target)

    expect(target.style.overflow).toBe("")
  })
})
