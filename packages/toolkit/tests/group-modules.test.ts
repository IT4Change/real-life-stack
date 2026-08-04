import { describe, expect, it } from "vitest"

import { moveModule } from "../src/components/layout/group-dialog"

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
