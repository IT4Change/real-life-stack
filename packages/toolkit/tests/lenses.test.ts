import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { Item } from "@real-life-stack/data-interface"
import { describe, expect, it, vi } from "vitest"

import { KanbanBoard } from "../src/components/kanban/kanban-board"
import { kanbanItemsByColumn, defaultColumns } from "../src/components/kanban/kanban-board"
import {
  CalendarView,
  calendarFilterItems,
  focusCalendarItemOnce,
  prioritizeActiveEvent,
  type CalendarFocusTarget,
} from "../src/components/calendar/calendar-view"
import { LeafletMapAdapter } from "../src/components/map/adapters/leaflet"
import { MapLibreMapAdapter } from "../src/components/map/adapters/maplibre"
import type { MapAdapter, MapMarkerSpec } from "../src/components/map/adapter"
import {
  SINGLE_MARKER_ZOOM,
  fitMapLensViewport,
  initialMapLensViewportContext,
  initialMapLensViewportState,
  mapLensViewportStateForAdapter,
  mapLensMarkers,
  mountMapLensAdapter,
  updateMapLensViewport,
  updateMapLensViewportForResetKey,
  observeMapLensContainerResize,
} from "../src/components/lens/map-lens"
import { bottomNavItems } from "../src/components/layout/bottom-nav"
import { Calendar, Grid2X2, List, Map, User } from "lucide-react"
import { drawerHeightFromY } from "../src/components/layout/adaptive-panel"
import {
  focusActiveItemInVisibleAreaOnce,
  focusActiveItemOnce,
  focusVirtualItemOnce,
  selectionFocusScrollMarginBlockEnd,
} from "../src/lib/selection-focus"
import { formatEventRange } from "../src/components/preview/item-meta-row"
import { GridView } from "../src/components/lens/grid-view"
import { ListView } from "../src/components/lens/list-view"
import { CollectionView, collectionFocusGateKey } from "../src/components/lens/collection-view"

function item(id: string, type: string, data: Record<string, unknown>, createdAt = "2026-07-08T10:00:00.000Z"): Item {
  return { id, type, createdAt, createdBy: "seed", data }
}

function mapAdapter(): MapAdapter & {
  setView: ReturnType<typeof vi.fn>
  fitBounds: ReturnType<typeof vi.fn>
  focusOn: ReturnType<typeof vi.fn>
} {
  return {
    mount: async () => undefined,
    unmount: async () => undefined,
    setMarkers: vi.fn(),
    setView: vi.fn(),
    fitBounds: vi.fn(),
    focusOn: vi.fn(),
    getView: () => ({
      center: [12.4, 52.1],
      zoom: 10,
      bounds: { west: 12, south: 52, east: 13, north: 53 },
    }),
    observeView: () => () => undefined,
    observeClicks: () => () => undefined,
    observeMarkerClicks: () => () => undefined,
  }
}

describe("read-only lenses", () => {
  it("1/3: ListView keeps every non-relation item in its virtualizer dataset and excludes relation records", () => {
    const items = [
      item("task-1", "task", { title: "Aufgabe", status: "open" }),
      item("resource-1", "resource", { title: "Lötstation", kind: "tool" }),
      item("relation-1", "relation", { title: "Unsichtbare Kante", status: "open", kind: "tool" }),
    ]

    const markup = renderToStaticMarkup(createElement(ListView, { items }))

    expect(markup).toContain("Aufgabe")
    expect(markup).toContain("Lötstation")
    expect(markup).not.toContain("Unsichtbare Kante")
    expect(markup).not.toContain("<input")
    expect(markup.match(/data-preview-density="compact"/g)).toHaveLength(2)
    expect(markup).toContain('data-virtualizer-item-count="2"')
  })

  it("1/3: SSR renders a deterministic virtual subset while retaining every reachable list item", () => {
    const items = Array.from({ length: 330 }, (_, index) => item(
      `task-${index}`,
      "task",
      { title: `Aufgabe ${index}` },
    ))
    const markup = renderToStaticMarkup(createElement(ListView, { items }))

    expect(markup).toContain('data-virtualizer-item-count="330"')
    expect(markup).toContain("Aufgabe 0")
    expect(markup).not.toContain("Aufgabe 329")
    expect(markup.match(/data-preview-density="compact"/g)?.length).toBeLessThan(330)
  })

  it("1: GridView leaves relation records out while composing comfortable ItemPreview adornments", () => {
    const items = [
      item("person-ada", "person", { displayName: "Ada Lovelace", avatarUrl: "https://example.test/ada.png" }),
      item("project-rls", "project", { title: "Real Life Stack", website: "https://real-life-stack.org", repo: "https://github.com/real-life-org/real-life-stack" }),
      item("resource-1", "resource", { title: "Lötstation", kind: "tool", availability: "frei nutzbar" }),
      item("event-1", "event", { title: "Eröffnung", start: "2026-07-08T19:00:00+02:00" }),
      item("initiative-1", "initiative", { title: "Offene Werkstatt" }),
      item("relation-1", "relation", { title: "Unsichtbare Kante" }),
    ]

    const markup = renderToStaticMarkup(createElement(GridView, { items }))

    expect(markup).toContain("Ada Lovelace")
    expect(markup).toContain('data-slot="avatar"')
    expect(markup).toContain(">AL<")
    expect(markup).toContain("Website: https://real-life-stack.org")
    expect(markup).toContain("Repo: https://github.com/real-life-org/real-life-stack")
    expect(markup).toContain(">tool<")
    expect(markup).toContain("frei nutzbar")
    expect(markup).toContain(formatEventRange("2026-07-08T19:00:00+02:00"))
    expect(markup).toContain(">initiative<")
    expect(markup).not.toContain("Unsichtbare Kante")
    expect(markup.match(/data-preview-density="comfortable"/g)).toHaveLength(5)
  })

  it("1/8: CollectionView keeps list and grid as densities and re-arms the active focus gate per layout", () => {
    const items = [item("task-1", "task", { title: "Aktive Aufgabe", status: "open" })]
    const listMarkup = renderToStaticMarkup(createElement(CollectionView, { items, activeItemId: "task-1" }))
    const gridMarkup = renderToStaticMarkup(createElement(CollectionView, { items, activeItemId: "task-1", defaultLayout: "grid" }))

    // Zugänglicher Zustands-Toggle: stabile Namen + aria-pressed je Button
    // (nie Aktions-Label mit Zustands-Attribut mischen).
    expect(listMarkup).toContain('aria-label="Listenansicht" aria-pressed="true"')
    expect(listMarkup).toContain('aria-label="Rasteransicht" aria-pressed="false"')
    expect(listMarkup).toContain('data-preview-density="compact"')
    expect(gridMarkup).toContain('aria-label="Rasteransicht" aria-pressed="true"')
    expect(gridMarkup).toContain('aria-label="Listenansicht" aria-pressed="false"')
    expect(gridMarkup).toContain('data-preview-density="comfortable"')
    expect(collectionFocusGateKey("list", "task-1")).toBe("list:task-1")
    expect(collectionFocusGateKey("grid", "task-1")).toBe("grid:task-1")

    const virtualizer = { scrollToIndex: vi.fn() }
    let gate = focusVirtualItemOnce(null, collectionFocusGateKey("list", "task-1"), 0, virtualizer, undefined)
    gate = focusVirtualItemOnce(gate, collectionFocusGateKey("grid", "task-1"), 0, virtualizer, undefined)
    expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(2)
  })

  it("1/2/6: read-only resource board groups usable kind values only and exposes no drag action", () => {
    const onMoveItem = vi.fn()
    const onExternalDrop = vi.fn()
    const items = [
      item("resource-tool", "resource", { title: "Tool", kind: "tool" }, "2026-07-08T10:00:00.000Z"),
      item("resource-space", "resource", { title: "Space", kind: "space" }, "2026-07-08T11:00:00.000Z"),
      item("resource-skill", "resource", { title: "Skill", kind: "skill" }, "2026-07-08T12:00:00.000Z"),
      item("resource-empty", "resource", { title: "Ohne Art", kind: "  " }),
      item("relation-1", "relation", { title: "Unsichtbare Kante", kind: "tool" }),
    ]

    const markup = renderToStaticMarkup(createElement(KanbanBoard, {
      items,
      statusField: "kind",
      readOnly: true,
      onMoveItem,
      onExternalDrop,
    }))

    expect(markup).toContain(">tool<")
    expect(markup).toContain(">space<")
    expect(markup).toContain(">skill<")
    expect(markup).toContain("Tool")
    expect(markup).toContain("Space")
    expect(markup).toContain("Skill")
    expect(markup).not.toContain("Ohne Art")
    expect(markup).not.toContain("Unsichtbare Kante")
    expect(markup).not.toContain("draggable")
    expect(markup.match(/data-preview-density="compact"/g)).toHaveLength(3)
    expect(onMoveItem).not.toHaveBeenCalled()
    expect(onExternalDrop).not.toHaveBeenCalled()
  })

  it("6: default statusField remains status and read-only cards sort by createdAt, title, id", () => {
    const defaultMarkup = renderToStaticMarkup(createElement(KanbanBoard, {
      items: [item("task-done", "task", { title: "Fertig", status: "done" })],
      readOnly: true,
    }))
    expect(defaultMarkup).toContain("Erledigt")
    expect(defaultMarkup).toContain("Fertig")

    const markup = renderToStaticMarkup(createElement(KanbanBoard, {
      items: [
        item("resource-z", "resource", { title: "Alpha", kind: "tool" }, "2026-07-08T11:00:00.000Z"),
        item("resource-b", "resource", { title: "Alpha", kind: "tool" }, "2026-07-08T11:00:00.000Z"),
        item("resource-a", "resource", { title: "Zulu", kind: "tool" }, "2026-07-08T10:00:00.000Z"),
      ],
      statusField: "kind",
      readOnly: true,
    }))

    expect(markup.indexOf("Zulu")).toBeLessThan(markup.indexOf("Alpha"))
    const firstAlpha = markup.indexOf("Alpha")
    const secondAlpha = markup.indexOf("Alpha", firstAlpha + 1)
    expect(firstAlpha).toBeGreaterThan(-1)
    expect(secondAlpha).toBeGreaterThan(firstAlpha)
    expect(markup.indexOf('data-item-id="resource-b"')).toBeLessThan(
      markup.indexOf('data-item-id="resource-z"'),
    )
  })

  it("2: Board membership is field-based, excludes archived defaults and never includes relations", () => {
    const grouped = kanbanItemsByColumn([
      item("task-open", "task", { title: "Offen", status: "open" }),
      item("task-archived", "task", { title: "Archiviert", status: "archived" }),
      item("task-empty", "task", { title: "Kein Status" }),
      item("relation-open", "relation", { title: "Kante", status: "open" }),
    ], defaultColumns, "status", true)

    expect(grouped.get("open")?.map(({ id }) => id)).toEqual(["task-open"])
    expect(grouped.get("in-progress")).toEqual([])
    expect(grouped.get("done")).toEqual([])
  })

  it("8: List, Grid and Board pass the active item to ItemPreview with the default glow", () => {
    const items = [item("task-1", "task", { title: "Aktive Aufgabe", status: "open" })]
    const listMarkup = renderToStaticMarkup(createElement(ListView, { items, activeItemId: "task-1" }))
    const gridMarkup = renderToStaticMarkup(createElement(GridView, { items, activeItemId: "task-1" }))
    const boardMarkup = renderToStaticMarkup(createElement(KanbanBoard, {
      items,
      activeItemId: "task-1",
      readOnly: true,
    }))

    for (const markup of [listMarkup, gridMarkup, boardMarkup]) {
      expect(markup).toContain('data-active-preview="true"')
      expect(markup).toContain("box-shadow:")
      expect(markup).toContain("#64748b")
    }
  })

  it("8: selection focus gates contiguous rendered selections and re-arms after a missing target", () => {
    const scrollIntoView = vi.fn()
    const target = { scrollIntoView }
    const focus = (element: typeof target) => element.scrollIntoView({ block: "center" })

    let gate = focusActiveItemOnce(null, "task-1", null, focus)
    expect(gate).toBeNull()
    expect(scrollIntoView).not.toHaveBeenCalled()

    gate = focusActiveItemOnce(gate, "task-1", target, focus)
    expect(gate).toBe("task-1")
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "center" })

    gate = focusActiveItemOnce(gate, "task-1", target, focus)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    gate = focusActiveItemOnce(gate, "task-2", target, focus)
    expect(gate).toBe("task-2")
    expect(scrollIntoView).toHaveBeenCalledTimes(2)

    gate = focusActiveItemOnce(gate, "person-3", null, focus)
    expect(gate).toBeNull()
    gate = focusActiveItemOnce(gate, "task-1", target, focus)
    expect(gate).toBe("task-1")
    expect(scrollIntoView).toHaveBeenCalledTimes(3)

    expect(focusActiveItemOnce(gate, null, target, focus)).toBeNull()
  })

  it("8: common visible-area focus forwards the drawer inset and virtual scroll lenses reserve it", () => {
    const target = { id: "task-1" }
    const focus = vi.fn()
    expect(focusActiveItemInVisibleAreaOnce(null, "task-1", target, { bottomInset: 440 }, focus)).toBe("task-1")
    expect(focus).toHaveBeenCalledWith(target, { bottomInset: 440 })
    expect(selectionFocusScrollMarginBlockEnd({ bottomInset: 440 })).toBe("440px")
    expect(drawerHeightFromY(45, 800)).toBe(440)

    const virtualizer = { scrollToIndex: vi.fn(), scrollBy: vi.fn() }
    let gate = focusVirtualItemOnce(null, "task-1", 23, virtualizer, { bottomInset: 440 })
    expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(23, { align: "center" })
    expect(virtualizer.scrollBy).toHaveBeenCalledWith(220)
    gate = focusVirtualItemOnce(gate, "task-1", 23, virtualizer, { bottomInset: 440 })
    expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(1)
    expect(focusVirtualItemOnce(gate, "task-2", undefined, virtualizer, undefined)).toBeNull()
  })
})

describe("Map and Calendar lenses", () => {
  it("1/2: MapLens only derives schema-valid non-relation GeoJSON Points", () => {
    const markers = mapLensMarkers([
      item("place-1", "place", { title: "P2P Portal", position: { type: "Point", coordinates: [12.406579, 52.117986] } }),
      item("place-elevation", "place", { title: "Turm", position: { type: "Point", coordinates: [12.4, 52.1, 38] } }),
      item("event-1", "event", { title: "Ohne Position", start: "2026-07-08T19:15:00+02:00" }),
      item("line-1", "place", { title: "Linie", position: { type: "LineString", coordinates: [[12.4, 52.1], [12.5, 52.2]] } }),
      item("invalid-1", "place", { title: "Ungültig", position: { type: "Point", coordinates: ["12.4", 52.1] } }),
      item("invalid-elevation", "place", { title: "Ungültige Höhe", position: { type: "Point", coordinates: [12.4, 52.1, "oops"] } }),
      item("invalid-four-coordinates", "place", { title: "Zu viele Werte", position: { type: "Point", coordinates: [12.4, 52.1, 38, 99] } }),
      item("nan-1", "place", { title: "NaN", position: { type: "Point", coordinates: [Number.NaN, 52.1] } }),
      item("infinity-1", "place", { title: "Unendlich", position: { type: "Point", coordinates: [12.4, Number.POSITIVE_INFINITY] } }),
      item("latitude-1", "place", { title: "Zu weit nördlich", position: { type: "Point", coordinates: [12.4, 91] } }),
      item("longitude-1", "place", { title: "Zu weit östlich", position: { type: "Point", coordinates: [181, 52.1] } }),
      item("relation-1", "relation", { title: "Unsichtbare Kante", position: { type: "Point", coordinates: [12.4, 52.1] } }),
    ], "place-1")

    expect(markers).toHaveLength(2)
    expect(markers[0]).toMatchObject({
      id: "place-1",
      position: [12.406579, 52.117986],
      selected: true,
    })
    expect(markers[1]).toMatchObject({ id: "place-elevation", position: [12.4, 52.1] })
  })

  it("7: MapLens auto-fit honours 0/1/N markers and only reports a successful viewport action", () => {
    const adapter = mapAdapter()
    const one: MapMarkerSpec[] = [{ id: "place-1", position: [12.4, 52.1] }]
    const many: MapMarkerSpec[] = [
      { id: "place-1", position: [12.4, 52.1] },
      { id: "place-2", position: [12.6, 52.3] },
    ]

    expect(fitMapLensViewport(adapter, [])).toBe(false)
    expect(adapter.setView).not.toHaveBeenCalled()
    expect(adapter.fitBounds).not.toHaveBeenCalled()

    expect(fitMapLensViewport(adapter, one)).toBe(true)
    expect(adapter.setView).toHaveBeenLastCalledWith({ center: [12.4, 52.1], zoom: SINGLE_MARKER_ZOOM })

    expect(fitMapLensViewport(adapter, many)).toBe(true)
    expect(adapter.fitBounds).toHaveBeenLastCalledWith({ west: 12.4, south: 52.1, east: 12.6, north: 52.3 })
  })

  it("7/8: a selected marker re-centres for a changed live drawer inset and takes precedence over aggregate auto-fit", () => {
    const adapter = mapAdapter()
    const markers: MapMarkerSpec[] = [
      { id: "place-1", position: [12.4, 52.1] },
      { id: "place-2", position: [12.6, 52.3] },
    ]

    let state = updateMapLensViewport(adapter, initialMapLensViewportState(), "place-1", markers, { bottomInset: 440 })
    expect(adapter.focusOn).toHaveBeenCalledWith([12.4, 52.1], { animate: false, bottomInset: 440 })
    expect(adapter.fitBounds).not.toHaveBeenCalled()
    expect(state).toEqual({ selectionFocus: { itemId: "place-1", bottomInset: 440 }, autoFitted: false })

    state = updateMapLensViewport(adapter, state, "place-1", markers, { bottomInset: 440 })
    expect(adapter.focusOn).toHaveBeenCalledTimes(1)
    expect(adapter.fitBounds).not.toHaveBeenCalled()

    state = updateMapLensViewport(adapter, state, "place-1", markers, { bottomInset: 640 })
    expect(adapter.focusOn).toHaveBeenLastCalledWith([12.4, 52.1], { animate: false, bottomInset: 640 })

    state = updateMapLensViewport(adapter, state, undefined, markers, { bottomInset: 640 })
    expect(state.autoFitted).toBe(true)
    expect(adapter.fitBounds).toHaveBeenCalledTimes(1)
  })

  it("7: adapter replacement and a new space context re-arm map focus and auto-fit gates", () => {
    const markers: MapMarkerSpec[] = [
      { id: "place-1", position: [12.4, 52.1] },
      { id: "place-2", position: [12.6, 52.3] },
    ]
    const firstAdapter = mapAdapter()
    const secondAdapter = mapAdapter()

    const focused = updateMapLensViewport(firstAdapter, initialMapLensViewportState(), "place-1", markers)
    expect(focused).toEqual({ selectionFocus: { itemId: "place-1", bottomInset: 0 }, autoFitted: false })
    const replacementState = mapLensViewportStateForAdapter(firstAdapter, secondAdapter, focused)
    expect(replacementState).toEqual(initialMapLensViewportState())
    updateMapLensViewport(
      secondAdapter,
      replacementState,
      "place-1",
      markers,
    )
    expect(secondAdapter.focusOn).toHaveBeenCalledTimes(1)

    const thirdAdapter = mapAdapter()
    const newSpaceState = initialMapLensViewportState()
    updateMapLensViewport(
      thirdAdapter,
      newSpaceState,
      undefined,
      markers,
    )
    expect(thirdAdapter.fitBounds).toHaveBeenCalledTimes(1)
  })

  it("7: a reset key fits immediately when its render already contains a fresh marker inventory", () => {
    const adapter = mapAdapter()
    const markers: MapMarkerSpec[] = [
      { id: "place-1", position: [12.4, 52.1] },
      { id: "place-2", position: [12.6, 52.3] },
    ]
    let context = initialMapLensViewportContext()

    context = updateMapLensViewportForResetKey(adapter, context, "space-a", undefined, markers)
    expect(adapter.fitBounds).toHaveBeenCalledTimes(1)

    context = updateMapLensViewportForResetKey(adapter, context, "space-a", undefined, markers)
    expect(adapter.fitBounds).toHaveBeenCalledTimes(1)

    const nextMarkers: MapMarkerSpec[] = [
      { id: "place-3", position: [13.4, 53.1] },
      { id: "place-4", position: [13.6, 53.3] },
    ]
    context = updateMapLensViewportForResetKey(adapter, context, "space-b", undefined, nextMarkers)
    expect(adapter.fitBounds).toHaveBeenCalledTimes(2)
  })

  it("7: a reset key waits for a fresh non-empty marker inventory before fitting", () => {
    const adapter = mapAdapter()
    const markersA: MapMarkerSpec[] = [
      { id: "place-a1", position: [12.4, 52.1] },
      { id: "place-a2", position: [12.6, 52.3] },
    ]
    const markersB: MapMarkerSpec[] = [
      { id: "place-b1", position: [13.4, 53.1] },
      { id: "place-b2", position: [13.6, 53.3] },
    ]
    let context = initialMapLensViewportContext()

    context = updateMapLensViewportForResetKey(adapter, context, "space-a", undefined, markersA)
    context = updateMapLensViewportForResetKey(adapter, context, "space-b", undefined, markersA)
    expect(adapter.fitBounds).toHaveBeenCalledTimes(1)
    expect(context.awaitingFreshMarkers).toBe(true)

    context = updateMapLensViewportForResetKey(adapter, context, "space-b", undefined, markersB)
    expect(adapter.fitBounds).toHaveBeenCalledTimes(2)
    expect(adapter.fitBounds).toHaveBeenLastCalledWith({ west: 13.4, south: 53.1, east: 13.6, north: 53.3 })
    expect(context.awaitingFreshMarkers).toBe(false)
  })

  it("7: MapLens forwards container resizes to the adapter resize contract", () => {
    const adapter = { ...mapAdapter(), resize: vi.fn() }
    let callback: ResizeObserverCallback | undefined
    const observer = { observe: vi.fn(), disconnect: vi.fn() }
    class TestResizeObserver {
      constructor(nextCallback: ResizeObserverCallback) { callback = nextCallback }
      observe = observer.observe
      disconnect = observer.disconnect
    }
    const cleanup = observeMapLensContainerResize({} as Element, adapter, TestResizeObserver)
    callback?.([], {} as ResizeObserver)
    expect(observer.observe).toHaveBeenCalledTimes(1)
    expect(adapter.resize).toHaveBeenCalledTimes(1)
    cleanup()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })

  it("7: StrictMode cleanup leaves exactly one mounted map adapter", async () => {
    let resolveFirstMount!: () => void
    let resolveSecondMount!: () => void
    const firstMounted = new Promise<void>((resolve) => { resolveFirstMount = resolve })
    const secondMounted = new Promise<void>((resolve) => { resolveSecondMount = resolve })
    let created = 0
    let liveMaps = 0
    const createAdapter = (): MapAdapter => {
      const mount = created++ === 0 ? firstMounted : secondMounted
      return {
        mount: async () => {
          await mount
          liveMaps += 1
        },
        unmount: async () => { liveMaps -= 1 },
        setMarkers: () => undefined,
        setView: () => undefined,
        fitBounds: () => undefined,
        focusOn: () => undefined,
        getView: () => ({ center: [0, 0], zoom: 0, bounds: { west: 0, south: 0, east: 0, north: 0 } }),
        observeView: () => () => undefined,
        observeClicks: () => () => undefined,
        observeMarkerClicks: () => () => undefined,
      }
    }
    const outer = { appendChild: vi.fn() } as unknown as Pick<HTMLElement, "appendChild">
    const makeInner = () => ({ style: {}, remove: vi.fn() }) as unknown as HTMLElement
    const options = {
      outer,
      createInnerContainer: makeInner,
      createAdapter,
      initialView: { center: [12.4, 52.1] as [number, number], zoom: 12 },
      onMounted: () => undefined,
      onUnmounted: () => undefined,
    }

    const firstCleanup = mountMapLensAdapter(options)
    firstCleanup()
    const secondCleanup = mountMapLensAdapter(options)
    resolveFirstMount()
    await Promise.resolve()
    await Promise.resolve()
    resolveSecondMount()
    await Promise.resolve()
    await Promise.resolve()

    expect(created).toBe(2)
    expect(liveMaps).toBe(1)
    secondCleanup()
    await Promise.resolve()
    expect(liveMaps).toBe(0)
  })

  it("7: both concrete adapters translate fitBounds to their native coordinate order", () => {
    const bounds = { west: 12.4, south: 52.1, east: 12.6, north: 52.3 }
    const leafletMap = { fitBounds: vi.fn() }
    const mapLibreMap = { fitBounds: vi.fn() }
    const leaflet = new LeafletMapAdapter()
    const mapLibre = new MapLibreMapAdapter()
    ;(leaflet as unknown as { mapInstance: unknown }).mapInstance = leafletMap
    ;(mapLibre as unknown as { mapInstance: unknown }).mapInstance = mapLibreMap

    leaflet.fitBounds(bounds)
    mapLibre.fitBounds(bounds)

    expect(leafletMap.fitBounds).toHaveBeenCalledWith([[52.1, 12.4], [52.3, 12.6]])
    expect(mapLibreMap.fitBounds).toHaveBeenCalledWith([[12.4, 52.1], [12.6, 52.3]])
  })

  it("1/2/8: Calendar excludes relation records, projects parseable starts, and gates active focus", () => {
    const calendarItem = item("event-1", "event", { title: "Eröffnung", start: "2026-07-08T19:15:00+02:00" })
    const relationItem = item("relation-1", "relation", { title: "Unsichtbare Kante", start: "2026-07-08T20:00:00+02:00" })
    const invalidItem = item("event-invalid", "event", { title: "Unparsebar", start: "kein Datum" })
    const markup = renderToStaticMarkup(createElement(CalendarView, {
      events: [calendarItem, relationItem, invalidItem],
      initialDate: "2026-07-08T12:00:00+02:00",
      initialVisibleDate: "2026-07-08T12:00:00+02:00",
    }))

    expect(markup).toContain("Eröffnung")
    expect(markup).not.toContain("Unsichtbare Kante")
    expect(markup).not.toContain("Unparsebar")
    expect(calendarFilterItems([calendarItem, relationItem, invalidItem]).map(({ id }) => id)).toEqual(["event-1"])

    const target: CalendarFocusTarget = { item: calendarItem, start: new Date("2026-07-08T19:15:00+02:00") }
    const focus = vi.fn()
    let gate = focusCalendarItemOnce(null, "event-missing", [target], focus)
    expect(gate).toBeNull()
    gate = focusCalendarItemOnce(gate, "event-1", [target], focus)
    expect(gate).toBe("event-1")
    expect(focus).toHaveBeenCalledTimes(1)
    gate = focusCalendarItemOnce(gate, "event-1", [target], focus)
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it("8: an active month event behind +N is rendered and highlighted before its focus gate can settle", () => {
    const events = ["event-1", "event-2", "event-3", "event-4"].map((id, index) => item(id, "event", {
      title: `Termin ${index + 1}`,
      start: `2026-07-08T${String(10 + index).padStart(2, "0")}:00:00+02:00`,
    }))
    const markup = renderToStaticMarkup(createElement(CalendarView, {
      events,
      initialDate: "2026-07-08T12:00:00+02:00",
      initialVisibleDate: "2026-07-08T12:00:00+02:00",
      activeItemId: "event-4",
    }))

    expect(prioritizeActiveEvent([], "event-4", 2)).toEqual([])
    expect(markup).toContain("Termin 4")
    expect(markup).toContain('aria-current="true"')
  })

  it("compact BottomNav keeps every destination reachable through its existing overflow menu", () => {
    const items = [
      { id: "graph", label: "Graph", icon: List },
      { id: "list", label: "Liste", icon: List },
      { id: "grid", label: "Raster", icon: Grid2X2 },
      { id: "board", label: "Board", icon: User },
      { id: "map", label: "Karte", icon: Map },
      { id: "calendar", label: "Kalender", icon: Calendar },
    ]
    const navigation = bottomNavItems(items, "graph")
    expect([...navigation.visibleItems, ...navigation.overflowItems].map(({ id }) => id).sort())
      .toEqual(items.map(({ id }) => id).sort())
    expect(navigation.overflowItems.map(({ id }) => id)).toEqual(["map", "calendar"])
  })

  it("Calendar initialVisibleDate opens the requested period without replacing initialDate's today value", () => {
    const markup = renderToStaticMarkup(createElement(CalendarView, {
      events: [],
      initialDate: "2025-01-15T12:00:00+01:00",
      initialVisibleDate: "2026-07-08T12:00:00+02:00",
    }))

    expect(markup).toContain("Juli 2026")
  })
})
