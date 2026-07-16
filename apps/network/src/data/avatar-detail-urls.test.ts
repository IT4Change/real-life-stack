import type { Item } from "@real-life-stack/data-interface"
import { describe, expect, it } from "vitest"

import { dwebCampDetailAvatarUrl } from "./avatar-detail-urls"
import { dwebCampSeedItems } from "./network-seed"

describe("dwebCampDetailAvatarUrl", () => {
  it("resolves sharp HTTPS details only for known DWebCamp seed people", () => {
    const marie = dwebCampSeedItems.find(({ id }) => id === "person-marie")
    const andrea = dwebCampSeedItems.find(({ id }) => id === "person-andrea-ferrante")

    expect(marie && dwebCampDetailAvatarUrl(marie)).toBe(
      "https://talx.dod.ngo/media/avatars/MS3PPW_22hqsdk.webp",
    )
    expect(andrea && dwebCampDetailAvatarUrl(andrea)).toBe(
      "https://dwebcamp.org/media/andrea_ferrante.jpg",
    )

    const detailUrls = dwebCampSeedItems
      .filter(({ type }) => type === "person")
      .map(dwebCampDetailAvatarUrl)
      .filter((value): value is string => value !== null)
    expect(detailUrls).toHaveLength(111)
    expect(detailUrls.every((url) => url.startsWith("https://"))).toBe(true)
  })

  it("does not apply name-based detail sources to user-created items", () => {
    const item: Item = {
      id: "person-marie",
      type: "person",
      createdAt: "2026-07-16T00:00:00.000Z",
      createdBy: "user",
      data: { displayName: "Marie" },
    }

    expect(dwebCampDetailAvatarUrl(item)).toBeNull()
  })
})
