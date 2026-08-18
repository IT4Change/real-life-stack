// @vitest-environment jsdom
import { createElement, act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RootError } from "./root-error"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Boom(): never {
  throw new Error("contact.id is undefined")
}

/**
 * Das Auffangnetz um die Wurzel muss dort sitzen, wo React Router den Fehler
 * abfängt — sonst ist es wirkungslos.
 *
 * `createBrowserRouter` setzt für jede Route intern eine eigene
 * `RenderErrorBoundary` ein. Eine Grenze AUSSERHALB von `RouterProvider` sieht
 * einen Render-Fehler der Route deshalb nie; der Router zeigt stattdessen seine
 * eigene englische „Unexpected Application Error"-Seite — genau die Seite, die
 * Anlass dieses PRs war.
 */
describe("Wurzel-Fehleranzeige", () => {
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

  it("greift bei einem Render-Fehler der Route", async () => {
    const router = createMemoryRouter([
      { path: "*", element: createElement(Boom), errorElement: createElement(RootError) },
    ])
    await act(async () => root.render(createElement(RouterProvider, { router })))

    expect(container.textContent).toContain("Die App konnte nicht geladen werden")
    expect(container.textContent).toContain("contact.id is undefined")
    // Die Router-Standardseite darf nicht mehr erscheinen.
    expect(container.textContent).not.toContain("Unexpected Application Error")
  })

  it("bietet Neu laden statt Erneut versuchen", async () => {
    // Auf dieser Ebene ist der ganze Baum hin — ein Zurücksetzen wiederholte
    // nur denselben Fehler.
    const router = createMemoryRouter([
      { path: "*", element: createElement(Boom), errorElement: createElement(RootError) },
    ])
    await act(async () => root.render(createElement(RouterProvider, { router })))

    const labels = Array.from(container.querySelectorAll("button")).map((b) => b.textContent)
    expect(labels).toContain("Neu laden")
    expect(labels.some((l) => l?.includes("Erneut versuchen"))).toBe(false)
  })

  it("zeigt auch etwas an, wenn der Fehler kein Error ist", async () => {
    // `useRouteError()` liefert, was geworfen wurde — das muss kein Error sein.
    // Eine Fehleranzeige, die daran selbst scheitert, wäre die schlechteste
    // Stelle für einen zweiten Fehler.
    function ThrowString(): never {
      throw "kein Error-Objekt"
    }
    const router = createMemoryRouter([
      { path: "*", element: createElement(ThrowString), errorElement: createElement(RootError) },
    ])
    await act(async () => root.render(createElement(RouterProvider, { router })))

    expect(container.textContent).toContain("Die App konnte nicht geladen werden")
    expect(container.textContent).toContain("kein Error-Objekt")
  })
})
