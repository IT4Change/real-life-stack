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
