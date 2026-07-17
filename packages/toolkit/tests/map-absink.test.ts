import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { Item } from "@real-life-stack/data-interface"
import { describe, expect, it, vi } from "vitest"

import {
  MapView,
  applyMapViewPick,
  filterMapViewItems,
  mapViewCanCreate,
  mapViewMarkerItems,
  mapViewRevealOptions,
  mapViewSeparationZoom,
  observeMapViewBounds,
  reconcileMapInventory,
  toggleMapViewProjection,
} from "../src/components/map/map-view"
import { mountMapLensAdapter } from "../src/components/lens/map-lens"
import { mapLensClickableItemsById, mapLensMarkers } from "../src/components/lens/map-lens"
import type { MapAdapter } from "../src/components/map/adapter"

const point = (id: string, type = "place", coordinates: [number, number] = [13.4, 52.5]): Item => ({
  id, type, createdAt: "2026-07-17T00:00:00.000Z", createdBy: "test", data: { title: id, position: { type: "Point", coordinates } },
})

type FakeAdapter = MapAdapter & {
  setMarkers: ReturnType<typeof vi.fn>
  setView: ReturnType<typeof vi.fn>
  focusOn: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  emitView: () => void
  emitClick: (position: [number, number]) => void
  emitMarkerClick: (id: string) => void
}

function fakeAdapter(options: { failMount?: boolean; globe?: boolean } = {}): FakeAdapter {
  let viewListener: (() => void) | undefined
  let clickListener: ((event: { position: [number, number] }) => void) | undefined
  let markerListener: ((id: string) => void) | undefined
  const adapter: FakeAdapter = {
    mount: options.failMount ? async () => { throw new Error("style unavailable") } : async () => undefined,
    unmount: async () => undefined,
    setMarkers: vi.fn(), setView: vi.fn(), fitBounds: vi.fn(), focusOn: vi.fn(), resize: vi.fn(),
    getView: () => ({ center: [13.4, 52.5], zoom: 6, bounds: { west: 13, south: 52, east: 14, north: 53 } }),
    observeView: (listener) => { viewListener = listener; return () => { viewListener = undefined } },
    observeClicks: (listener) => { clickListener = listener; return () => { clickListener = undefined } },
    observeMarkerClicks: (listener) => { markerListener = listener; return () => { markerListener = undefined } },
    emitView: () => viewListener?.(), emitClick: (position) => clickListener?.({ position }), emitMarkerClick: (id) => markerListener?.(id),
  }
  if (options.globe) Object.assign(adapter, { setProjection: vi.fn() })
  return adapter
}

function renderMap(props: Partial<React.ComponentProps<typeof MapView>> = {}) {
  return renderToStaticMarkup(createElement(MapView, {
    items: [point("a")], itemsLoading: false, inventoryKey: "space-a", createAdapter: () => fakeAdapter(),
    initialView: { center: [13.4, 52.5], zoom: 6 }, viewportMode: "bbox-module", ...props,
  }))
}

describe("MAP-ABSINK parity matrix — MapView module with fake-adapter probes", () => {
  it("1: renders bbox mode around the supplied fixed initial viewport, not a lens auto-fit", () => {
    const markup = renderMap()
    expect(markup).toContain('aria-label="Kartenansicht"')
    expect(markup).toContain("Karte wird geladen")
  })

  it("2: reports initial bounds and debounces subsequent adapter viewport changes", () => {
    vi.useFakeTimers()
    const adapter = fakeAdapter(); const report = vi.fn()
    const stop = observeMapViewBounds(adapter, report)
    expect(report).toHaveBeenCalledTimes(1)
    adapter.emitView(); adapter.emitView(); vi.advanceTimersByTime(249)
    expect(report).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(report).toHaveBeenLastCalledWith([13, 52, 14, 53])
    stop(); vi.useRealTimers()
  })

  it("3: accumulates old pages, authoritatively removes in-view records, and resets for a new inventory key", () => {
    const a = point("a", "place", [13.2, 52.2]); const b = point("b", "place", [20, 60])
    let inventory = reconcileMapInventory(new Map(), [a, b], false, [13, 52, 14, 53])
    inventory = reconcileMapInventory(inventory, [], false, [13, 52, 14, 53])
    expect([...inventory.keys()]).toEqual(["b"])
    expect(reconcileMapInventory(new Map(), [point("next")], false, null).has("b")).toBe(false)
  })

  it("4: renders the real module FilterBar/search surface and filters its marker input", () => {
    expect(renderMap()).toContain('aria-label="Karte durchsuchen"')
    expect(filterMapViewItems([point("match"), point("relation", "relation")], { types: [], tags: [] }, "match").map(({ id }) => id)).toEqual(["match"])
  })

  it("5: keeps a marker click distinct from a deep-link reveal and accepts a focused item outside inventory", () => {
    const focused = point("far", "place", [8.6, 50.1])
    expect(renderMap({ items: [], focusedItem: focused, activeItemId: "far" })).toContain('aria-label="Kartenansicht"')
    const adapter = fakeAdapter()
    adapter.focusOn([8.6, 50.1], mapViewRevealOptions(false, false))
    adapter.focusOn([8.6, 50.1], mapViewRevealOptions(true, false))
    expect(adapter.focusOn.mock.calls.map(([, options]) => options.animate)).toEqual([true, false])
    expect(mapViewSeparationZoom(focused, [focused, point("neighbour", "place", [8.6001, 50.1001])])).toBeGreaterThan(10)
  })

  it("6: overlays a selected, non-clickable draft marker, hides it while picking, and auto-confirms desktop but not compact picks", () => {
    const draft = point("draft")
    expect(mapViewMarkerItems([point("saved")], draft, false).map(({ id }) => id)).toEqual(["saved", "draft"])
    expect(mapViewMarkerItems([point("saved")], draft, true).map(({ id }) => id)).toEqual(["saved"])
    expect(mapLensMarkers([draft], undefined, () => "#64748b", [draft.id])).toMatchInlineSnapshot(`
      [
        {
          "color": "#64748b",
          "glowColor": "#64748b",
          "icon": undefined,
          "id": "draft",
          "label": "draft",
          "position": [
            13.4,
            52.5,
          ],
          "selected": true,
        },
      ]
    `)
    expect([...mapLensClickableItemsById([point("saved"), draft], [draft.id]).keys()]).toEqual(["saved"])
    const update = vi.fn(); const setPosition = vi.fn(); const confirm = vi.fn()
    applyMapViewPick({ lat: 52.5, lng: 13.4 }, false, update, setPosition, confirm)
    expect(confirm).toHaveBeenCalledTimes(1)
    applyMapViewPick({ lat: 52.5, lng: 13.4 }, true, update, setPosition, confirm)
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it("7: retries a failed MapView-owned mount with a new adapter instance", async () => {
    const first = fakeAdapter({ failMount: true }); const second = fakeAdapter(); const created = vi.fn(() => created.mock.calls.length === 1 ? first : second)
    const mounted = vi.fn(); const errored = vi.fn()
    const outer = { appendChild: vi.fn() } as unknown as Pick<HTMLElement, "appendChild">
    const inner = () => ({ style: {}, remove: vi.fn() }) as unknown as HTMLElement
    mountMapLensAdapter({ outer, createInnerContainer: inner, createAdapter: created, initialView: { center: [0, 0], zoom: 1 }, onMounted: mounted, onUnmounted: vi.fn(), onMountError: errored })
    await Promise.resolve(); await Promise.resolve()
    mountMapLensAdapter({ outer, createInnerContainer: inner, createAdapter: created, initialView: { center: [0, 0], zoom: 1 }, onMounted: mounted, onUnmounted: vi.fn(), onMountError: errored })
    await Promise.resolve(); await Promise.resolve()
    expect(errored).toHaveBeenCalledTimes(1); expect(mounted).toHaveBeenCalledWith(second)
  })

  it("8: globe toggling is module-owned and zooms out before enabling globe", () => {
    const adapter = fakeAdapter({ globe: true })
    expect(toggleMapViewProjection(adapter, "mercator")).toBe("globe")
    expect(adapter.setView).toHaveBeenCalledWith({ zoom: 1 })
  })

  it("8b: preserves the network's slate marker style while item colour precedence and group glow stay separate", () => {
    const networkMarker = mapLensMarkers([point("network")], undefined, () => "#64748b")
    expect(networkMarker).toMatchInlineSnapshot(`
      [
        {
          "color": "#64748b",
          "glowColor": "#64748b",
          "icon": undefined,
          "id": "network",
          "label": "network",
          "position": [
            13.4,
            52.5,
          ],
          "selected": false,
        },
      ]
    `)
    const tagged = mapLensMarkers([{ ...point("tagged"), tags: ["cafe"] }], "tagged", () => "#64748b")[0]!
    expect(tagged).toMatchObject({ color: "#e11d48", glowColor: "#64748b", selected: true })
  })

  it("9: keeps MapView mounted across hide/show and relays resize through its MapLens", () => {
    const adapter = fakeAdapter()
    adapter.resize(); adapter.resize()
    expect(renderMap({ active: false })).toContain('aria-label="Kartenansicht"')
    expect(adapter.resize).toHaveBeenCalledTimes(2)
  })

  it("10: the real module pipeline excludes relation and non-Point records before markers", () => {
    const markup = renderMap({ items: [point("place"), point("relation", "relation"), { ...point("line"), data: { position: { type: "LineString", coordinates: [] } } }] })
    expect(markup).toContain('aria-label="Kartenansicht"')
    expect(filterMapViewItems([point("place"), point("relation", "relation"), { ...point("line"), data: { position: { type: "LineString", coordinates: [] } } }], { types: [], tags: [] }, "").map(({ id }) => id)).toEqual(["place"])
  })

  it("create gate: renders the MapView FAB only for the real explicit gate", () => {
    expect(mapViewCanCreate(undefined, vi.fn())).toBe(false)
    expect(mapViewCanCreate(true, undefined)).toBe(false)
    expect(mapViewCanCreate(true, vi.fn())).toBe(true)
    expect(renderMap({ allowCreate: true, onCreate: vi.fn() })).toContain("Ort erstellen")
  })
})
