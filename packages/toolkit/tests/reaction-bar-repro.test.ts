// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { createObservable } from "@real-life-stack/data-interface"
import type { Item } from "@real-life-stack/data-interface"
import { ConnectorProvider } from "../src/hooks/connector-context"
import { ReactionBar } from "../src/components/reactions/reaction-bar"

/** Minimal fake satisfying isWritable/hasRelations/isAuthenticatable guards. */
function fakeConnector() {
  const items = new Map<string, Item>()
  const post: Item = { id: "p1", type: "post", createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", data: { text: "hi" } }
  items.set(post.id, post)
  const itemObs = createObservable<Item | null>(post)
  const relatedObs = createObservable<Item[]>([])
  const emitRelated = () => relatedObs.set([...items.values()].filter((item) => item.type === "reaction"))
  return {
    items,
    emitItem: (item: Item) => itemObs.set(item),
    getItems: async () => [...items.values()],
    observeItems: () => createObservable([...items.values()]),
    getItem: async (id: string) => items.get(id) ?? null,
    observeItem: () => itemObs,
    createItem: async (input: Record<string, unknown>) => {
      const item = { createdAt: "2026-01-01T00:00:01.000Z", id: `r-${items.size}`, ...input } as Item
      items.set(item.id, item)
      emitRelated()
      return item
    },
    updateItem: async () => post,
    deleteItem: async (id: string) => { items.delete(id); emitRelated() },
    getRelatedItems: async () => [...items.values()].filter((item) => item.type === "reaction"),
    observeRelatedItems: () => relatedObs,
    createRelationRecord: async () => ({}),
    updateRelationRecord: async () => ({}),
    deleteRelationRecord: async () => {},
    getRelationRecords: async () => [],
    observeRelationRecords: () => createObservable([]),
    login: async () => {}, logout: async () => {},
    getCurrentUser: async () => ({ id: "user-1", displayName: "User" }),
    observeCurrentUser: () => createObservable({ id: "user-1", displayName: "User" }),
    observeAuthState: () => createObservable({ status: "authenticated" }),
  }
}

describe("ReactionBar rendered repro", () => {
  it("clicking the picker emoji creates a reaction item", async () => {
    const connector = fakeConnector()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        createElement(ConnectorProvider, { connector: connector as never }, createElement(ReactionBar, { itemId: "p1" })),
      )
    })

    const addButton = host.querySelector("button")
    expect(addButton, "add-reaction trigger rendered").toBeTruthy()
    await act(async () => { addButton!.click() })

    const emojiButton = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("👍"))
    expect(emojiButton, "picker emoji button rendered").toBeTruthy()
    await act(async () => { emojiButton!.click() })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })

    expect([...connector.items.values()].some((item) => item.type === "reaction")).toBe(true)
    // A pill for the fresh reaction is visible (optimistic state).
    expect(host.textContent).toContain("👍")

    // Now simulate what every connector does after ANY mutation: re-emit the
    // parent item (new identity, still WITHOUT data.reactions — no connector
    // ever computes the summary). Does the pill survive?
    await act(async () => {
      connector.emitItem({ id: "p1", type: "post", createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", data: { text: "hi" } })
    })
    expect(host.textContent, "pill survives an unrelated item re-emit").toContain("👍")
    await act(async () => { root.unmount() })
  })
})
