// @vitest-environment jsdom
import { createElement, useState, act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ErrorBoundary } from "../src/components/primitives/error-boundary"
import { Dialog, DialogContent } from "../src/components/primitives/dialog"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Eine Grenze, die den Ausfall eines Bereichs vom Rest der Anwendung trennt
 * (rls: die Kontaktliste hat die ganze App weissgemacht).
 *
 * React protokolliert einen abgefangenen Fehler selbst auf die Konsole; das
 * wird hier stummgeschaltet, damit eine grüne Ausgabe grün aussieht.
 */
function Boom({ message = "kaputt" }: { message?: string }) {
  throw new Error(message)
}

function Fine({ text }: { text: string }) {
  return createElement("span", null, text)
}

describe("ErrorBoundary", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  async function render(element: React.ReactElement) {
    await act(async () => root.render(element))
  }

  it("zeigt eine Meldung statt eines leeren Baums", async () => {
    await render(createElement(ErrorBoundary, { label: "Die Kontaktliste" }, createElement(Boom)))

    expect(container.textContent).toContain("Die Kontaktliste konnte nicht angezeigt werden")
    expect(container.querySelector("[role=alert]")).not.toBeNull()
  })

  it("nennt die technische Meldung, damit ein Bericht brauchbar ist", async () => {
    await render(
      createElement(ErrorBoundary, null, createElement(Boom, { message: "contact.id is undefined" })),
    )

    expect(container.textContent).toContain("contact.id is undefined")
  })

  it("lässt alles ausserhalb der Grenze stehen", async () => {
    // Das ist der eigentliche Zweck: der Ausfall bleibt lokal.
    await render(
      createElement(
        "div",
        null,
        createElement(Fine, { text: "Feed lebt" }),
        createElement(ErrorBoundary, { label: "Die Kontaktliste" }, createElement(Boom)),
      ),
    )

    expect(container.textContent).toContain("Feed lebt")
    expect(container.textContent).toContain("Die Kontaktliste konnte nicht angezeigt werden")
  })

  it("meldet den Fehler nach aussen", async () => {
    const onError = vi.fn()
    await render(createElement(ErrorBoundary, { onError }, createElement(Boom, { message: "gemeldet" })))

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0].message).toBe("gemeldet")
  })

  it("überlebt eine Protokollierung, die selbst wirft", async () => {
    // Die Grenze ist die letzte Instanz — wirft sie hier, fängt sie niemand.
    const onError = vi.fn(() => {
      throw new Error("Protokollierung kaputt")
    })
    await render(createElement(ErrorBoundary, { onError }, createElement(Boom)))

    expect(container.textContent).toContain("konnte nicht angezeigt werden")
  })

  it("rendert nach „Erneut versuchen“ wieder, wenn die Ursache weg ist", async () => {
    function Flaky() {
      const [fail, setFail] = useState(true)
      return createElement(
        "div",
        null,
        createElement("button", { type: "button", onClick: () => setFail(false) }, "heilen"),
        createElement(ErrorBoundary, null, fail ? createElement(Boom) : createElement(Fine, { text: "wieder da" })),
      )
    }
    await render(createElement(Flaky))
    expect(container.textContent).toContain("konnte nicht angezeigt werden")

    // Erst die Ursache beseitigen, dann die Grenze zurücksetzen.
    const heal = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "heilen")!
    await act(async () => heal.click())
    const retry = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Erneut versuchen"),
    )!
    await act(async () => retry.click())

    expect(container.textContent).toContain("wieder da")
  })

  it("dreht sich nicht im Kreis, wenn die Ursache bleibt", async () => {
    // Ohne die Wechsel-Bedingung in componentDidUpdate würde die Grenze nach
    // jedem Render sofort zurücksetzen, erneut werfen und die Meldung nie
    // stehen bleiben.
    await render(createElement(ErrorBoundary, { resetKeys: ["space-1"] }, createElement(Boom)))
    await render(createElement(ErrorBoundary, { resetKeys: ["space-1"] }, createElement(Boom)))

    expect(container.textContent).toContain("konnte nicht angezeigt werden")
  })

  it("verwirft den Fehler, wenn sich der Bezug ändert", async () => {
    // Ein Fehler am vorigen Space ist keine Aussage über den nächsten.
    await render(createElement(ErrorBoundary, { resetKeys: ["space-1"] }, createElement(Boom)))
    expect(container.textContent).toContain("konnte nicht angezeigt werden")

    await render(
      createElement(ErrorBoundary, { resetKeys: ["space-2"] }, createElement(Fine, { text: "neuer Space" })),
    )

    expect(container.textContent).toContain("neuer Space")
  })

  it("hält den Ausfall im Dialog und lässt ihn schliessbar", async () => {
    // Die Grenze steckt in der Dialog-Familie selbst, nicht in jeder
    // aufrufenden Stelle — sonst hätte sie jeder Dialog einzeln nötig, und
    // genau der eine ohne sie reisst die App ab.
    await render(
      createElement(
        Dialog,
        { open: true },
        createElement(DialogContent, { errorLabel: "Die Kontaktliste" }, createElement(Boom)),
      ),
    )

    const body = document.body.textContent ?? ""
    // Das Label muss auch die eigene Darstellung erreichen — sonst verspricht
    // `errorLabel` eine spezifische Meldung, die nur der Standard einlöst.
    expect(body).toContain("Die Kontaktliste konnte nicht angezeigt werden")
    // Radix braucht einen Titel für den zugänglichen Namen — der lag im
    // weggebrochenen Inhalt und muss aus der Fehleranzeige kommen.
    expect(document.querySelector("[data-slot=dialog-title]")).not.toBeNull()
    expect(document.querySelector("[data-slot=dialog-close]")).not.toBeNull()
  })

  it("ohne Label bleibt der Dialog bei der allgemeinen Meldung", async () => {
    await render(
      createElement(Dialog, { open: true }, createElement(DialogContent, null, createElement(Boom))),
    )

    expect(document.body.textContent).toContain("Dieser Dialog konnte nicht angezeigt werden")
  })

  it("lässt eine eigene Darstellung zu und reicht ihr das Label", async () => {
    await render(
      createElement(ErrorBoundary, {
        label: "Die Kontaktliste",
        fallback: ({ error, label }) => createElement("p", null, `${label}: ${error.message}`),
      }, createElement(Boom, { message: "x" })),
    )

    expect(container.textContent).toBe("Die Kontaktliste: x")
  })
})
