import { describe, expect, it } from "vitest"
import {
  AdaptivePanelScrollLock,
  AdaptivePanelStack,
  getAdaptivePanelZIndex,
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

  it("keeps deep stacks distinct and below the dialog layer", () => {
    const stack = new AdaptivePanelStack()
    const positions = new Map<symbol, { order: number; size: number }>()
    const panels = Array.from({ length: 8 }, (_, index) => Symbol(`panel-${index}`))

    expect(
      Array.from({ length: 5 }, (_, index) => getAdaptivePanelZIndex(index + 1, 5)),
    ).toEqual([60, 61, 62, 63, 64])

    for (const panel of panels) {
      stack.upsert(
        panel,
        { mode: "modal", side: "right", sidebarWidth: 400 },
        (order, size) => positions.set(panel, { order, size }),
      )
    }

    const layers = panels.map((panel) => {
      const position = positions.get(panel)!
      return getAdaptivePanelZIndex(position.order, position.size)
    })

    expect(layers).toEqual([57, 58, 59, 60, 61, 62, 63, 64])
    expect(new Set(layers).size).toBe(panels.length)
    expect(Math.max(...layers)).toBeLessThan(65)
    expect(stack.isTopmost(panels.at(-1)!)).toBe(true)

    stack.remove(panels[3])
    const remainingPanels = panels.filter((panel) => panel !== panels[3])
    const compactedLayers = remainingPanels.map((panel) => {
      const position = positions.get(panel)!
      return getAdaptivePanelZIndex(position.order, position.size)
    })

    expect(compactedLayers).toEqual([58, 59, 60, 61, 62, 63, 64])
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
