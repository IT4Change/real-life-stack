import { describe, it, expect, vi } from "vitest"
import { createObservable } from "@real-life-stack/data-interface"
import { WotConnector } from "../src/wot-connector"

/**
 * rls#234 / wot#341: `updateGroup` muss den GANZEN data-Patch replizieren.
 * Framework-Felder (image/modules) gehen auf die festen SpaceDocMeta-Keys,
 * alle uebrigen App-Felder (z.B. primaryColor) in den appData-Merge-Patch.
 * Der urspruengliche Blocker: App-Felder landeten NUR im RAM-Cache —
 * updateSpace bekam keinen Aufruf, nach Reload/Zweitgeraet waren sie weg.
 */

function fakeConnector(updateSpace = vi.fn(async () => {})) {
  const group = {
    id: "space-1",
    name: "Garten",
    members: ["did:key:me"],
    data: { scope: "group", modules: ["feed"], primaryColor: "#old" },
  }
  const value = Object.create(WotConnector.prototype) as any
  value.replication = { updateSpace }
  value.groupsCache = [group]
  value.groupsObservable = createObservable([group])
  return { connector: value as WotConnector, updateSpace, group }
}

describe("updateGroup — data-Patch → Replikation", () => {
  it("reicht App-Felder als appData an updateSpace durch — nicht nur in den RAM-Cache", async () => {
    const { connector, updateSpace } = fakeConnector()

    await connector.updateGroup("space-1", {
      data: { image: "logo.png", modules: ["feed", "graph"], primaryColor: "#e84b1c" },
    })

    expect(updateSpace).toHaveBeenCalledTimes(1)
    expect(updateSpace).toHaveBeenCalledWith("space-1", {
      image: "logo.png",
      modules: ["feed", "graph"],
      appData: { primaryColor: "#e84b1c" },
    })
  })

  it("reicht null-Loeschungen in den appData-Patch durch", async () => {
    const { connector, updateSpace } = fakeConnector()

    await connector.updateGroup("space-1", { data: { primaryColor: null } })

    expect(updateSpace).toHaveBeenCalledWith("space-1", { appData: { primaryColor: null } })
    const cached = (await connector.getGroups()).find((candidate) => candidate.id === "space-1")
    expect(cached?.data ?? {}).not.toHaveProperty("primaryColor")
  })

  it("laesst das abgeleitete scope-Feld NICHT in den appData-Patch", async () => {
    const { connector, updateSpace } = fakeConnector()

    await connector.updateGroup("space-1", { data: { scope: "group", theme: "forest" } })

    expect(updateSpace).toHaveBeenCalledWith("space-1", { appData: { theme: "forest" } })
  })

  it("bei fehlgeschlagenem updateSpace bleibt der Cache unveraendert", async () => {
    const failing = vi.fn(async () => { throw new Error("offline") })
    const { connector } = fakeConnector(failing)

    await expect(
      connector.updateGroup("space-1", { data: { primaryColor: "#e84b1c" } }),
    ).rejects.toThrow("offline")

    const cached = (await connector.getGroups()).find((candidate) => candidate.id === "space-1")
    expect(cached?.data?.primaryColor).toBe("#old")
  })

  it("spaceToGroup projiziert appData zurueck in Group.data", () => {
    const { connector } = fakeConnector()
    const group = (connector as any).spaceToGroup({
      id: "space-2",
      type: "shared",
      name: "B",
      members: [],
      createdAt: "2026-08-05T00:00:00.000Z",
      modules: ["feed"],
      appData: { primaryColor: "#e84b1c", theme: "forest" },
    })
    expect(group.data).toMatchObject({
      scope: "group",
      modules: ["feed"],
      primaryColor: "#e84b1c",
      theme: "forest",
    })
  })
})

describe("updateGroup — Cache-Patch (rls#245)", () => {
  it("laesst scope nicht in den Cache — es wird in spaceToGroup ABGELEITET", async () => {
    const { connector } = fakeConnector()

    await connector.updateGroup("space-1", { data: { scope: "aggregate", theme: "forest" } })

    const cached = (await connector.getGroups()).find((candidate) => candidate.id === "space-1")
    // Der persistierte Zustand kennt kein scope; ein cache-only "aggregate"
    // wuerde beim naechsten spaceToGroup wieder auf "group" zurueckspringen.
    expect(cached?.data?.scope).toBe("group")
    expect(cached?.data?.theme).toBe("forest")
  })

  it("schreibt undefined-Werte nicht in den Cache", async () => {
    const { connector } = fakeConnector()

    await connector.updateGroup("space-1", { data: { primaryColor: undefined, theme: "forest" } })

    const cached = (await connector.getGroups()).find((candidate) => candidate.id === "space-1")
    // undefined heisst "nicht mitgeschickt" — der Bestand bleibt, nur null loescht.
    expect(cached?.data?.primaryColor).toBe("#old")
    expect(cached?.data?.theme).toBe("forest")
  })
})

describe("updateGroup — modules:null (rls#250)", () => {
  it("projiziert geloeschte modules im Cache auf die Defaults", async () => {
    const { connector, updateSpace } = fakeConnector()

    const returned = await connector.updateGroup("space-1", { data: { modules: null } })

    // Replikation bekommt das Loeschen unveraendert...
    expect(updateSpace).toHaveBeenCalledWith("space-1", { modules: null })
    // ...aber Rueckgabe und Cache muessen zeigen, was spaceToGroup nach dem
    // Loeschen dauerhaft projiziert: space.modules ?? DEFAULT_MODULES.
    const projected = (connector as unknown as {
      spaceToGroup: (space: unknown) => { data?: Record<string, unknown> }
    }).spaceToGroup({
      id: "space-1", type: "shared", name: "Garten", members: [], createdAt: "2026-08-05T00:00:00.000Z",
    }).data?.modules
    expect(returned.data?.modules).toEqual(projected)
    const cached = (await connector.getGroups()).find((candidate) => candidate.id === "space-1")
    expect(cached?.data?.modules).toEqual(projected)
  })
})
