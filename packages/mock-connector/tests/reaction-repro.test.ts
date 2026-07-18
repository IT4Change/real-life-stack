import { describe, expect, it } from "vitest"
import { MockConnector } from "../src/mock-connector"

const seed = {
  items: [], groups: [{ id: "g1", name: "G1" }], users: [{ id: "user-1", displayName: "User" }],
  groupMembers: { g1: ["user-1"] }, groupItems: { g1: [] },
}

describe("reaction flow repro", () => {
  it("create reaction → related items → toggle off", async () => {
    const connector = new MockConnector(seed as never)
    await connector.init()
    connector.setCurrentGroup("g1")
    const post = await connector.createItem({ id: "p1", type: "post", createdBy: "user-1", data: { text: "hi" } })

    const reaction = await connector.createItem({
      type: "reaction", createdBy: "user-1", data: { emoji: "👍" },
      relations: [{ predicate: "reactsTo", target: `item:${post.id}` }],
    })
    expect(reaction.id).toBeTruthy()

    const related = await connector.getRelatedItems(post.id, "reactsTo", { direction: "to" })
    expect(related.map((r) => r.id)).toContain(reaction.id)

    await connector.deleteItem(reaction.id)
    const after = await connector.getRelatedItems(post.id, "reactsTo", { direction: "to" })
    expect(after).toHaveLength(0)
  })
})
