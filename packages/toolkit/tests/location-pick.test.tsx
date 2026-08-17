// @vitest-environment jsdom
import { act, createElement, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import { LocationPickProvider, useLocationPick } from "../src/components/map/location-pick"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Ruft `startPick` einmal beim Mounten auf und meldet das Ergebnis nach
 * aussen — der Pick ist ein Ablauf, kein reiner Wert, also wird er wirklich
 * gestartet statt nachgebildet.
 */
function Probe({ onResult }: { onResult: (r: { started: boolean; canPick: boolean }) => void }) {
  const { startPick, canPick } = useLocationPick()
  useEffect(() => {
    const started = startPick({ onPick: () => {}, onCancel: () => {} })
    onResult({ started, canPick })
  }, [startPick, canPick, onResult])
  return null
}

function run(canOpenMap: boolean, currentModule = "feed") {
  const navigated: string[] = []
  let result: { started: boolean; canPick: boolean } | null = null
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(
        LocationPickProvider,
        {
          navigateToModule: (id: string) => void navigated.push(id),
          currentModule,
          canOpenMap,
        },
        createElement(Probe, { onResult: (r) => { result = r } }),
      ),
    )
  })
  act(() => root.unmount())
  container.remove()
  return { navigated, result: result as unknown as { started: boolean; canPick: boolean } }
}

describe("Location-Pick ohne Karte (Re-Review #277)", () => {
  it("does not start a pick when the space has no map", () => {
    // Der Pick wartet darauf, dass currentModule zu "map" wird. Fuehrt der
    // Space die Karte nicht, tritt das NIE ein — der Composer bliebe im
    // Pick-Zustand, ohne Weg heraus.
    const { result, navigated } = run(false)
    expect(result.started).toBe(false)
    expect(navigated).toEqual([])
  })

  it("reports canPick=false so surfaces can hide the button", () => {
    expect(run(false).result.canPick).toBe(false)
  })

  it("starts and navigates to the map when the space has one", () => {
    const { result, navigated } = run(true)
    expect(result.started).toBe(true)
    expect(navigated).toEqual(["map"])
  })

  it("starts without navigating when the map is already open", () => {
    const { result, navigated } = run(true, "map")
    expect(result.started).toBe(true)
    expect(navigated).toEqual([])
  })

  it("reports canPick=true when the map is reachable", () => {
    expect(run(true).result.canPick).toBe(true)
  })
})
