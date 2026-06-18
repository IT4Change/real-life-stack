import { describe, it, expect } from "vitest"
import { getSpacePrimaryColor, getReadableTextColor, getItemColor } from "../src/lib/utils"

const HEX6 = /^#[0-9a-fA-F]{6}$/

describe("getItemColor (custom > tag > group)", () => {
  const groupColor = "#123456"

  it("uses a valid custom data.color first", () => {
    expect(getItemColor({ data: { color: "#abcdef" }, tags: ["cafe"] }, { groupColor })).toBe("#abcdef")
  })

  it("falls back to the first tag's accent when no custom colour", () => {
    const c = getItemColor({ data: {}, tags: ["cafe"] }, { groupColor })
    expect(c).toMatch(HEX6)
    expect(c).not.toBe(groupColor)
  })

  it("falls back to the group colour without a custom colour or tags", () => {
    expect(getItemColor({ data: {}, tags: [] }, { groupColor })).toBe(groupColor)
    expect(getItemColor({}, { groupColor })).toBe(groupColor)
  })

  it("ignores an invalid custom colour", () => {
    expect(getItemColor({ data: { color: "not-a-hex" }, tags: [] }, { groupColor })).toBe(groupColor)
  })
})

describe("getSpacePrimaryColor", () => {
  it("returns an explicit valid hex unchanged", () => {
    expect(getSpacePrimaryColor("space-1", "#2563eb")).toBe("#2563eb")
  })

  it("falls back to a deterministic id color for missing/invalid input", () => {
    const fallback = getSpacePrimaryColor("space-1")
    expect(fallback).toMatch(HEX6)
    expect(getSpacePrimaryColor("space-1", null)).toBe(fallback)
    expect(getSpacePrimaryColor("space-1", "not-a-hex")).toBe(fallback)
    expect(getSpacePrimaryColor("space-1", "#fff")).toBe(fallback) // too short
  })

  it("is stable per id", () => {
    expect(getSpacePrimaryColor("alpha")).toBe(getSpacePrimaryColor("alpha"))
  })
})

describe("getReadableTextColor", () => {
  it("returns black on a light accent and white on a dark accent", () => {
    expect(getReadableTextColor("#ffffff")).toBe("#000000")
    expect(getReadableTextColor("#000000")).toBe("#ffffff")
    expect(getReadableTextColor("#2563eb")).toBe("#ffffff")
  })

  it("defaults to white for invalid input", () => {
    expect(getReadableTextColor("nope")).toBe("#ffffff")
  })
})
