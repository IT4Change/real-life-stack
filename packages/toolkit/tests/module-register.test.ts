import { describe, it, expect, beforeEach } from "vitest"
import {
  CORE_MODULES,
  CORE_MODULE_LAYER,
  composeModules,
  setModuleRegistry,
  getModules,
  getModule,
  moduleIds,
  defaultModuleIds,
  displayableModules,
  isKnownModule,
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
    setModuleRegistry(
      composeModules([CORE_MODULE_LAYER, { name: "app", definitions: [{ id: "garten", label: "Garten", icon: Dummy }] }]),
    )
    expect(moduleIds()).toContain("garten")
    expect(getModule("garten")?.label).toBe("Garten")
  })

  it("keeps composition order — the tab order follows it", () => {
    setModuleRegistry(
      composeModules([CORE_MODULE_LAYER, { name: "app", definitions: [{ id: "garten", label: "Garten", icon: Dummy }] }]),
    )
    expect(moduleIds().at(-1)).toBe("garten")
  })

  it("lets an app attach its view to a core id", () => {
    setModuleRegistry(
      composeModules([CORE_MODULE_LAYER, { name: "app", extensions: [{ id: "feed", view: Dummy }] }]),
    )
    expect(getModule("feed")?.view).toBe(Dummy)
    expect(getModule("feed")?.label).toBe(CORE_MODULES.find((m) => m.id === "feed")!.label)
  })
})

describe("Konflikte werden abgelehnt, nicht aufgeloest (Review #277)", () => {
  beforeEach(() => resetModuleRegistryForTests())

  it("rejects a duplicate id across layers", () => {
    expect(() =>
      composeModules([CORE_MODULE_LAYER, { name: "app", definitions: [{ id: "feed", label: "Anderer Feed", icon: Dummy }] }]),
    ).toThrow(/feed/)
  })

  it("rejects a duplicate id WITHIN one layer", () => {
    expect(() =>
      composeModules([
        { name: "app", definitions: [
          { id: "garten", label: "Garten", icon: Dummy },
          { id: "garten", label: "Garten nochmal", icon: Dummy },
        ] },
      ]),
    ).toThrow(/garten/)
  })

  it("rejects two layers setting the same field on one module", () => {
    expect(() =>
      composeModules([
        CORE_MODULE_LAYER,
        { name: "app", extensions: [{ id: "feed", view: Dummy }] },
        { name: "space", extensions: [{ id: "feed", view: Dummy }] },
      ]),
    ).toThrow(/feed/)
  })

  it("rejects two fragments in the SAME layer setting the same field", () => {
    expect(() =>
      composeModules([
        CORE_MODULE_LAYER,
        { name: "app", extensions: [{ id: "feed", view: Dummy }, { id: "feed", view: Dummy }] },
      ]),
    ).toThrow(/feed/)
  })

  it("rejects a fragment that would overwrite a field the base sets", () => {
    expect(() =>
      composeModules([CORE_MODULE_LAYER, { name: "app", extensions: [{ id: "feed", label: "Umbenannt" }] }]),
    ).toThrow(/feed/)
  })

  it("refuses to extend an unknown id", () => {
    expect(() =>
      composeModules([CORE_MODULE_LAYER, { name: "app", extensions: [{ id: "gibtsnicht", view: Dummy }] }]),
    ).toThrow(/gibtsnicht/)
  })

  it("names both the field and the layers in the message", () => {
    try {
      composeModules([
        CORE_MODULE_LAYER,
        { name: "app", extensions: [{ id: "feed", view: Dummy }] },
        { name: "space:garten", extensions: [{ id: "feed", view: Dummy }] },
      ])
      throw new Error("kein Konflikt gemeldet")
    } catch (e) {
      expect(String(e)).toContain("view")
      expect(String(e)).toContain("app")
      expect(String(e)).toContain("space:garten")
    }
  })
})

describe("Das Register ist unveraenderlich (Review #277)", () => {
  beforeEach(() => resetModuleRegistryForTests())

  it("freezes the registry and its entries", () => {
    const reg = composeModules([CORE_MODULE_LAYER])
    expect(Object.isFrozen(reg)).toBe(true)
    expect(Object.isFrozen(reg[0])).toBe(true)
  })

  it("does not leak the composed entries into a later composition", () => {
    const a = composeModules([CORE_MODULE_LAYER, { name: "app", extensions: [{ id: "feed", view: Dummy }] }])
    const b = composeModules([CORE_MODULE_LAYER])
    expect(a.find((m) => m.id === "feed")?.view).toBe(Dummy)
    // Die zweite Komposition darf von der ersten nichts wissen.
    expect(b.find((m) => m.id === "feed")?.view).toBeUndefined()
  })

  it("sees a registry bound AFTER the first read — no import-time snapshot", () => {
    expect(isKnownModule("garten")).toBe(false)
    setModuleRegistry(
      composeModules([CORE_MODULE_LAYER, { name: "app", definitions: [{ id: "garten", label: "Garten", icon: Dummy }] }]),
    )
    // Wer moduleIds() beim Import festhaelt, sieht das hier nicht.
    expect(isKnownModule("garten")).toBe(true)
    expect(moduleIds()).toContain("garten")
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
