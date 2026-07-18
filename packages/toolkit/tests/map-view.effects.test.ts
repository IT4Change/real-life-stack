// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { Item } from "@real-life-stack/data-interface"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MapView, type MapViewProps } from "../src/components/map/map-view"
import type { MapAdapter, MapMarkerSpec, MapMountOptions } from "../src/components/map/adapter"

globalThis.IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
})

const initialView: MapMountOptions = { center: [13.4, 52.5], zoom: 6 }
const point = (id: string, coordinates: [number, number] = [13.4, 52.5]): Item => ({
  id, type: "place", createdAt: "2026-07-17T00:00:00.000Z", createdBy: "test",
  data: { title: id, position: { type: "Point", coordinates } },
})

class ProbeAdapter implements MapAdapter {
  readonly mount = vi.fn(async (container: HTMLElement, options: MapMountOptions) => {
    this.live.add(this)
    this.containers.push(container)
    this.mountOptions.push(options)
  })
  readonly unmount = vi.fn(async () => { this.live.delete(this) })
  readonly setMarkers = vi.fn((markers: MapMarkerSpec[]) => { this.markerSets.push(markers) })
  readonly setView = vi.fn()
  readonly fitBounds = vi.fn()
  readonly focusOn = vi.fn()
  readonly resize = vi.fn()
  readonly mountOptions: MapMountOptions[] = []
  readonly containers: HTMLElement[] = []
  readonly markerSets: MapMarkerSpec[][] = []

  constructor(private readonly live: Set<ProbeAdapter>, private readonly failMount = false) {
    if (failMount) this.mount.mockImplementation(async () => { throw new Error("style unavailable") })
  }

  getView() { return { center: [13.4, 52.5] as [number, number], zoom: 6, bounds: { west: 13, south: 52, east: 14, north: 53 } } }
  observeView() { return () => undefined }
  observeClicks() { return () => undefined }
  observeMarkerClicks() { return () => undefined }
}

interface MountedMap {
  root: Root
  container: HTMLDivElement
  render: (props?: Partial<MapViewProps>) => Promise<void>
}

const defaults = (createAdapter: () => MapAdapter): MapViewProps => ({
  items: [point("a")], itemsLoading: false, inventoryKey: "space-a", createAdapter, initialView, viewportMode: "bbox-module",
})

async function mountMap(createAdapter: () => MapAdapter, props: Partial<MapViewProps> = {}): Promise<MountedMap> {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = async (next: Partial<MapViewProps> = {}) => {
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(MapView, { ...defaults(createAdapter), ...props, ...next })))
      await Promise.resolve()
      await Promise.resolve()
    })
  }
  await render()
  return { root, container, render }
}

afterEach(async () => {
  await act(async () => { document.body.replaceChildren() })
})

describe("MapView effect parity — mounted module with fake-adapter probes", () => {
  it("mount: creates adapters through the real lifecycle, mounts the supplied initial view, and leaves one StrictMode instance alive", async () => {
    const live = new Set<ProbeAdapter>()
    const created: ProbeAdapter[] = []
    const createAdapter = vi.fn(() => { const adapter = new ProbeAdapter(live); created.push(adapter); return adapter })
    const mounted = await mountMap(createAdapter)

    expect(createAdapter).toHaveBeenCalledTimes(2)
    expect(created.flatMap((adapter) => adapter.mountOptions)).toEqual([initialView, initialView])
    expect(live.size).toBe(1)
    await act(async () => { mounted.root.unmount() })
  })

  it("bbox deep-link reveal approaches an unloaded target, then settles it when its page arrives", async () => {
    const live = new Set<ProbeAdapter>(); const adapters: ProbeAdapter[] = []
    const createAdapter = () => { const adapter = new ProbeAdapter(live); adapters.push(adapter); return adapter }
    const focused = point("far", [8.6, 50.1])
    const mounted = await mountMap(createAdapter, { items: [point("near")], focusedItem: focused, activeItemId: focused.id, onViewportBoundsChange: vi.fn() })
    const adapter = [...live][0]!

    expect(adapter.focusOn).toHaveBeenLastCalledWith([8.6, 50.1], expect.objectContaining({ animate: true, zoom: 10 }))
    await mounted.render({ items: [point("near"), focused], focusedItem: focused, activeItemId: focused.id, onViewportBoundsChange: vi.fn() })
    expect(adapter.focusOn).toHaveBeenLastCalledWith([8.6, 50.1], expect.objectContaining({ animate: true, zoom: expect.any(Number) }))
    expect(adapter.focusOn).toHaveBeenCalledTimes(2)
    await act(async () => { mounted.root.unmount() })
  })

  it("lens deep-link centers the active marker without changing zoom", async () => {
    const live = new Set<ProbeAdapter>()
    const mounted = await mountMap(() => new ProbeAdapter(live), { viewportMode: "lens-auto-fit", activeItemId: "a" })
    const adapter = [...live][0]!

    expect(adapter.focusOn).toHaveBeenCalledWith([13.4, 52.5], { animate: false })
    expect(adapter.focusOn.mock.calls.every(([, options]) => options?.zoom === undefined)).toBe(true)
    await act(async () => { mounted.root.unmount() })
  })

  it("mount failure: the rendered retry button creates a fresh adapter and re-mounts it", async () => {
    const live = new Set<ProbeAdapter>(); const adapters: ProbeAdapter[] = []
    // StrictMode replays the initial mount, so both initial attempts fail; the
    // retry effect is the third, fresh factory result.
    const createAdapter = vi.fn(() => { const adapter = new ProbeAdapter(live, adapters.length < 2); adapters.push(adapter); return adapter })
    const mounted = await mountMap(createAdapter)

    expect(mounted.container.textContent).toContain("Karte konnte nicht geladen werden.")
    await act(async () => {
      (mounted.container.querySelector("button") as HTMLButtonElement).click()
      await Promise.resolve(); await Promise.resolve()
    })
    expect(createAdapter).toHaveBeenCalledTimes(3)
    expect(adapters[2]!.mount).toHaveBeenCalledWith(expect.any(HTMLElement), initialView)
    expect(live).toEqual(new Set([adapters[2]]))
    await act(async () => { mounted.root.unmount() })
  })

  it("keep-alive and marker inventory effects resize on re-show, remove ghosts, and replace immediately on inventoryKey", async () => {
    const live = new Set<ProbeAdapter>(); const createAdapter = () => new ProbeAdapter(live)
    const old = point("old"); const retained = point("retained", [13.5, 52.5]); const replacement = point("replacement", [13.6, 52.5])
    const mounted = await mountMap(createAdapter, { items: [old, retained], onViewportBoundsChange: vi.fn() })
    const adapter = [...live][0]!

    await mounted.render({ items: [retained] })
    expect(adapter.markerSets.at(-1)?.map(({ id }) => id)).toEqual([retained.id])
    await mounted.render({ inventoryKey: "space-b", items: [replacement] })
    expect(adapter.markerSets.at(-1)?.map(({ id }) => id)).toEqual([replacement.id])
    const resizesBeforeShow = adapter.resize.mock.calls.length
    await mounted.render({ inventoryKey: "space-b", items: [replacement], active: false })
    await mounted.render({ inventoryKey: "space-b", items: [replacement], active: true })
    expect(adapter.resize).toHaveBeenCalledTimes(resizesBeforeShow + 1)
    await act(async () => { mounted.root.unmount() })
  })
})
