import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Shared fake IndexedDB store: `update` runs the updater against the CURRENT
 * stored value, so two connector instances see each other's commits — exactly
 * the situation two tabs are in (rls#244).
 *
 * Every read and write is DEEP-CLONED, like IndexedDB's structured clone.
 * Without that, all instances would share one object graph and mutate it in
 * place — the test would pass while proving nothing.
 */
const backing = new Map<string, unknown>()
const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value))
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => clone(backing.get(key))),
  set: vi.fn(async (key: string, value: unknown) => { backing.set(key, clone(value)) }),
  update: vi.fn(async (key: string, updater: (value: unknown) => unknown) => {
    backing.set(key, clone(updater(clone(backing.get(key)))))
  }),
  del: vi.fn(async (key: string) => { backing.delete(key) }),
  createStore: vi.fn().mockReturnValue({}),
}))

vi.stubGlobal("BroadcastChannel", class {
  onmessage = null
  postMessage() {}
  close() {}
})

import { LocalConnector } from "../src/local-connector.js"

const seed = () => ({
  items: [],
  groups: [{ id: "g1", name: "Garten", data: { modules: ["feed"] } }],
  users: [{ id: "u1", displayName: "Anton" }],
  groupMembers: { g1: ["u1"] },
})

async function makeConnector(): Promise<LocalConnector> {
  const connector = new LocalConnector(seed())
  await connector.init()
  return connector
}

describe("LocalConnector — Group-Patch über Instanzen (rls#244)", () => {
  beforeEach(() => {
    backing.clear()
  })

  it("zwei Instanzen verlieren die Felder der jeweils anderen nicht", async () => {
    const a = await makeConnector()
    const b = await makeConnector() // hydriert VOR den Writes — RAM ist gleich alt

    await a.updateGroup("g1", { data: { modules: ["feed", "graph"] } })
    // b kennt a's Write nicht (stale RAM) und patcht nur SEIN Feld.
    await b.updateGroup("g1", { data: { image: "logo.png" } })

    const fresh = await makeConnector()
    const stored = (await fresh.getGroups()).find((group) => group.id === "g1")
    expect(stored?.data?.image).toBe("logo.png")
    expect(stored?.data?.modules).toEqual(["feed", "graph"])
  })

  it("null loescht auch über Instanzen hinweg", async () => {
    const a = await makeConnector()
    await a.updateGroup("g1", { data: { primaryColor: "#e84b1c" } })

    const b = await makeConnector()
    await b.updateGroup("g1", { data: { primaryColor: null } })

    const fresh = await makeConnector()
    const stored = (await fresh.getGroups()).find((group) => group.id === "g1")
    expect(stored?.data ?? {}).not.toHaveProperty("primaryColor")
  })

  it("der Name eines fremden Writers ueberlebt einen data-Patch", async () => {
    const a = await makeConnector()
    const b = await makeConnector()

    await a.updateGroup("g1", { name: "Gemeinschaftsgarten" })
    await b.updateGroup("g1", { data: { image: "logo.png" } })

    const fresh = await makeConnector()
    const stored = (await fresh.getGroups()).find((group) => group.id === "g1")
    expect(stored?.name).toBe("Gemeinschaftsgarten")
    expect(stored?.data?.image).toBe("logo.png")
  })
})
