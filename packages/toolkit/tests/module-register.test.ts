import { describe, it, expect, beforeEach } from "vitest"
import {
  CORE_MODULES,
  registerModules,
  extendModules,
  getModules,
  getModule,
  moduleIds,
  defaultModuleIds,
  displayableModules,
  resetModuleRegistryForTests,
} from "../src/lib/module-register"

const Dummy = () => null

describe("Modul-Register", () => {
  beforeEach(() => resetModuleRegistryForTests())

  it("ships the core modules", () => {
    expect(moduleIds()).toEqual(CORE_MODULES.map((m) => m.id))
  })

  it("gives every core module a label and an icon", () => {
    for (const m of getModules()) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.icon).toBeTruthy()
    }
  })

  it("marks a subset as enabled by default", () => {
    const d = defaultModuleIds()
    expect(d.length).toBeGreaterThan(0)
    expect(d.length).toBeLessThan(moduleIds().length)
    for (const id of d) expect(moduleIds()).toContain(id)
  })

  it("lets a layer add a new module", () => {
    registerModules("app", [{ id: "garten", label: "Garten", icon: Dummy }])
    expect(moduleIds()).toContain("garten")
    expect(getModule("garten")?.label).toBe("Garten")
  })

  it("rejects a duplicate id — no silent shadowing", () => {
    expect(() => registerModules("app", [{ id: "feed", label: "Anderer Feed", icon: Dummy }])).toThrow(
      /feed/,
    )
  })

  it("lets an app attach its view to a core id", () => {
    extendModules("app", [{ id: "feed", view: Dummy }])
    expect(getModule("feed")?.view).toBe(Dummy)
    // Label und Icon des Core-Eintrags bleiben
    expect(getModule("feed")?.label).toBe(CORE_MODULES.find((m) => m.id === "feed")!.label)
  })

  it("refuses to extend an unknown id", () => {
    expect(() => extendModules("app", [{ id: "gibtsnicht", view: Dummy }])).toThrow(/gibtsnicht/)
  })

  it("refuses to overwrite a label that the base already sets", () => {
    expect(() => extendModules("app", [{ id: "feed", label: "Umbenannt" }])).toThrow(/feed/)
  })

  it("keeps registration order — the tab order follows it", () => {
    registerModules("app", [{ id: "garten", label: "Garten", icon: Dummy }])
    expect(moduleIds().at(-1)).toBe("garten")
  })

  it("re-registering the same layer replaces it (HMR)", () => {
    registerModules("app", [{ id: "garten", label: "Garten", icon: Dummy }])
    registerModules("app", [{ id: "beete", label: "Beete", icon: Dummy }])
    expect(moduleIds()).toContain("beete")
    expect(moduleIds()).not.toContain("garten")
  })
})

describe("displayableModules", () => {
  beforeEach(() => resetModuleRegistryForTests())

  it("keeps only ids the register knows, in the given order", () => {
    expect(displayableModules(["map", "feed"])).toEqual(["map", "feed"])
  })

  it("drops an id from another app version without touching the input", () => {
    const stored = ["feed", "quests", "map"]
    expect(displayableModules(stored)).toEqual(["feed", "map"])
    // Regel 4: die gespeicherte Liste wird nie stillschweigend veraendert.
    expect(stored).toEqual(["feed", "quests", "map"])
  })

  it("returns nothing for a list of only unknown ids", () => {
    // Der Aufrufer muss diesen Fall sehen — sonst zaehlt eine Legacy-Id als
    // "es bleibt ja ein Modul" und der Space endet ohne nutzbaren Tab.
    expect(displayableModules(["quests", "campaign"])).toEqual([])
  })
})

describe("keine zweite Modul-Liste", () => {
  beforeEach(() => resetModuleRegistryForTests())

  it("derives default modules from the register itself", () => {
    for (const id of defaultModuleIds()) {
      expect(getModule(id)?.enabledByDefault).toBe(true)
    }
  })

  it("exposes fill defaults so no surface has to guess", () => {
    for (const m of getModules()) {
      expect(["container", "bleed"]).toContain(m.fill ?? "container")
    }
  })
})
