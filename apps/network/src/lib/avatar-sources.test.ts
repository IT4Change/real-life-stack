import { describe, expect, it } from "vitest"

import { resolveNetworkAvatarSources } from "./avatar-sources"

describe("resolveNetworkAvatarSources", () => {
  it("derives sharp Talx details and medium graph thumbnails", () => {
    expect(resolveNetworkAvatarSources(
      "https://talx.dod.ngo/media/avatars/example_thumbnail_tiny.webp?v=1",
    )).toEqual({
      detailUrl: "https://talx.dod.ngo/media/avatars/example.webp?v=1",
      graphUrl: "https://talx.dod.ngo/media/avatars/example_thumbnail_default.webp?v=1",
    })
  })

  it("derives both DWebCamp variants from either URL", () => {
    const expected = {
      detailUrl: "https://dwebcamp.org/media/person.jpg",
      graphUrl: "https://dwebcamp.org/media/person.thumbnail.jpg",
    }

    expect(resolveNetworkAvatarSources(expected.detailUrl)).toEqual(expected)
    expect(resolveNetworkAvatarSources(expected.graphUrl)).toEqual(expected)
  })

  it("preserves unknown and malformed sources", () => {
    expect(resolveNetworkAvatarSources("https://example.com/avatar.jpg")).toEqual({
      detailUrl: "https://example.com/avatar.jpg",
      graphUrl: "https://example.com/avatar.jpg",
    })
    expect(resolveNetworkAvatarSources("not a url")).toEqual({
      detailUrl: "not a url",
      graphUrl: "not a url",
    })
  })
})
