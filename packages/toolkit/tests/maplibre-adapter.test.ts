// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Regression cover for the vector map's light/dark style swap.
 *
 * `setStyle` throws away every source, layer and image the adapter added on top
 * of the old style, so the marker set has to be re-installed afterwards. Two
 * things went wrong here before, both invisible to a naive "toggle and look"
 * check, hence this fake-map harness:
 *
 *  1. The re-install hung on `styledata`, which fires once — while the new
 *     style is still being built — and then not again.
 *  2. The re-install computed an EMPTY delta, because a marker write that
 *     landed mid-swap had refilled the bookkeeping against the old style.
 */

const MARKER_SOURCE = "rls-markers"

interface SourceDiff {
  add?: Array<{ id: string }>
  update?: Array<{ id: string }>
  remove?: string[]
}

/** Minimal MapLibre stand-in: models the parts the adapter actually drives. */
class FakeMap {
  style: string
  styleLoaded = true
  sources = new Map<string, { diffs: SourceDiff[] }>()
  layers = new Set<string>()
  images = new Set<string>()
  projection: string | null = null
  private listeners = new Map<string, Set<(e?: unknown) => void>>()

  constructor(options: { style: string }) {
    this.style = options.style
  }

  on(type: string, layerOrCb: unknown, maybeCb?: unknown) {
    const cb = (typeof layerOrCb === "function" ? layerOrCb : maybeCb) as (e?: unknown) => void
    if (!cb) return
    const key = typeof layerOrCb === "function" ? type : `${type}:${String(layerOrCb)}`
    if (!this.listeners.has(key)) this.listeners.set(key, new Set())
    this.listeners.get(key)!.add(cb)
  }
  off(type: string, layerOrCb: unknown, maybeCb?: unknown) {
    const cb = (typeof layerOrCb === "function" ? layerOrCb : maybeCb) as (e?: unknown) => void
    const key = typeof layerOrCb === "function" ? type : `${type}:${String(layerOrCb)}`
    this.listeners.get(key)?.delete(cb)
  }
  emit(type: string) {
    for (const cb of [...(this.listeners.get(type) ?? [])]) cb({})
  }

  loaded() { return true }
  isStyleLoaded() { return this.styleLoaded }

  addControl() {}
  getContainer() { return document.createElement("div") }
  getCanvas() { return { style: {} } as unknown as HTMLCanvasElement }

  addSource(id: string) {
    this.addSourceCalls += 1
    this.sources.set(id, { diffs: [] })
  }
  getSource(id: string) {
    const source = this.sources.get(id)
    if (!source) return undefined
    return {
      updateData: (diff: SourceDiff) => source.diffs.push(diff),
      setData: () => {},
    }
  }
  removeSource(id: string) { this.sources.delete(id) }
  addLayer(layer: { id: string }) { this.layers.add(layer.id) }
  getLayer(id: string) { return this.layers.has(id) ? { id } : undefined }
  removeLayer(id: string) { this.layers.delete(id) }

  // Always "already there": rasterising a pin needs a real Image, which never
  // fires load/error under jsdom and would hang the marker pipeline. Reporting
  // the icon as present skips rasterisation; these tests are about the source
  // and layer lifecycle, not the icon atlas.
  hasImage() { return true }
  addImage(key: string) { this.images.add(key) }
  addSourceCalls = 0

  queryRenderedFeatures() { return [] }
  querySourceFeatures() { return [] }
  setFeatureState() {}
  setProjection(p: { type: string }) { this.projection = p.type }
  getCenter() { return { lng: 0, lat: 0 } }
  getZoom() { return 5 }
  getBounds() {
    return { getNorth: () => 1, getEast: () => 1, getSouth: () => 0, getWest: () => 0 }
  }
  jumpTo() {}
  remove() {}
  resizeCalls = 0
  redrawCalls = 0
  resize() { this.resizeCalls += 1 }
  redraw() { this.redrawCalls += 1 }

  /**
   * Ask for a new style. Mirrors MapLibre: the swap is asynchronous, so the OLD
   * style (and our sources on it) stay live until it completes. That window is
   * exactly where the mid-swap marker write lands.
   */
  setStyle(style: string) {
    this.style = style
    this.styleLoaded = false
  }

  /** Complete the pending swap: the old style's sources and layers are gone. */
  completeStyleLoad() {
    this.sources.clear()
    this.layers.clear()
    this.images.clear()
    this.styleLoaded = true
    this.emit("styledata")
    this.emit("idle")
  }
}

let lastMap: FakeMap | null = null

vi.mock("maplibre-gl", () => ({
  default: {
    Map: class {
      constructor(options: { style: string }) {
        lastMap = new FakeMap(options)
        return lastMap as unknown as object
      }
    },
    Marker: class {},
    NavigationControl: class {},
    AttributionControl: class {},
  },
}))

const { MapLibreMapAdapter } = await import("../src/components/map/adapters/maplibre")

const markers = [
  { id: "a", position: [1, 1] as [number, number] },
  { id: "b", position: [2, 2] as [number, number] },
  { id: "c", position: [3, 3] as [number, number] },
]

/** Every feature id the adapter has pushed as an ADD onto the live source. */
function addedIds(map: FakeMap): string[] {
  const source = map.sources.get(MARKER_SOURCE)
  if (!source) return []
  return source.diffs.flatMap((d) => (d.add ?? []).map((f) => f.id))
}

async function settle() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

describe("MapLibre light/dark style swap", () => {
  let adapter: InstanceType<typeof MapLibreMapAdapter>

  beforeEach(async () => {
    document.documentElement.classList.remove("dark")
    lastMap = null
    adapter = new MapLibreMapAdapter()
    await adapter.mount(document.createElement("div"), { center: [0, 0], zoom: 5 })
    adapter.setMarkers(markers)
    await settle()
  })

  afterEach(async () => {
    await adapter.unmount()
    document.documentElement.classList.remove("dark")
  })

  it("starts on the light style and renders the markers", () => {
    expect(lastMap!.style).toContain("liberty")
    expect(addedIds(lastMap!)).toEqual(["a", "b", "c"])
  })

  it("switches to the dark style", () => {
    adapter.setColorScheme("dark")
    expect(lastMap!.style).toContain("/dark")
  })

  it("re-installs the markers once the new style has finished loading", async () => {
    const installsBefore = lastMap!.addSourceCalls
    adapter.setColorScheme("dark")

    lastMap!.completeStyleLoad()
    await settle()

    expect(lastMap!.addSourceCalls).toBe(installsBefore + 1)
    expect(addedIds(lastMap!)).toEqual(["a", "b", "c"])
  })

  it("does not re-install onto a style that is still being built", async () => {
    const installsBefore = lastMap!.addSourceCalls
    adapter.setColorScheme("dark")
    // Both signals can fire early; neither may be acted on while the style is
    // half-built, or the sources would be wiped when it completes.
    lastMap!.emit("styledata")
    lastMap!.emit("idle")
    await settle()
    expect(lastMap!.addSourceCalls).toBe(installsBefore)

    lastMap!.completeStyleLoad()
    await settle()
    expect(addedIds(lastMap!)).toEqual(["a", "b", "c"])
  })

  it("survives a marker write that lands mid-swap", async () => {
    adapter.setColorScheme("dark")
    // A viewport change during the ~1s style load re-runs the app's setMarkers.
    // It still sees the OLD style, and must not leave the bookkeeping in a state
    // where the re-install computes an empty delta.
    adapter.setMarkers(markers)
    await settle()

    lastMap!.completeStyleLoad()
    await settle()

    expect(addedIds(lastMap!)).toEqual(["a", "b", "c"])
  })

  it("restores the markers when switching back to light", async () => {
    adapter.setColorScheme("dark")
    lastMap!.completeStyleLoad()
    await settle()

    adapter.setColorScheme("light")
    expect(lastMap!.style).toContain("liberty")
    lastMap!.completeStyleLoad()
    await settle()

    expect(addedIds(lastMap!)).toEqual(["a", "b", "c"])
  })

  it("re-applies the projection, which resets with the style", async () => {
    adapter.setProjection("globe")
    adapter.setColorScheme("dark")
    lastMap!.projection = null
    lastMap!.completeStyleLoad()
    await settle()

    expect(lastMap!.projection).toBe("globe")
  })

  it("follows the app's dark class when the preference is auto", async () => {
    document.documentElement.classList.add("dark")
    await settle()
    expect(lastMap!.style).toContain("/dark")
  })

  it("redraws synchronously on resize so no blank frame is presented", async () => {
    // `map.resize()` reallocates (and clears) the GL drawing buffer but only
    // schedules the repaint for the next frame. The side panel animates the
    // container width, so the ResizeObserver fires on every frame of it — each
    // one leaving a cleared canvas for the browser to paint. Measured on the
    // real app: 41 of 106 captured frames were blank without the redraw, 0 with.
    adapter.resize()
    expect(lastMap!.resizeCalls).toBe(1)
    expect(lastMap!.redrawCalls).toBe(1)
  })

  it("keeps a caller-pinned style across both schemes", async () => {
    const pinned = new MapLibreMapAdapter()
    await pinned.mount(document.createElement("div"), {
      center: [0, 0],
      zoom: 5,
      tileSource: "https://example.test/custom-style",
    })
    pinned.setColorScheme("dark")
    expect(lastMap!.style).toBe("https://example.test/custom-style")
    await pinned.unmount()
  })
})
