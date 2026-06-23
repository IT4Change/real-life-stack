import { describe, it, expect } from "vitest"
import { visibleDetailActions } from "../src/components/detail/detail-actions"

const perms = (canEdit: boolean, canDelete: boolean) => ({ canEdit, canDelete })

describe("visibleDetailActions", () => {
  it("shows edit only when editable AND an onEdit is wired", () => {
    expect(visibleDetailActions(perms(true, false), true, false).edit).toBe(true)
    expect(visibleDetailActions(perms(true, false), false, false).edit).toBe(false) // no handler
    expect(visibleDetailActions(perms(false, false), true, false).edit).toBe(false) // not editable
  })

  it("shows delete when deletable (the actions component owns deletion)", () => {
    expect(visibleDetailActions(perms(false, true), false, false).delete).toBe(true)
    expect(visibleDetailActions(perms(false, false), false, false).delete).toBe(false)
  })

  it("shows share only when an onShare is wired", () => {
    expect(visibleDetailActions(perms(false, false), false, true).share).toBe(true)
    expect(visibleDetailActions(perms(true, true), false, false).share).toBe(false)
  })
})
