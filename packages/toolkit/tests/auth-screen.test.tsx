// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AuthMethod, User } from "@real-life-stack/data-interface"
import { AuthScreen } from "../src/components/auth/auth-screen"

function makeConnector(methods: AuthMethod[], authenticate = vi.fn(async (): Promise<User> => ({ id: "u1" }))) {
  return {
    connector: {
      getAuthMethods: () => methods,
      authenticate,
      // Restliche Authenticatable-Oberfläche wird vom Screen nicht benutzt.
      getCurrentUser: async () => null,
      observeCurrentUser: () => ({ current: null, subscribe: () => () => {} }),
      getUser: async () => null,
      getAuthState: () => ({ current: { status: "unauthenticated" as const }, subscribe: () => () => {} }),
      logout: async () => {},
    },
    authenticate,
  }
}

const EMAIL_METHODS: AuthMethod[] = [
  { method: "anonymous", label: "Anonym ausprobieren" },
  { method: "email", label: "E-Mail Login" },
  { method: "email-signup", label: "E-Mail Registrierung" },
]

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

const byText = (text: string) =>
  [...document.querySelectorAll("button, [role=tab], a, h1, h2, p, span, div")].find((el) =>
    el.textContent?.trim() === text) as HTMLElement | undefined

const input = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement

function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

const flush = () => act(async () => { await Promise.resolve() })

describe("AuthScreen — capability-getriebener Login/Registrierung", () => {
  it("zeigt Login-Formular, Registrieren-Umschalter und Anonym-Option gemäß getAuthMethods", () => {
    const { connector } = makeConnector(EMAIL_METHODS)
    render(<AuthScreen connector={connector} onAuthenticated={() => {}} />)
    expect(input("email")).toBeTruthy()
    expect(input("password")).toBeTruthy()
    expect(byText("Registrieren")).toBeTruthy()
    expect(byText("Anonym ausprobieren")).toBeTruthy()
  })

  it("versteckt Formular und Anonym-Button, wenn die Methoden fehlen", () => {
    const { connector } = makeConnector([{ method: "anonymous", label: "Anonym ausprobieren" }])
    render(<AuthScreen connector={connector} onAuthenticated={() => {}} />)
    expect(input("email")).toBeFalsy()
    expect(byText("Anonym ausprobieren")).toBeTruthy()
  })

  it("Login submit → authenticate('email') → onAuthenticated", async () => {
    const { connector, authenticate } = makeConnector(EMAIL_METHODS)
    const onAuthenticated = vi.fn()
    render(<AuthScreen connector={connector} onAuthenticated={onAuthenticated} />)
    act(() => { setValue(input("email"), "a@b.de"); setValue(input("password"), "geheim") })
    act(() => { (document.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) })
    await flush()
    expect(authenticate).toHaveBeenCalledWith("email", { email: "a@b.de", password: "geheim" })
    expect(onAuthenticated).toHaveBeenCalledTimes(1)
  })

  it("zeigt den Fehler des Connectors an und feuert onAuthenticated NICHT", async () => {
    const authenticate = vi.fn(async () => { throw new Error("Invalid login credentials") })
    const { connector } = makeConnector(EMAIL_METHODS, authenticate as never)
    const onAuthenticated = vi.fn()
    render(<AuthScreen connector={connector} onAuthenticated={onAuthenticated} />)
    act(() => { setValue(input("email"), "a@b.de"); setValue(input("password"), "falsch") })
    act(() => { (document.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) })
    await flush()
    expect(onAuthenticated).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Invalid login credentials")
  })

  it("Registrieren-Modus submitted authenticate('email-signup') mit Anzeigename", async () => {
    const { connector, authenticate } = makeConnector(EMAIL_METHODS)
    const onAuthenticated = vi.fn()
    render(<AuthScreen connector={connector} onAuthenticated={onAuthenticated} />)
    act(() => { byText("Registrieren")!.click() })
    expect(input("displayName")).toBeTruthy()
    act(() => {
      setValue(input("email"), "neu@b.de")
      setValue(input("password"), "geheim123")
      setValue(input("displayName"), "Anton")
    })
    act(() => { (document.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) })
    await flush()
    expect(authenticate).toHaveBeenCalledWith("email-signup", { email: "neu@b.de", password: "geheim123", displayName: "Anton" })
    expect(onAuthenticated).toHaveBeenCalledTimes(1)
  })

  it("Anonym-Button → authenticate('anonymous')", async () => {
    const { connector, authenticate } = makeConnector(EMAIL_METHODS)
    const onAuthenticated = vi.fn()
    render(<AuthScreen connector={connector} onAuthenticated={onAuthenticated} />)
    act(() => { byText("Anonym ausprobieren")!.click() })
    await flush()
    expect(authenticate).toHaveBeenCalledWith("anonymous", {})
    expect(onAuthenticated).toHaveBeenCalledTimes(1)
  })
})
