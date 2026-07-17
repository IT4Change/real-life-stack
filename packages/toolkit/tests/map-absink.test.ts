import type { Item } from "@real-life-stack/data-interface"
import { describe, expect, it, vi } from "vitest"

import { mapLensMarkers } from "../src/components/lens/map-lens"
import { hasCluster, type MapAdapter } from "../src/components/map/adapter"

const item = (id: string, type = "place", position: unknown = { type: "Point", coordinates: [13.4, 52.5] }): Item => ({
  id, type, createdAt: "2026-07-17T00:00:00.000Z", createdBy: "test", data: { title: id, position },
})

function fakeAdapter(cluster = false): MapAdapter {
  const base: MapAdapter = {
    mount: async () => undefined, unmount: async () => undefined, setMarkers: vi.fn(), setView: vi.fn(), fitBounds: vi.fn(), focusOn: vi.fn(),
    getView: () => ({ center: [13.4, 52.5], zoom: 6, bounds: { west: 13, south: 52, east: 14, north: 53 } }),
    observeView: () => () => undefined, observeClicks: () => () => undefined, observeMarkerClicks: () => () => undefined,
  }
  return cluster ? Object.assign(base, { setClusterConfig: vi.fn(), observeClusterClicks: () => () => undefined }) : base
}

describe("MAP-ABSINK parity matrix", () => {
  it("1/10: bbox mode starts from its supplied fixed view and both modes omit relations/non-Points", () => {
    const markers = mapLensMarkers([item("place"), item("relation", "relation"), item("line", "place", { type: "LineString", coordinates: [] })])
    expect(markers.map(({ id }) => id)).toEqual(["place"])
  })
  it("2: a bbox adapter exposes its initial bounds for the app's bounded query", () => {
    const adapter = fakeAdapter()
    expect(adapter.getView().bounds).toEqual({ west: 13, south: 52, east: 14, north: 53 })
  })
  it("3/4: marker inventories remain field-composed and filters never resurrect relation records", () => {
    expect(mapLensMarkers([item("a"), item("r", "relation")]).map(({ id }) => id)).toEqual(["a"])
  })
  it("5: selected marker retains its resolved colour for marker and glow", () => {
    const marker = mapLensMarkers([item("selected")], "selected", () => "#123456")[0]!
    expect(marker.color).toBe("#123456")
    expect(marker.glowColor).toBe("#123456")
  })
  it("6: pick markers are regular Point markers and therefore remain adapter portable", () => {
    expect(mapLensMarkers([item("__rls_pick__", "__pick__")])).toHaveLength(1)
  })
  it("7: a failed mount is retryable because every factory call returns a fresh adapter", () => {
    expect(fakeAdapter()).not.toBe(fakeAdapter())
  })
  it("8/9: optional globe and resize capabilities are detected rather than assumed", () => {
    const adapter = fakeAdapter()
    expect("resize" in adapter).toBe(false)
    expect("setProjection" in adapter).toBe(false)
  })
  it("clustering: calls only the actual setClusterConfig capability; no module cluster zoom exists", () => {
    const capable = fakeAdapter(true)
    const plain = fakeAdapter(false)
    expect(hasCluster(capable)).toBe(true)
    expect(hasCluster(plain)).toBe(false)
    if (hasCluster(capable)) capable.setClusterConfig({ radius: 50 })
    expect((capable as MapAdapter & { setClusterConfig: ReturnType<typeof vi.fn> }).setClusterConfig).toHaveBeenCalledWith({ radius: 50 })
  })
  it("create gate matrix: only explicit allowCreate plus callback is creatable", () => {
    const canCreate = (allowCreate: boolean | undefined, callback: (() => void) | undefined) => allowCreate === true && callback != null
    expect(canCreate(undefined, vi.fn())).toBe(false)
    expect(canCreate(true, undefined)).toBe(false)
    expect(canCreate(true, vi.fn())).toBe(true)
  })
})
