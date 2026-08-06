// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"
import type { AuthState, DataInterface, IncomingEvent } from "@real-life-stack/data-interface"
import { ConnectorProvider } from "../src/hooks/connector-context"
import { IncomingEventsProvider, useIncomingEvents } from "../src/hooks/use-incoming-events"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function makeConnector() {
  let auth: AuthState = { status: "authenticated", user: { id: "user-a" } }
  const authListeners = new Set<(s: AuthState) => void>()
  const eventListeners = new Set<(e: IncomingEvent) => void>()
  const connector = {
    init: async () => {}, dispose: async () => {},
    getItems: async () => [], getItem: async () => null,
    observe: () => ({ current: [], subscribe: () => () => {} }),
    observeItem: () => ({ current: null, subscribe: () => () => {} }),
    getAuthState: () => ({
      get current() { return auth },
      subscribe: (cb: (s: AuthState) => void) => { authListeners.add(cb); return () => authListeners.delete(cb) },
    }),
    getAuthMethods: () => [], authenticate: async () => ({ id: "u" }), logout: async () => {},
    getCurrentUser: async () => null,
    observeCurrentUser: () => ({ current: null, subscribe: () => () => {} }),
    getUser: async () => null,
    onIncomingEvent: (cb: (e: IncomingEvent) => void) => { eventListeners.add(cb); return () => eventListeners.delete(cb) },
  } as unknown as DataInterface
  return {
    connector,
    emitEvent: (e: IncomingEvent) => { for (const l of eventListeners) l(e) },
    setAuth: (s: AuthState) => { auth = s; for (const l of authListeners) l(s) },
  }
}

let currentValue: ReturnType<typeof useIncomingEvents> | null = null
function Probe() {
  currentValue = useIncomingEvents()
  return null
}

let root: Root | null = null
let host: HTMLElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null; host = null; currentValue = null
})

describe("IncomingEventsProvider — Dialog-Queue ist session-gebunden (#251 Re-Review)", () => {
  it("ein CONNECTOR-Wechsel leert die Queue des alten Connectors (#253)", () => {
    const a = makeConnector()
    const b = makeConnector()
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    const render = (connector: DataInterface) => (
      <ConnectorProvider connector={connector}>
        <IncomingEventsProvider><Probe /></IncomingEventsProvider>
      </ConnectorProvider>
    )
    act(() => root!.render(render(a.connector)))
    act(() => a.emitEvent({ type: "space-invite", fromId: "user-x", spaceId: "g1", spaceName: "G" }))
    expect(currentValue?.current?.event.type).toBe("space-invite")
    // Ohne Remount (Toolkit-Hosts ohne key={connectorId}): der Wechsel muss
    // die Queue des alten Connectors verwerfen.
    act(() => root!.render(render(b.connector)))
    expect(currentValue?.current).toBeNull()
  })

  it("eingereihte Dialoge überleben Logout und Accountwechsel NICHT", () => {
    const { connector, emitEvent, setAuth } = makeConnector()
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root!.render(
      <ConnectorProvider connector={connector}>
        <IncomingEventsProvider><Probe /></IncomingEventsProvider>
      </ConnectorProvider>,
    ))
    act(() => emitEvent({ type: "contact-request", fromId: "user-x", fromName: "X" }))
    act(() => emitEvent({ type: "space-invite", fromId: "user-y", spaceId: "g1", spaceName: "G" }))
    expect(currentValue?.current?.event.type).toBe("contact-request")

    // Logout: die Queue gehört der alten Session.
    act(() => setAuth({ status: "unauthenticated" }))
    expect(currentValue?.current).toBeNull()

    // Login als B, dann Wechsel: Events von B verschwinden beim Wechsel zu C.
    act(() => setAuth({ status: "authenticated", user: { id: "user-b" } }))
    act(() => emitEvent({ type: "contact-request", fromId: "user-z" }))
    expect(currentValue?.current?.event.type).toBe("contact-request")
    act(() => setAuth({ status: "authenticated", user: { id: "user-c" } }))
    expect(currentValue?.current).toBeNull()
  })
})
