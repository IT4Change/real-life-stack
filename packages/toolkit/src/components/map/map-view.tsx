import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Item } from "@real-life-stack/data-interface"
import { Calendar, Globe, Loader2, MapPin, Search } from "lucide-react"

import { latLngFromPoint } from "../../lib/geo"
import { emptyFilterBarValue, FilterBar, type FilterBarValue, type FilterTypeOption } from "../filter"
import { CreateFab } from "../create-fab"
import { Button, Input } from "../primitives"
import { MapLens } from "../lens/map-lens"
import type { SelectionFocusVisibleArea } from "../../lib/selection-focus"
import { getSpacePrimaryColor } from "../../lib/utils"
import { hasGlobe, type MapAdapter, type MapMountOptions, type MapProjection } from "./adapter"
import { useLocationPick } from "./location-pick"

const MAP_TYPES: FilterTypeOption[] = [
  { id: "event", label: "Events", icon: Calendar },
  { id: "place", label: "Orte", icon: MapPin },
]
const PICK_MARKER_ID = "__rls_pick__"
const PICK_MARKER_COLOR = "#ef4444"
const MAP_SHEET_FRACTION = .55
const MIN_REVEAL_ZOOM = 10
const REVEAL_SEPARATION_PX = 64
const MERCATOR_TILE_SIZE = 512
const EARTH_CIRCUMFERENCE_M = 40075016.686

export type MapViewportMode = "lens-auto-fit" | "bbox-module"
export interface MapViewProps {
  items: readonly Item[]
  itemsLoading: boolean
  inventoryKey: string | number
  focusedItem?: Item | null
  createAdapter: () => MapAdapter
  initialView: MapMountOptions
  viewportMode: MapViewportMode
  onViewportBoundsChange?: (bounds: [number, number, number, number]) => void
  active?: boolean
  activeItemId?: string
  selectionFocusVisibleArea?: SelectionFocusVisibleArea
  onItemClick?: (item: Item) => void
  /** The app passes this only when its connector is an ItemWriter. */
  allowCreate?: boolean
  onCreate?: () => void
  clustering?: false | { radius?: number }
  resolveGroupColor?: (item: Item) => string | undefined
  /** Controlled projection configuration; omitted keeps the established Mercator default. */
  projection?: MapProjection
  onProjectionChange?: (projection: MapProjection) => void
  /** A shell-owned composer draft is shown as a non-clickable marker when positioned. */
  draftItem?: Item | null
  isCompact?: boolean
}

function inBounds(item: Item, bounds: [number, number, number, number]) {
  const point = latLngFromPoint(item.data.position)
  if (!point) return false
  const [west, south, east, north] = bounds
  return point.lat >= south && point.lat <= north && (west <= east ? point.lng >= west && point.lng <= east : point.lng >= west || point.lng <= east)
}

/** Reconcile a newly loaded bbox page without losing markers from earlier views. */
export function reconcileMapInventory(
  previous: ReadonlyMap<string, Item>,
  items: readonly Item[],
  itemsLoading: boolean,
  bounds: [number, number, number, number] | null,
): Map<string, Item> {
  const next = new Map(previous)
  if (bounds && !itemsLoading) {
    const ids = new Set(items.map(({ id }) => id))
    for (const [id, item] of next) if (!ids.has(id) && inBounds(item, bounds)) next.delete(id)
  }
  for (const item of items) next.set(item.id, item)
  return next
}

/** The draft is a display-only overlay and never becomes part of the bbox inventory. */
export function mapViewMarkerItems(items: readonly Item[], draftItem: Item | null | undefined, isPicking: boolean): Item[] {
  if (isPicking || !draftItem || !latLngFromPoint(draftItem.data.position)) return [...items]
  return [...items.filter((item) => item.id !== draftItem.id), draftItem]
}

/** The actual module gate; app-side capability detection only decides whether it passes a callback. */
export function mapViewCanCreate(allowCreate: boolean | undefined, onCreate: (() => void) | undefined): boolean {
  return allowCreate === true && onCreate != null
}

/** Debounced bbox reporting is module behaviour; the shell merely owns the query. */
export function observeMapViewBounds(
  adapter: MapAdapter,
  onBounds: (bounds: [number, number, number, number]) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const report = () => {
    const value = adapter.getView().bounds
    onBounds([value.west, value.south, value.east, value.north])
  }
  report()
  const unsubscribe = adapter.observeView(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(report, 250)
  })
  return () => { if (timer) clearTimeout(timer); unsubscribe() }
}

export function toggleMapViewProjection(adapter: MapAdapter | null, projection: MapProjection): MapProjection {
  const next = projection === "globe" ? "mercator" : "globe"
  if (next === "globe" && adapter && adapter.getView().zoom > 2) adapter.setView({ zoom: 1 })
  return next
}

function metersBetween(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const lat1 = (aLat * Math.PI) / 180
  const lat2 = (bLat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The zoom required to separate an external target from its nearest fresh bbox neighbour. */
export function mapViewSeparationZoom(item: Item, others: readonly Item[]): number {
  const point = latLngFromPoint(item.data.position)
  if (!point) return MIN_REVEAL_ZOOM
  let nearest = Infinity
  for (const other of others) {
    if (other.id === item.id) continue
    const candidate = latLngFromPoint(other.data.position)
    if (!candidate) continue
    nearest = Math.min(nearest, metersBetween(point.lng, point.lat, candidate.lng, candidate.lat))
  }
  if (!Number.isFinite(nearest)) return MIN_REVEAL_ZOOM
  return Math.max(MIN_REVEAL_ZOOM, Math.log2(
    (REVEAL_SEPARATION_PX * EARTH_CIRCUMFERENCE_M * Math.cos((point.lat * Math.PI) / 180)) /
      (Math.max(nearest, .1) * MERCATOR_TILE_SIZE),
  ))
}

/** One pick transition is shared by bare-map and existing-marker clicks. */
export function applyMapViewPick(
  position: { lat: number; lng: number },
  isCompact: boolean,
  updatePick: (position: { lat: number; lng: number }) => void,
  setPickPosition: (position: { lat: number; lng: number }) => void,
  confirmPick: () => void,
): void {
  updatePick(position)
  setPickPosition(position)
  if (!isCompact) confirmPick()
}

/** FilterBar and text-search own the same marker input as the rendered module. */
export function filterMapViewItems(items: readonly Item[], filter: FilterBarValue, search: string): Item[] {
  const needle = search.trim().toLowerCase()
  return items.filter((item) => {
    if (item.type === "relation" || !latLngFromPoint(item.data.position)) return false
    if (filter.types?.length && !filter.types.includes(item.type)) return false
    if (filter.tags?.length && !filter.tags.every((tag) => item.tags?.includes(tag))) return false
    return !needle || [item.data.title, item.data.description, item.data.content]
      .some((value) => String(value ?? "").toLowerCase().includes(needle))
  })
}

export function mapViewRevealOptions(fromMarkerClick: boolean, isCompact: boolean) {
  return { animate: !fromMarkerClick, ...(isCompact ? { bottomInset: window.innerHeight * MAP_SHEET_FRACTION } : {}) }
}

/** Full Map module: filter/create/bbox behaviour around the filterless MapLens core. */
export function MapView({
  items, itemsLoading, inventoryKey, focusedItem, createAdapter, initialView, viewportMode,
  onViewportBoundsChange, active = true, activeItemId, selectionFocusVisibleArea, onItemClick,
  allowCreate, onCreate, clustering = false, resolveGroupColor, projection: projectionProp,
  onProjectionChange, draftItem, isCompact = false,
}: MapViewProps) {
  const [adapter, setAdapter] = useState<MapAdapter | null>(null)
  const [mountError, setMountError] = useState(false)
  const [mountAttempt, setMountAttempt] = useState(0)
  const [filter, setFilter] = useState<FilterBarValue>(emptyFilterBarValue)
  const [search, setSearch] = useState("")
  const [uncontrolledProjection, setUncontrolledProjection] = useState<MapProjection>("mercator")
  const projection = projectionProp ?? uncontrolledProjection
  const [pickPosition, setPickPosition] = useState<{ lat: number; lng: number } | null>(null)
  const { isPicking, updatePick, confirmPick, cancelPick } = useLocationPick()
  const accumulated = useRef(new Map<string, Item>())
  const [inventory, setInventory] = useState<Item[]>([])
  const bounds = useRef<[number, number, number, number] | null>(null)
  const markerClick = useRef<string | null>(null)
  const settledReveal = useRef<string | null>(null)
  const approachedReveal = useRef<string | null>(null)

  useEffect(() => { accumulated.current = new Map(); setInventory([]); bounds.current = null }, [inventoryKey])
  useEffect(() => {
    const next = reconcileMapInventory(accumulated.current, items, itemsLoading, bounds.current)
    const changed = next.size !== accumulated.current.size || [...next].some(([id, item]) => accumulated.current.get(id) !== item)
    accumulated.current = next
    if (changed) setInventory([...next.values()])
  }, [items, itemsLoading])

  useEffect(() => {
    if (!adapter || viewportMode !== "bbox-module" || !onViewportBoundsChange) return
    return observeMapViewBounds(adapter, (nextBounds) => {
      bounds.current = nextBounds
      onViewportBoundsChange(nextBounds)
    })
  }, [adapter, onViewportBoundsChange, viewportMode])
  useEffect(() => { if (adapter && hasGlobe(adapter)) adapter.setProjection(projection) }, [adapter, projection])
  useEffect(() => {
    if (!active) { settledReveal.current = null; approachedReveal.current = null; return }
    if (!focusedItem) { settledReveal.current = null; approachedReveal.current = null; return }
    if (!adapter || viewportMode !== "bbox-module") return
    const point = latLngFromPoint(focusedItem.data.position)
    if (!point) return
    const bottomInset = isCompact ? window.innerHeight * MAP_SHEET_FRACTION : 0
    const fromClick = markerClick.current === focusedItem.id
    markerClick.current = null
    if (fromClick) {
      settledReveal.current = focusedItem.id
      approachedReveal.current = focusedItem.id
      if (bottomInset) adapter.focusOn([point.lng, point.lat], { bottomInset, animate: true })
      return
    }
    if (settledReveal.current === focusedItem.id) return
    if (items.some((item) => item.id === focusedItem.id)) {
      settledReveal.current = focusedItem.id
      adapter.focusOn([point.lng, point.lat], { zoom: Math.max(adapter.getView().zoom, mapViewSeparationZoom(focusedItem, items)), bottomInset, animate: true })
      return
    }
    if (bounds.current && inBounds(focusedItem, bounds.current)) return
    if (approachedReveal.current !== focusedItem.id && bounds.current && !itemsLoading) {
      approachedReveal.current = focusedItem.id
      adapter.focusOn([point.lng, point.lat], { zoom: Math.max(adapter.getView().zoom, MIN_REVEAL_ZOOM), bottomInset, animate: true })
    }
  }, [active, adapter, focusedItem, isCompact, items, itemsLoading, viewportMode])
  useEffect(() => {
    if (!adapter || !isPicking) return
    return adapter.observeClicks(({ position: [lng, lat] }) => {
      applyMapViewPick({ lat, lng }, isCompact, updatePick, setPickPosition, confirmPick)
    })
  }, [adapter, confirmPick, isCompact, isPicking, updatePick])
  useEffect(() => { if (!isPicking) setPickPosition(null) }, [isPicking])

  const filtered = useMemo(() => filterMapViewItems(inventory, filter, search), [filter, inventory, search])
  const availableTags = useMemo(() => [...new Set(inventory.flatMap((item) => item.tags ?? []))].sort(), [inventory])
  const markerItems = useMemo(() => mapViewMarkerItems(filtered, draftItem, isPicking), [draftItem, filtered, isPicking])
  const lensItems = useMemo(() => pickPosition && isPicking ? [...markerItems, {
    id: PICK_MARKER_ID, type: "__pick__", createdAt: "", createdBy: "", data: { position: { type: "Point", coordinates: [pickPosition.lng, pickPosition.lat] }, color: PICK_MARKER_COLOR },
  } as Item] : markerItems, [isPicking, markerItems, pickPosition])
  const canCreate = mapViewCanCreate(allowCreate, onCreate)
  const onAdapterChange = useCallback((next: MapAdapter | null) => { setAdapter(next); if (next) setMountError(false) }, [])
  const handleClick = useCallback((item: Item) => {
    if (item.id === PICK_MARKER_ID) return
    if (isPicking) {
      const position = latLngFromPoint(item.data.position)
      if (!position) return
      applyMapViewPick(position, isCompact, updatePick, setPickPosition, confirmPick)
      return
    }
    if (viewportMode === "bbox-module") markerClick.current = item.id
    onItemClick?.(item)
  }, [confirmPick, isCompact, isPicking, onItemClick, updatePick, viewportMode])
  const toggleProjection = useCallback(() => {
    const next = toggleMapViewProjection(adapter, projection)
    if (projectionProp === undefined) setUncontrolledProjection(next)
    onProjectionChange?.(next)
  }, [adapter, onProjectionChange, projection, projectionProp])
  const markerGroupColor = useCallback((item: Item) => item.id === PICK_MARKER_ID
    ? PICK_MARKER_COLOR
    : resolveGroupColor?.(item) ?? getSpacePrimaryColor("map"), [resolveGroupColor])

  return <div className="relative h-full w-full">
    <MapLens items={lensItems} createAdapter={createAdapter} initialView={initialView} activeItemId={activeItemId}
      selectionFocusVisibleArea={selectionFocusVisibleArea} viewportResetKey={inventoryKey} onItemClick={handleClick}
      clustering={clustering} resolveGroupColor={markerGroupColor} viewportMode={viewportMode} active={active} onAdapterChange={onAdapterChange}
      highlightedItemIds={draftItem && !isPicking ? [draftItem.id] : []}
      nonClickableItemIds={draftItem && !isPicking ? [draftItem.id] : []}
      containerClassName={projection === "globe" ? "rls-globe-sky" : undefined}
      mountKey={mountAttempt} onMountError={() => setMountError(true)} />
    {!adapter && <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-muted-foreground">{mountError ? <div className="flex flex-col items-center gap-3"><span>Karte konnte nicht geladen werden.</span><Button variant="outline" size="sm" onClick={() => { setMountError(false); setMountAttempt((value) => value + 1) }}>Erneut versuchen</Button></div> : <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Karte wird geladen…</>}</div>}
    {isPicking && <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-3"><div className="flex items-center gap-2 rounded-full border bg-background/95 px-3 py-2 text-sm shadow-md"><MapPin className="h-4 w-4" /><span>{pickPosition ? "Position gewählt." : "Tippe auf die Karte, um die Position zu setzen."}</span>{isCompact && pickPosition && <Button size="sm" onClick={confirmPick}>Übernehmen</Button>}<Button size="sm" variant="ghost" onClick={cancelPick}>Abbrechen</Button></div></div>}
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 py-4 pl-16 pr-4 **:pointer-events-auto"><FilterBar value={filter} onChange={setFilter} availableTags={availableTags} availableTypes={MAP_TYPES} className="[&_[data-slot=button][data-variant=outline]]:bg-background!" leadingActions={<div className="relative min-w-0 flex-1 sm:flex-none"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" /><Input aria-label="Karte durchsuchen" placeholder="Suche…" value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 w-full pl-7 text-xs bg-background! sm:w-40" /></div>} trailingActions={adapter && hasGlobe(adapter) && !isPicking ? <Button size="icon-sm" variant={projection === "globe" ? "default" : "outline"} aria-label="Globus wechseln" onClick={toggleProjection}><Globe className="h-4 w-4" /></Button> : undefined} /></div>
    {!isPicking && canCreate && <CreateFab onClick={onCreate!} label="Ort erstellen" />}
  </div>
}
