import { describe, it, expect } from "vitest"
import * as Y from "yjs"

import { countMemberSpaces } from "../src/personal-doc-spaces.js"

/**
 * Nachbau der Trap-Asymmetrie aus dem adapter-yjs PersonalDoc-Proxy: `get`
 * verpackt verschachtelte Y.Maps, `getOwnPropertyDescriptor` gibt den ROHEN
 * Wert. Genau daran scheitert `Object.values()` still.
 */
function yjsLikeProxy(map: Y.Map<unknown>): Record<string, unknown> {
  const wrap = (value: unknown): unknown =>
    value instanceof Y.Map ? yjsLikeProxy(value as Y.Map<unknown>) : value
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, key) => (typeof key === "string" ? wrap(map.get(key)) : undefined),
    has: (_t, key) => typeof key === "string" && map.has(key),
    ownKeys: () => Array.from(map.keys()),
    getOwnPropertyDescriptor: (_t, key) =>
      typeof key === "string" && map.has(key)
        ? { configurable: true, enumerable: true, writable: true, value: map.get(key) }
        : undefined,
  })
}

function personalDocSpaces(entries: { id: string; type: string; appTag?: string }[]) {
  const doc = new Y.Doc()
  const spaces = doc.getMap<unknown>("spaces")
  for (const entry of entries) {
    const space = new Y.Map<unknown>()
    const info = new Y.Map<unknown>()
    info.set("id", entry.id)
    info.set("type", entry.type)
    if (entry.appTag !== undefined) info.set("appTag", entry.appTag)
    space.set("info", info)
    spaces.set(entry.id, space)
  }
  return yjsLikeProxy(spaces)
}

describe("countMemberSpaces", () => {
  it("zählt die Mitgliedschaften über den echten Proxy-Zugriff", () => {
    const spaces = personalDocSpaces([
      { id: "a", type: "shared" },
      { id: "b", type: "shared" },
      { id: "c", type: "shared" },
    ])
    expect(countMemberSpaces(spaces)).toBe(3)
  })

  it("lässt den privaten Space aussen vor — er ist keine Gruppe", () => {
    const spaces = personalDocSpaces([
      { id: "a", type: "shared" },
      { id: "p", type: "shared", appTag: "rls-private" },
    ])
    expect(countMemberSpaces(spaces)).toBe(1)
  })

  it("unterscheidet „unbekannt“ von „keine Gruppen“", () => {
    expect(countMemberSpaces(undefined)).toBeNull()
    expect(countMemberSpaces(null)).toBeNull()
    expect(countMemberSpaces(personalDocSpaces([]))).toBe(0)
  })

  it("funktioniert auch mit einem gewöhnlichen Objekt (Mock-Laufzeiten)", () => {
    expect(countMemberSpaces({ a: { info: { id: "a", type: "shared" } } })).toBe(1)
  })
})
