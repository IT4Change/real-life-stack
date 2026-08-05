// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"
import type { AuthState, DataInterface, User } from "@real-life-stack/data-interface"
import { AuthGate } from "./App"

/** Minimal Authenticatable+DataInterface fake with an emittable auth state. */
function makeConnector(initial: AuthState) {
  let current = initial
  const listeners = new Set<(value: AuthState) => void>()
  const observable = {
    get current() { return current },
    subscribe(callback: (value: AuthState) => void) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
  }
  const connector = {
    init: async () => {},
    dispose: async () => {},
    getItems: async () => [],
    getItem: async () => null,
    observe: () => ({ current: [], subscribe: () => () => {} }),
    observeItem: () => ({ current: null, subscribe: () => () => {} }),
    getAuthState: () => observable,
    getAuthMethods: () => [
      { method: "anonymous", label: "Anonym ausprobieren" },
      { method: "email", label: "E-Mail Login" },
      { method: "email-signup", label: "E-Mail Registrierung" },
    ],
    authenticate: async (): Promise<User> => ({ id: "u1" }),
    logout: async () => {},
    getCurrentUser: async () => null,
    observeCurrentUser: () => ({ current: null, subscribe: () => () => {} }),
    getUser: async () => null,
  } as unknown as DataInterface
  const emit = (value: AuthState) => {
    current = value
    for (const listener of listeners) listener(value)
  }
  return { connector, emit }
}

let root: Root | null = null
let host: HTMLElement | null = null

function render(ui: React.ReactElement) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(ui))
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

const APP = <div data-testid="app-content">APP-INHALT</div>
const appVisible = () => document.body.textContent?.includes("APP-INHALT") ?? false
const screenVisible = () => !!document.querySelector('input[name="email"]')

describe("AuthGate — generischer Zweig folgt dem Auth-Observable (#240 review)", () => {
  it("schließt die App, wenn die Session später verloren geht", () => {
    const { connector, emit } = makeConnector({ status: "authenticated", user: { id: "u1" } })
    render(<AuthGate connector={connector} wot={false}>{APP}</AuthGate>)
    expect(appVisible()).toBe(true)
    act(() => emit({ status: "unauthenticated" }))
    expect(appVisible()).toBe(false)
    expect(screenVisible()).toBe(true)
  })

  it("öffnet bei externem Login (z.B. anderer Tab) ohne Screen-Interaktion", () => {
    const { connector, emit } = makeConnector({ status: "unauthenticated" })
    render(<AuthGate connector={connector} wot={false}>{APP}</AuthGate>)
    expect(screenVisible()).toBe(true)
    act(() => emit({ status: "authenticated", user: { id: "u1" } }))
    expect(appVisible()).toBe(true)
    expect(screenVisible()).toBe(false)
  })

  it("WoT-Zweig bleibt bewusst gelatcht — Onboarding kontrolliert den Übergang", () => {
    const { connector, emit } = makeConnector({ status: "authenticated", user: { id: "u1" } })
    render(<AuthGate connector={connector} wot={true}>{APP}</AuthGate>)
    expect(appVisible()).toBe(true)
    // Der DIDAuthScreen steuert onAuthenticated selbst (Seed-Backup etc.) —
    // ein Zustandswechsel darf den Wizard nicht triggern.
    act(() => emit({ status: "unauthenticated" }))
    expect(appVisible()).toBe(true)
  })
})
