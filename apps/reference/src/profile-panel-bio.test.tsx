// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no matchMedia; AdaptivePanel queries it for its mode decision.
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  onchange: null,
  dispatchEvent: () => false,
}))
import type { DataInterface, Item, User } from "@real-life-stack/data-interface"
import { ProfilePanelHost } from "./App"

const ME: User = { id: "user-me", displayName: "Anton" }

function personItem(bio: string): Item {
  return {
    id: ME.id,
    type: "person",
    createdAt: "2026-08-05T10:00:00.000Z",
    createdBy: ME.id,
    data: { displayName: "Anton", bio },
  }
}

/** ProfileCapable-Fake: die Bio lebt im Profil-Item, nicht im User-Objekt. */
function makeConnector(bio: string) {
  const item = personItem(bio)
  return {
    getMyProfile: async () => item,
    observeMyProfile: () => ({ current: item, subscribe: () => () => {} }),
    updateMyProfile: async () => item,
    setFieldVisibility: async () => {},
    getPublicProfile: async () => null,
    syncProfile: async () => {},
    isProfileSyncPending: () => ({ current: false, subscribe: () => () => {} }),
    getAuthState: () => ({ current: { status: "authenticated" as const, user: ME }, subscribe: () => () => {} }),
    getAuthMethods: () => [],
    authenticate: async () => ME,
    logout: async () => {},
    getCurrentUser: async () => ME,
    observeCurrentUser: () => ({ current: ME, subscribe: () => () => {} }),
    getUser: async () => null,
    init: async () => {},
    dispose: async () => {},
    getItems: async () => [],
    getItem: async () => null,
    observe: () => ({ current: [], subscribe: () => () => {} }),
    observeItem: () => ({ current: null, subscribe: () => () => {} }),
  } as unknown as DataInterface
}

let root: Root | null = null
let host: HTMLElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe("ProfilePanelHost — eigene Bio kommt aus dem Profil-Item", () => {
  it("zeigt die gespeicherte Bio beim Öffnen des eigenen Profils (kein hartes '')", async () => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <ProfilePanelHost
          userId={ME.id}
          currentUser={ME}
          connector={makeConnector("Baut Netze in Kassel")}
          onSaveProfile={async () => {}}
          onClose={() => {}}
        />,
      )
    })
    await act(async () => { await Promise.resolve() })
    const bioField = [...document.querySelectorAll("input, textarea")]
      .find((el) => (el as HTMLInputElement).value?.includes("Baut Netze in Kassel"))
    const bioText = document.body.textContent?.includes("Baut Netze in Kassel")
    expect(bioField || bioText, "gespeicherte Bio sichtbar").toBeTruthy()
  })
})
