import { describe, expect, it, beforeEach } from "vitest"
import * as store from "../src/store.js"

/**
 * Writes require a session. Before rls#263 the store mutated the item FIRST
 * and only then read `getCurrentUser()?.id` — after a logout that yielded
 * `undefined`, so an unauthenticated write succeeded and left a half stamp.
 */
describe("graphql store — Schreibzugriffe brauchen eine Sitzung", () => {
  let itemId: string

  beforeEach(() => {
    // Modulglobaler Zustand: der Logout des vorigen Tests wirkt nach.
    store.authenticate("mock", {})
    itemId = store.createItem({ type: "post", createdBy: "u1", data: { t: "a" } } as never).id
  })

  it("lehnt updateItem nach dem Logout ab — ohne das Item zu veraendern", () => {
    const before = JSON.stringify(store.getItems({}).find((i) => i.id === itemId))
    store.logout()

    expect(() => store.updateItem(itemId, { data: { t: "gekapert" } })).toThrow()

    const after = JSON.stringify(store.getItems({}).find((i) => i.id === itemId))
    expect(after).toBe(before)
  })

  it("lehnt deleteItem nach dem Logout ab", () => {
    store.logout()
    expect(() => store.deleteItem(itemId)).toThrow()
    const still = store.getItems({}).find((i) => i.id === itemId)
    expect(still).toBeDefined()
  })
})
