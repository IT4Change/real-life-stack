// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import { createObservable, type Item } from "@real-life-stack/data-interface"
import { ConnectorProvider } from "../src/hooks/connector-context"
import { ReactionBar } from "../src/components/reactions/reaction-bar"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const reaction = (id: string, emoji: string, by: string): Item =>
  ({ id, type: "reaction", createdAt: "2026-08-06T10:00:00.000Z", createdBy: by,
     data: { emoji }, relations: [{ predicate: "reactsTo", target: "item:post-1" }] }) as Item

function harness(existing: Item[]) {
  const related = createObservable<Item[]>(existing)
  const created: unknown[] = []
  const fake = {
    observeRelatedItems: () => related,
    getRelatedItems: async () => related.current,
    createItem: async (input: unknown) => { created.push(input); return { id: "new" } as Item },
    deleteItem: async () => {},
    updateItem: async () => ({}) as Item,
    relate: async () => {}, unrelate: async () => {},
    getCurrentUser: async () => ({ id: "me", displayName: "Ich" }),
    observeCurrentUser: () => createObservable({ id: "me", displayName: "Ich" }),
    getAuthState: () => createObservable({ status: "authenticated" as const }),
    getItems: async () => [], observeItems: () => createObservable<Item[]>([]),
    getItem: async () => null, observeItem: () => createObservable<Item | null>(null),
    getUser: async () => ({ id: "me", displayName: "Ich" }),
  }
  return { fake, created }
}

async function mount(existing: Item[], onOpenDetails: (emoji?: string) => void) {
  const { fake, created } = harness(existing)
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(createElement(ConnectorProvider, { connector: fake as never },
      createElement(ReactionBar, { itemId: "post-1", onOpenDetails })))
  })
  await act(async () => { await Promise.resolve() })
  return { host, root, created }
}

/**
 * Full pointer sequence a real short click produces, in the real ORDER
 * (pointerdown → pointerup → click). jsdom has no PointerEvent, but React
 * dispatches by event NAME, so a MouseEvent named "pointerdown" reaches the
 * same handler — and the ordering is what this test is about.
 */
async function clickLike(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
    el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }))
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

describe("ReactionPill — Zahl-Klick vs. Reaktion", () => {
  it("Klick auf die ZAHL oeffnet nur die Details und schaltet KEINE Reaktion", async () => {
    const onOpenDetails = vi.fn()
    const { host, root, created } = await mount([reaction("r1", "👍", "other")], onOpenDetails)
    const count = host.querySelector("[data-reaction-count]")
    expect(count, "Zahl-Element muss adressierbar sein").not.toBeNull()

    await clickLike(count!)

    expect(onOpenDetails).toHaveBeenCalledWith("👍")
    // Der Toggle haengt am pointerup der ganzen Pille; ohne eigene
    // Pointer-Behandlung feuert er MIT — stopPropagation auf dem click
    // kommt zu spaet, weil Pointer-Events vorher laufen.
    expect(created, "Zahl-Klick darf keine Reaktion erzeugen").toHaveLength(0)

    await act(async () => root.unmount())
    host.remove()
  })

  it("Klick auf das EMOJI schaltet weiterhin die eigene Reaktion", async () => {
    const onOpenDetails = vi.fn()
    const { host, root, created } = await mount([reaction("r1", "👍", "other")], onOpenDetails)
    const emoji = host.querySelector("[data-reaction-emoji]")
    expect(emoji).not.toBeNull()

    await clickLike(emoji!)

    expect(created).toHaveLength(1)
    expect(onOpenDetails).not.toHaveBeenCalled()

    await act(async () => root.unmount())
    host.remove()
  })
})
