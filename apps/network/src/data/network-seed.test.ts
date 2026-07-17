import {
  relationRecordFromItem,
  VOCAB_BASE,
  VOCAB_PERSON,
  VOCAB_PROJECT,
  VOCAB_RELATION,
  type Item,
  type RelationRecord,
} from "@real-life-stack/data-interface"
import { MockConnector } from "@real-life-stack/mock-connector"
import { beforeAll, describe, expect, it } from "vitest"

import {
  buildDwebCampSeedItems,
  dwebCampDomainItems,
  dwebCampItemId,
  DWEB_CAMP_SEED_CREATED_AT,
  DWEB_CAMP_SEED_CREATOR,
  slugSeedValue,
} from "./network-seed"
import { NETWORK_RELATION_STORE_OPTIONS } from "./network-relation-predicates"

let seedItems: Item[]
let relationItems: Item[]
let relationRecords: RelationRecord[]

beforeAll(async () => {
  seedItems = await buildDwebCampSeedItems()
  relationItems = seedItems.filter(({ type }) => type === "relation")
  relationRecords = relationItems
    .map(relationRecordFromItem)
    .filter((record): record is RelationRecord => record !== null)
})

describe("DWebCamp seed importer", () => {
  it("imports the exact domain and relation inventories with stable unique ids", () => {
    expect(dwebCampDomainItems.filter(({ type }) => type === "event")).toHaveLength(109)
    expect(dwebCampDomainItems.filter(({ type }) => type === "person")).toHaveLength(138)
    expect(dwebCampDomainItems.filter(({ type }) => type === "project")).toHaveLength(65)
    expect(dwebCampDomainItems).toHaveLength(312)
    expect(relationItems).toHaveLength(388)
    expect(relationRecords).toHaveLength(388)
    expect(seedItems).toHaveLength(705)
    expect(new Set(seedItems.map(({ id }) => id)).size).toBe(705)

    expect(dwebCampItemId("event", "SJXE8X")).toBe("event-sjxe8x")
    expect(dwebCampItemId("person", "Václav Pavlín")).toBe("person-vaclav-pavlin")
    expect(slugSeedValue("The Open Co-op")).toBe("the-open-co-op")
  })

  it("builds the same ordered fixture more than once", async () => {
    expect(await buildDwebCampSeedItems()).toEqual(await buildDwebCampSeedItems())
  })

  it("re-imports the fixture into one MockConnector without duplicate ids or memberships", async () => {
    const connector = new MockConnector({
      items: [],
      groups: [
        { id: "dwebcamp", name: "DWebCamp" },
        { id: "my-network", name: "Mein Netzwerk" },
      ],
      users: [{ id: "did:example:network-local-user", displayName: "Mein Profil" }],
      groupMembers: {
        dwebcamp: ["did:example:network-local-user"],
        "my-network": ["did:example:network-local-user"],
      },
      groupItems: { dwebcamp: [], "my-network": [] },
    }, {
      symmetricRelationPredicates: NETWORK_RELATION_STORE_OPTIONS.symmetricPredicates,
    })

    connector.injectSeedItems(await buildDwebCampSeedItems(), "dwebcamp")
    connector.injectSeedItems(await buildDwebCampSeedItems(), "dwebcamp")

    connector.setCurrentGroup("dwebcamp")
    const importedItems = await connector.getItems()
    expect(importedItems).toHaveLength(705)
    expect(new Set(importedItems.map(({ id }) => id)).size).toBe(705)
    expect(importedItems.filter(({ type }) => type !== "relation")).toHaveLength(317)
    expect(importedItems.filter(({ type }) => type === "relation")).toHaveLength(388)

    connector.setCurrentGroup("my-network")
    expect(await connector.getItems()).toEqual([])
    await connector.dispose()
  })

  it("stores all graph edges as relation records and none on domain items", () => {
    expect(relationRecords.filter(({ predicate }) => predicate === "attends")).toHaveLength(192)
    expect(relationRecords.filter(({ predicate }) => predicate === "connectedWith")).toHaveLength(97)
    const partOfRecords = relationRecords.filter(({ predicate }) => predicate === "partOf")
    expect(partOfRecords).toHaveLength(99)
    for (const record of partOfRecords) {
      const contexts = record.fields?.contexts
      expect(Array.isArray(contexts)).toBe(true)
      expect(contexts).toEqual([...new Set(contexts as string[])].sort())
      expect(record.fields).not.toHaveProperty("context")
    }
    expect(dwebCampDomainItems.every(({ relations }) => relations === undefined)).toBe(true)

    const adamAttends = relationRecords.find(({ id }) => (
      id === "rel-a51546e70eb70bec300eb5d67fa96c5a8fdee4adb7e61e7469b44226378b8117"
    ))
    expect(adamAttends).toEqual({
      id: "rel-a51546e70eb70bec300eb5d67fa96c5a8fdee4adb7e61e7469b44226378b8117",
      predicate: "attends",
      from: "item:person-adam",
      to: "item:event-ntyghs",
      fields: { tense: "has-been", role: "speaker" },
      createdAt: DWEB_CAMP_SEED_CREATED_AT,
      createdBy: DWEB_CAMP_SEED_CREATOR,
    })

    expect(relationRecords).toContainEqual({
      id: "rel-5b412a2b673962f16ff89324a7a9cb84b90d5c412d10203e66f62f6dcdb00bbc",
      predicate: "connectedWith",
      from: "item:event-3kgbef",
      to: "item:project-fsfe",
      createdAt: DWEB_CAMP_SEED_CREATED_AT,
      createdBy: DWEB_CAMP_SEED_CREATOR,
    })

    expect(relationRecords).toContainEqual({
      id: "rel-085da6d0eebd92ec79206b933acdd1f075f6c4f02f560fa0c1df9d9f7e5758bc",
      predicate: "partOf",
      from: "item:person-michael-suantak",
      to: "item:project-asorcom",
      fields: { contexts: ["BE7GHD", "JYFKLK", "V9L89B"] },
      createdAt: DWEB_CAMP_SEED_CREATED_AT,
      createdBy: DWEB_CAMP_SEED_CREATOR,
    })
  })

  it("emits valid local endpoints and fixture metadata for every relation item", () => {
    const domainIds = new Set(dwebCampDomainItems.map(({ id }) => id))

    for (const record of relationRecords) {
      expect(record.from.startsWith("item:")).toBe(true)
      expect(record.to.startsWith("item:")).toBe(true)
      expect(domainIds.has(record.from.slice("item:".length))).toBe(true)
      expect(domainIds.has(record.to.slice("item:".length))).toBe(true)
      expect(record.createdBy).toBe(DWEB_CAMP_SEED_CREATOR)
      expect(record.createdAt).toBe(DWEB_CAMP_SEED_CREATED_AT)
    }
    for (const item of relationItems) {
      expect(item["@context"]).toEqual([VOCAB_BASE, VOCAB_RELATION])
      expect(item.relations?.filter(({ predicate }) => predicate === "from")).toHaveLength(1)
      expect(item.relations?.filter(({ predicate }) => predicate === "to")).toHaveLength(1)
    }
  })

  it("maps links and bundled avatars to the canonical avatarUrl field", () => {
    const quiet = dwebCampDomainItems.find(({ id }) => id === "project-quiet")
    expect(quiet?.data).toEqual({
      title: "Quiet",
      website: "https://tryquiet.org",
      repo: "https://github.com/TryQuiet/quiet",
    })

    const marie = dwebCampDomainItems.find(({ id }) => id === "person-marie")
    expect(marie?.data.displayName).toBe("Marie")
    expect(marie?.data.avatarUrl).toMatch(/^data:image\/webp;base64,/)

    const andrea = dwebCampDomainItems.find(({ id }) => id === "person-andrea-ferrante")
    expect(andrea?.data.displayName).toBe("Andrea Ferrante")
    expect(andrea?.data.avatarUrl).toMatch(/^data:image\/jpeg;base64,/)

    const avatarUrls = dwebCampDomainItems
      .filter(({ type }) => type === "person")
      .map(({ data }) => data.avatarUrl)
      .filter((value): value is string => typeof value === "string")
    expect(avatarUrls).toHaveLength(111)
    expect(avatarUrls.every((url) => url.startsWith("data:image/"))).toBe(true)
  })

  it("derives vocabulary contexts from each imported item shape", () => {
    const event = dwebCampDomainItems.find(({ type }) => type === "event")
    const person = dwebCampDomainItems.find(({ type }) => type === "person")
    const project = dwebCampDomainItems.find(({ type }) => type === "project")

    expect(event?.["@context"]).toEqual([VOCAB_BASE])
    expect(person?.["@context"]).toEqual([VOCAB_BASE, VOCAB_PERSON])
    expect(project?.["@context"]).toEqual([VOCAB_BASE, VOCAB_PROJECT])
  })
})
