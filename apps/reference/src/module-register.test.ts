import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getModules, moduleIds, resolveSpaceModules, resolveActiveModule } from "@real-life-stack/toolkit"
import "./module-register"
import { validModules, resolveDefaultModule } from "./hooks/use-workspace-routing"

const SRC = join(__dirname)

describe("Modul-Register — App-Schicht", () => {
  it("attaches a view to every registered module", () => {
    const ohneView = getModules().filter((m) => !m.view).map((m) => m.id)
    // Ein Modul ohne Ansicht degradiert zwar sichtbar (Spec 01, Regel 5),
    // aber in DIESER App soll jedes Modul eine haben.
    expect(ohneView).toEqual([])
  })

  it("derives the routing list from the register", () => {
    expect(validModules()).toEqual(moduleIds())
  })

  it("gives every module a label and an icon", () => {
    for (const m of getModules()) {
      expect(m.label).toBeTruthy()
      expect(m.icon).toBeTruthy()
    }
  })
})

describe("keine zweite Modul-Liste (Spec 01, Regel 1)", () => {
  // Der eigentliche Zweck des Registers: Diese Frage wurde frueher an sechs
  // Stellen unabhaengig beantwortet, und die Listen sind lautlos
  // auseinandergelaufen. Der Test faellt, sobald jemand wieder eine
  // Aufzaehlung von Modul-Ids einfuehrt, statt sie abzuleiten.
  const DATEIEN = [
    "hooks/use-workspace-routing.ts",
    "notification-navigation.ts",
    "views/module-outlet.tsx",
  ]

  it.each(DATEIEN)("%s enumerates no module ids of its own", (datei) => {
    const quelle = readFileSync(join(SRC, datei), "utf8")
    // Eine Zeile, die drei oder mehr bekannte Modul-Ids als Literale
    // nebeneinander nennt, ist eine Liste — egal wie sie heisst.
    const ids = moduleIds()
    const treffer = quelle
      .split("\n")
      .filter((zeile) => !zeile.trimStart().startsWith("//"))
      .filter((zeile) => ids.filter((id) => zeile.includes(`"${id}"`)).length >= 3)
    expect(treffer).toEqual([])
  })
})

describe("Routing filtert unbekannte Modul-Ids (Review #277)", () => {
  it("keeps only what this app can display", () => {
    expect(resolveSpaceModules(["feed", "quests", "map"])).toEqual(["feed", "map"])
  })

  it("never routes to an id the register does not know", () => {
    // Vorher bestimmte eine Legacy-Id das aktive Modul — der Tab fuehrte
    // dann auf eine Flaeche, die es nicht gibt.
    const resolved = resolveSpaceModules(["quests"])
    for (const id of resolved) expect(moduleIds()).toContain(id)
  })

  it("falls back to the full set instead of leaving a space without tabs", () => {
    expect(resolveSpaceModules(["quests", "campaign"])).toEqual(moduleIds())
  })

  it("uses the full set when a space stores nothing", () => {
    expect(resolveSpaceModules(undefined)).toEqual(moduleIds())
  })
})

describe("kein Register-Snapshot auf Modulebene (Review #277)", () => {
  // Ein `const X = moduleIds()` neben dem Import friert das Register zum
  // Importzeitpunkt ein — eine spaeter gebundene App-Schicht ist darin
  // unsichtbar, und der Fehler zeigt sich nur bei bestimmter Importreihenfolge.
  const DATEIEN = [
    "hooks/use-workspace-routing.ts",
    "detail-host.tsx",
    "notification-navigation.ts",
    "views/module-outlet.tsx",
  ]

  it.each(DATEIEN)("%s holds no module list at import time", (datei) => {
    const quelle = readFileSync(join(SRC, datei), "utf8")
    const snapshots = quelle
      .split("\n")
      .filter((z) => /^(export )?const \w+ = (moduleIds|defaultModuleIds)\(\)/.test(z.trim()))
    expect(snapshots).toEqual([])
  })
})

describe("Auswahlregeln zentral (Re-Review #277)", () => {
  it("routes a positioned item to the map even if the space stores only unknown ids", () => {
    // Der reproduzierbare Fall: displayableModules lieferte leer, die
    // feldbasierte Wahl fiel dadurch auf "feed" statt auf "map".
    const available = resolveSpaceModules(["quests"])
    expect(resolveDefaultModule({ hasPosition: true, hasStart: false, hasStatus: false }, available))
      .toBe("map")
  })

  it("keeps a candidate the space actually offers", () => {
    expect(resolveActiveModule("map", ["feed", "map"])).toBe("map")
  })

  it("drops a candidate the space does not offer", () => {
    expect(resolveActiveModule("map", ["feed"])).toBe("feed")
  })

  it("drops a candidate the register does not know", () => {
    expect(resolveActiveModule("quests", ["feed", "map"])).toBe("feed")
  })

  it("never returns an unknown module, whatever it is given", () => {
    for (const candidate of ["quests", "", undefined]) {
      expect(moduleIds()).toContain(resolveActiveModule(candidate, ["quests"]))
    }
  })
})
