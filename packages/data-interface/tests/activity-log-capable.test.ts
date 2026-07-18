import { describe, expect, it } from "vitest"
import { hasActivityLog, hasScopedActivityLog, type DataInterface } from "../src/index.js"

describe("activity log capability segregation", () => {
  it("keeps scoped activity additive to the unscoped capability", () => {
    const unscoped = {
      getActivity: async () => [],
      observeActivity: () => ({ current: [], subscribe: () => () => {} }),
    } as unknown as DataInterface
    const scoped = {
      ...unscoped,
      getScopedActivity: async () => [],
      observeScopedActivity: () => ({ current: [], subscribe: () => () => {} }),
    } as unknown as DataInterface
    expect(hasActivityLog(unscoped)).toBe(true)
    expect(hasScopedActivityLog(unscoped)).toBe(false)
    expect(hasScopedActivityLog(scoped)).toBe(true)
  })
})
