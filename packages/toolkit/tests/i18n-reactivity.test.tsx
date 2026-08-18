// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { t, setLanguage, resetI18nForTests } from "../src/i18n"
import { useLanguage } from "../src/i18n/use-i18n"
import { RelativeTime } from "../src/components/primitives/relative-time"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * `t()` liest die Sprache zum Aufrufzeitpunkt — erst `useLanguage()` sorgt
 * dafür, dass der Aufruf nach einem Wechsel erneut passiert. Diese Kopplung
 * ist die eine Stelle, an der i18n in React kaputtgehen kann, ohne dass es
 * ein Test der reinen Laufzeit je sähe.
 */
function Probe() {
  useLanguage()
  return createElement("span", null, t("userMenu.contacts"))
}

describe("i18n-Reaktivität", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    resetI18nForTests()
    setLanguage("de")
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    resetI18nForTests()
  })

  it("eine abonnierte Komponente wechselt die Sprache live", async () => {
    await act(async () => root.render(createElement(Probe)))
    expect(container.textContent).toBe("Kontakte")

    await act(async () => setLanguage("en"))

    expect(container.textContent).toBe("Contacts")
  })

  it("RelativeTime formatiert nach dem Wechsel in der neuen Sprache", async () => {
    const yesterday = new Date(Date.now() - 25 * 3600_000)
    await act(async () => root.render(createElement(RelativeTime, { date: yesterday })))
    expect(container.textContent).toBe("gestern")

    await act(async () => setLanguage("en"))

    expect(container.textContent).toBe("yesterday")
  })
})
