// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { IncomingContactRequestDialog } from "../src/components/contacts/incoming-contact-request-dialog"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
}))

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null })

const button = (label: string) =>
  [...document.querySelectorAll("button")].find((el) => el.textContent?.trim() === label)
const flush = () => act(async () => { await Promise.resolve() })

function mount(ui: React.ReactElement) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(ui))
}

describe("IncomingContactRequestDialog — Fehler- und Schließ-Verhalten", () => {
  it("der Fehler wird beim Wechsel zur NÄCHSTEN Anfrage zurückgesetzt", async () => {
    const failing = vi.fn(async () => { throw new Error("Netzwerk weg") })
    mount(<IncomingContactRequestDialog open fromId="a" fromName="Anna" onConfirm={failing} onDismiss={() => {}} />)
    act(() => { button("Bestätigen")!.click() })
    await flush()
    expect(document.body.textContent).toContain("Netzwerk weg")
    // Nächste Anfrage im selben (nicht neu gemounteten) Dialog:
    act(() => root!.render(
      <IncomingContactRequestDialog open fromId="b" fromName="Bert" onConfirm={async () => {}} onDismiss={() => {}} />,
    ))
    await flush()
    expect(document.body.textContent).not.toContain("Netzwerk weg")
    expect(document.body.textContent).toContain("Bert")
  })

  it("während des Bestätigens schließt Escape/Outside-Click den Dialog NICHT", async () => {
    let release: () => void = () => {}
    const pending = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const onDismiss = vi.fn()
    mount(<IncomingContactRequestDialog open fromId="a" fromName="Anna" onConfirm={pending} onDismiss={onDismiss} />)
    act(() => { button("Bestätigen")!.click() })
    await flush()
    // Escape während des laufenden Bestätigens.
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })) })
    await flush()
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => release())
    await flush()
  })
})
