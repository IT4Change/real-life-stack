// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { InitialSyncState, Observable } from "@real-life-stack/data-interface"
import { createObservable } from "@real-life-stack/data-interface"

import { WorkspaceSwitcher, WorkspaceSyncNotice, type Workspace } from "../src/components/layout/workspace-switcher"
import { ConnectorProvider } from "../src/hooks/connector-context"
import { useInitialSync } from "../src/hooks/use-initial-sync"
import { useItems } from "../src/hooks/use-items"

let root: Root | null = null
let container: HTMLDivElement | null = null

function render(node: React.ReactNode) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(node) })
  return container
}

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  root = null
  container = null
})

const OVERVIEW: Workspace = { id: "__overview__", name: "Mein Netzwerk", scope: "overview" }

describe("WorkspaceSwitcher während der Erstsynchronisation", () => {
  it("zeigt schon am geschlossenen Umschalter, dass noch etwas kommt", () => {
    const el = render(
      <WorkspaceSwitcher
        workspaces={[OVERVIEW]}
        activeWorkspace={OVERVIEW}
        onWorkspaceChange={vi.fn()}
        syncing
      />,
    )
    expect(el.querySelector('[aria-label="Gruppen werden geladen"]')).not.toBeNull()
  })

  it("schweigt, wenn kein Erstsync läuft", () => {
    const el = render(
      <WorkspaceSwitcher
        workspaces={[OVERVIEW]}
        activeWorkspace={OVERVIEW}
        onWorkspaceChange={vi.fn()}
      />,
    )
    expect(el.querySelector('[aria-label="Gruppen werden geladen"]')).toBeNull()
  })
})

describe("WorkspaceSyncNotice", () => {
  it("sagt beim leeren Gerät, dass die Gruppen noch kommen", () => {
    const el = render(<WorkspaceSyncNotice loaded={0} expected={null} />)
    expect(el.textContent).toContain("Deine Gruppen werden geladen")
  })

  it("nennt x von y, sobald die Mitgliedschaftsliste mehr kennt als da ist", () => {
    const el = render(<WorkspaceSyncNotice loaded={3} expected={12} />)
    expect(el.textContent).toContain("3 von 12 Gruppen geladen")
  })

  it("sagt nicht „1 von 1“, während die Liste selbst noch wächst", () => {
    // Die Mitgliedschaftsliste trifft stückweise ein: „1 von 1" ist im Moment
    // wahr und trotzdem irreführend, weil gleich die zweite Gruppe kommt.
    const el = render(<WorkspaceSyncNotice loaded={1} expected={1} />)
    expect(el.textContent).not.toContain("1 von 1")
    expect(el.textContent).toContain("es kommen noch welche")
  })

  it("beugt auch bei „x von 1“ nach der Gesamtzahl", () => {
    const el = render(<WorkspaceSyncNotice loaded={0} expected={1} />)
    expect(el.textContent).toContain("0 von 1 Gruppe geladen")
  })

  it("beugt bei einer einzelnen Gruppe im Singular", () => {
    const el = render(<WorkspaceSyncNotice loaded={1} expected={null} />)
    expect(el.textContent).toContain("1 Gruppe geladen")
    expect(el.textContent).not.toContain("1 Gruppen")
  })

  it("erfindet keine Gesamtzahl, solange sie unbekannt ist", () => {
    const el = render(<WorkspaceSyncNotice loaded={3} expected={null} />)
    expect(el.textContent).toContain("3 Gruppen geladen")
    expect(el.textContent).not.toMatch(/von \d/)
  })
})

function connectorWith(observable: Observable<InitialSyncState> | null, items = createObservable<unknown[]>([])) {
  return {
    getItems: async () => items.current,
    getItem: async () => null,
    observe: () => items,
    observeItem: () => createObservable(null),
    ...(observable ? { observeInitialSync: () => observable } : {}),
  } as never
}

function ItemsProbe() {
  const { data, isLoading } = useItems()
  return <span>{isLoading ? "laedt" : data.length === 0 ? "fertig" : "inhalt"}</span>
}

function Probe() {
  const state = useInitialSync()
  return <span data-testid="state">{state.active ? `laedt:${state.loadedGroups}` : "fertig"}</span>
}

describe("useInitialSync", () => {
  it("folgt dem Connector-Zustand", () => {
    const obs = createObservable<InitialSyncState>({ active: true, loadedGroups: 2, expectedGroups: 7 })
    const el = render(
      <ConnectorProvider connector={connectorWith(obs)}>
        <Probe />
      </ConnectorProvider>,
    )
    expect(el.textContent).toBe("laedt:2")

    act(() => { obs.set({ active: false, loadedGroups: 4, expectedGroups: 4 }) })
    expect(el.textContent).toBe("fertig")
  })

  it("hält Item-Listen als ladend, solange die Erstbefüllung läuft", () => {
    const obs = createObservable<InitialSyncState>({ active: true, loadedGroups: 0, expectedGroups: null })
    const el = render(
      <ConnectorProvider connector={connectorWith(obs)}>
        <ItemsProbe />
      </ConnectorProvider>,
    )
    // Die Liste ist leer UND geladen — ohne den Erstsync würde sie hier
    // „nichts vorhanden" behaupten (rls#265).
    expect(el.textContent).toBe("laedt")

    act(() => { obs.set({ active: false, loadedGroups: 0, expectedGroups: 0 }) })
    expect(el.textContent).toBe("fertig")
  })

  it("versteckt bereits eingetroffene Items NICHT hinter dem Skelett", () => {
    const obs = createObservable<InitialSyncState>({ active: true, loadedGroups: 1, expectedGroups: 3 })
    const items = createObservable([{ id: "i1", type: "task", createdAt: "2026-08-14T10:00:00Z" }])
    const el = render(
      <ConnectorProvider connector={connectorWith(obs, items)}>
        <ItemsProbe />
      </ConnectorProvider>,
    )
    expect(el.textContent).toBe("inhalt")
  })

  it("meldet für Backends ohne Erstsync-Begriff dauerhaft „fertig“", () => {
    const el = render(
      <ConnectorProvider connector={connectorWith(null)}>
        <Probe />
      </ConnectorProvider>,
    )
    expect(el.textContent).toBe("fertig")
  })
})
