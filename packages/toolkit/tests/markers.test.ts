import { describe, it, expect } from "vitest"
import {
  resolveIcon,
  getIcon,
  registerIcon,
} from "../src/lib/icons/icon-registry"
import {
  renderMarkerSvg,
  markerDataUrl,
} from "../src/components/map/markers/render-marker-svg"
import { markerShapeBody } from "../src/components/map/markers/marker-shapes"

describe("resolveIcon", () => {
  it("resolves a curated name to glyph data", () => {
    const d = resolveIcon("cafe")
    expect(d).not.toBeNull()
    expect(d!.viewBox).toMatch(/\d/)
    expect(d!.body.length).toBeGreaterThan(0)
  })

  it("returns null for empty/unknown values", () => {
    expect(resolveIcon("totally-unknown-xyz")).toBeNull()
    expect(resolveIcon("")).toBeNull()
    expect(resolveIcon(undefined)).toBeNull()
  })

  it("treats an emoji as a non-monochrome text glyph", () => {
    const d = resolveIcon("🌱")
    expect(d?.monochrome).toBe(false)
    expect(d?.body).toContain("🌱")
  })

  it("parses an inline svg string", () => {
    const d = resolveIcon('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>')
    expect(d?.viewBox).toBe("0 0 10 10")
    expect(d?.body).toContain("<circle")
  })

  it("parses a utf8 data: URL svg", () => {
    const url = "data:image/svg+xml," + encodeURIComponent('<svg viewBox="0 0 8 8"><rect width="8" height="8"/></svg>')
    const d = resolveIcon(url)
    expect(d?.viewBox).toBe("0 0 8 8")
    expect(d?.body).toContain("<rect")
  })
})

describe("getIcon (registry-only, safe to inline-render)", () => {
  it("returns curated icons but never parses inline svg", () => {
    expect(getIcon("park")).toBeDefined()
    expect(getIcon("<svg><script>alert(1)</script></svg>")).toBeUndefined()
  })

  it("supports runtime registration", () => {
    registerIcon("custom-test", { viewBox: "0 0 4 4", body: "<rect/>" })
    expect(getIcon("custom-test")?.viewBox).toBe("0 0 4 4")
  })
})

describe("renderMarkerSvg", () => {
  it("fills the pin with the colour and contrasts the glyph (dark pin → white glyph)", () => {
    const svg = renderMarkerSvg({ color: "#2d5a3d", icon: "cafe" })
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg).toContain("#2d5a3d")
    expect(svg).toContain("#ffffff")
  })

  it("uses a dark glyph on a light colour", () => {
    expect(renderMarkerSvg({ color: "#ffffff", icon: "cafe" })).toContain("#000000")
  })

  it("defaults to a circle pin + dot glyph when no icon is given", () => {
    expect(renderMarkerSvg({ color: "#2563eb" })).toContain("<circle")
  })

  it("markerDataUrl returns an svg data URL", () => {
    expect(markerDataUrl({ color: "#2563eb" })).toMatch(/^data:image\/svg\+xml,/)
  })
})

describe("markerShapeBody", () => {
  it("injects the fill colour for each shape", () => {
    for (const shape of ["circle", "square"] as const) {
      expect(markerShapeBody(shape, "#abc123", "#000000")).toContain("#abc123")
    }
  })
})
