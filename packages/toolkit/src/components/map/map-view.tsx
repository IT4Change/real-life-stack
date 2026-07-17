import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Item } from "@real-life-stack/data-interface"
import { Calendar, Globe, Loader2, MapPin, Search } from "lucide-react"

import { latLngFromPoint } from "../../lib/geo"
import { emptyFilterBarValue, FilterBar, type FilterBarValue, type FilterTypeOption } from "../filter"
import { CreateFab } from "../create-fab"
import { Button, Input } from "../primitives"
import { MapLens } from "../lens/map-lens"
import type { SelectionFocusVisibleArea } from "../../lib/selection-focus"
import { getItemColor, getSpacePrimaryColor } from "../../lib/utils"
import { hasGlobe, type MapAdapter, type MapMountOptions, type MapProjection } from "./adapter"
import { useLocationPick } from "./location-pick"

const MAP_TYPES: FilterTypeOption[] = [
  { id: "event", label: "Events", icon: Calendar },
  { id: "place", label: "Orte", icon: MapPin },
]
const PICK_MARKER_ID = "__rls_pick__"
const PICK_MARKER_COLOR = "#ef4444"
const MAP_SHEET_FRACTION = .55

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
  isCompact?: boolean
}

function inBounds(item: Item, bounds: [number, number, number, number]) {
  const point = latLngFromPoint(item.data.position)
  if (!point) return false
  const [west, south, east, north] = bounds
  return point.lat >= south && point.lat <= north && (west <= east ? point.lng >= west && point.lng <= east : point.lng >= west || point.lng <= east)
}

/** Full Map module: filter/create/bbox behaviour around the filterless MapLens core. */
export function MapView({
  items, itemsLoading, inventoryKey, focusedItem, createAdapter, initialView, viewportMode,
  onViewportBoundsChange, active = true, activeItemId, selectionFocusVisibleArea, onItemClick,
  allowCreate, onCreate, clustering = false, resolveGroupColor, isCompact = false,
}: MapViewProps) {
  const [adapter, setAdapter] = useState<MapAdapter | null>(null)
  const [mountError, setMountError] = useState(false)
  const [mountAttempt, setMountAttempt] = useState(0)
  const [filter, setFilter] = useState<FilterBarValue>(emptyFilterBarValue)
  const [search, setSearch] = useState("")
  const [projection, setProjection] = useState<MapProjection>("mercator")
  const [pickPosition, setPickPosition] = useState<{ lat: number; lng: number } | null>(null)
  const { isPicking, updatePick, confirmPick, cancelPick } = useLocationPick()
  const accumulated = useRef(new Map<string, Item>())
  const [inventory, setInventory] = useState<Item[]>([])
  const bounds = useRef<[number, number, number, number] | null>(null)
  const markerClick = useRef<string | null>(null)

  useEffect(() => { accumulated.current = new Map(); setInventory([]); bounds.current = null }, [inventoryKey])
  useEffect(() => {
    const current = accumulated.current
    let changed = false
    if (bounds.current && !itemsLoading) {
      const ids = new Set(items.map(({ id }) => id))
      for (const [id, item] of current) if (!ids.has(id) && inBounds(item, bounds.current)) { current.delete(id); changed = true }
    }
    for (const item of items) if (current.get(item.id) !== item) { current.set(item.id, item); changed = true }
    if (changed) setInventory([...current.values()])
  }, [items, itemsLoading])

  useEffect(() => {
    if (!adapter || viewportMode !== "bbox-module" || !onViewportBoundsChange) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const report = () => {
      const value = adapter.getView().bounds
      bounds.current = [value.west, value.south, value.east, value.north]
      onViewportBoundsChange(bounds.current)
    }
    report()
    return adapter.observeView(() => { if (timer) clearTimeout(timer); timer = setTimeout(report, 250) })
  }, [adapter, onViewportBoundsChange, viewportMode])
  useEffect(() => { if (adapter && hasGlobe(adapter)) adapter.setProjection(projection) }, [adapter, projection])
  useEffect(() => {
    if (!adapter || viewportMode !== "bbox-module" || !active || !focusedItem) return
    const point = latLngFromPoint(focusedItem.data.position)
    if (!point) return
    const click = markerClick.current === focusedItem.id
    markerClick.current = null
    adapter.focusOn([point.lng, point.lat], {
      animate: !click,
      ...(isCompact ? { bottomInset: window.innerHeight * MAP_SHEET_FRACTION } : {}),
    })
  }, [active, adapter, focusedItem, isCompact, viewportMode])
  useEffect(() => {
    if (!adapter || !isPicking) return
    return adapter.observeClicks(({ position: [lng, lat] }) => {
      const position = { lat, lng }; updatePick(position); setPickPosition(position); if (!isCompact) confirmPick()
    })
  }, [adapter, confirmPick, isCompact, isPicking, updatePick])
  useEffect(() => { if (!isPicking) setPickPosition(null) }, [isPicking])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return inventory.filter((item) => {
      if (item.type === "relation") return false
      if (filter.types?.length && !filter.types.includes(item.type)) return false
      if (filter.tags?.length && !filter.tags.every((tag) => item.tags?.includes(tag))) return false
      return !needle || [item.data.title, item.data.description, item.data.content].some((value) => String(value ?? "").toLowerCase().includes(needle))
    })
  }, [filter, inventory, search])
  const availableTags = useMemo(() => [...new Set(inventory.flatMap((item) => item.tags ?? []))].sort(), [inventory])
  const lensItems = useMemo(() => pickPosition && isPicking ? [...filtered, {
    id: PICK_MARKER_ID, type: "__pick__", createdAt: "", createdBy: "", data: { position: { type: "Point", coordinates: [pickPosition.lng, pickPosition.lat] }, color: PICK_MARKER_COLOR },
  } as Item] : filtered, [filtered, isPicking, pickPosition])
  const canCreate = allowCreate === true && onCreate != null
  const onAdapterChange = useCallback((next: MapAdapter | null) => { setAdapter(next); if (next) setMountError(false) }, [])
  const handleClick = useCallback((item: Item) => {
    if (item.id === PICK_MARKER_ID) return
    if (viewportMode === "bbox-module") markerClick.current = item.id
    onItemClick?.(item)
  }, [onItemClick, viewportMode])
  const toggleProjection = useCallback(() => {
    const next = projection === "globe" ? "mercator" : "globe"
    if (next === "globe" && adapter && adapter.getView().zoom > 2) adapter.setView({ zoom: 1 })
    setProjection(next)
  }, [adapter, projection])
  const color = useCallback((item: Item) => item.id === PICK_MARKER_ID ? PICK_MARKER_COLOR : getItemColor(item, { groupColor: resolveGroupColor?.(item) ?? getSpacePrimaryColor("map") }), [resolveGroupColor])

  return <div className="relative h-full w-full">
    <MapLens items={lensItems} createAdapter={createAdapter} initialView={initialView} activeItemId={activeItemId}
      selectionFocusVisibleArea={selectionFocusVisibleArea} viewportResetKey={inventoryKey} onItemClick={handleClick}
      clustering={clustering} resolveGroupColor={color} viewportMode={viewportMode} active={active} onAdapterChange={onAdapterChange}
      mountKey={mountAttempt} onMountError={() => setMountError(true)} />
    {!adapter && <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-muted-foreground">{mountError ? <div className="flex flex-col items-center gap-3"><span>Karte konnte nicht geladen werden.</span><Button variant="outline" size="sm" onClick={() => { setMountError(false); setMountAttempt((value) => value + 1) }}>Erneut versuchen</Button></div> : <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Karte wird geladen…</>}</div>}
    {isPicking && <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-3"><div className="flex items-center gap-2 rounded-full border bg-background/95 px-3 py-2 text-sm shadow-md"><MapPin className="h-4 w-4" /><span>{pickPosition ? "Position gewählt." : "Tippe auf die Karte, um die Position zu setzen."}</span>{isCompact && pickPosition && <Button size="sm" onClick={confirmPick}>Übernehmen</Button>}<Button size="sm" variant="ghost" onClick={cancelPick}>Abbrechen</Button></div></div>}
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 py-4 pl-16 pr-4 **:pointer-events-auto"><FilterBar value={filter} onChange={setFilter} availableTags={availableTags} availableTypes={MAP_TYPES} className="[&_[data-slot=button][data-variant=outline]]:bg-background!" leadingActions={<div className="relative min-w-0 flex-1 sm:flex-none"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" /><Input aria-label="Karte durchsuchen" placeholder="Suche…" value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 w-full pl-7 text-xs bg-background! sm:w-40" /></div>} trailingActions={adapter && hasGlobe(adapter) && !isPicking ? <Button size="icon-sm" variant={projection === "globe" ? "default" : "outline"} aria-label="Globus wechseln" onClick={toggleProjection}><Globe className="h-4 w-4" /></Button> : undefined} /></div>
    {!isPicking && canCreate && <CreateFab onClick={onCreate} label="Ort erstellen" />}
  </div>
}
