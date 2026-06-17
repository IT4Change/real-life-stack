import { describe, it, expect, vi, afterEach } from "vitest"
import { createNominatimGeocoder } from "../src/lib/geocode"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("createNominatimGeocoder", () => {
  it("returns [] for a blank query without fetching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const geocode = createNominatimGeocoder()
    expect(await geocode("   ")).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("maps Nominatim entries to { label, lat, lng } and drops non-finite coords", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: "52.52", lon: "13.405", display_name: "Berlin, Deutschland" },
        { lat: "not-a-number", lon: "1", display_name: "Broken" },
      ],
    } as Response)
    const res = await createNominatimGeocoder()("Berlin")
    expect(res).toEqual([{ label: "Berlin, Deutschland", lat: 52.52, lng: 13.405 }])
  })

  it("forwards limit + language and respects a custom endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)
    await createNominatimGeocoder({
      endpoint: "https://geo.example.org/search",
      limit: 3,
      language: "de",
    })("Markthalle")
    const url = String(fetchSpy.mock.calls[0]?.[0])
    expect(url).toContain("https://geo.example.org/search?")
    expect(url).toContain("limit=3")
    expect(url).toContain("accept-language=de")
    expect(url).toContain("q=Markthalle")
  })

  it("throws on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 429 } as Response)
    await expect(createNominatimGeocoder()("x")).rejects.toThrow(/429/)
  })
})
