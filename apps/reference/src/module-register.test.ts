import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getModules, moduleIds } from "@real-life-stack/toolkit"
import "./module-register"
import { VALID_MODULES } from "./hooks/use-workspace-routing"

const SRC = join(__dirname)

describe("Modul-Register — App-Schicht", () => {
  it("attaches a view to every registered module", () => {
    const ohneView = getModules().filter((m) => !m.view).map((m) => m.id)
    // Ein Modul ohne Ansicht degradiert zwar sichtbar (Spec 01, Regel 5),
    // aber in DIESER App soll jedes Modul eine haben.
    expect(ohneView).toEqual([])
  })

  it("derives the routing list from the register", () => {
    expect(VALID_MODULES).toEqual(moduleIds())
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
