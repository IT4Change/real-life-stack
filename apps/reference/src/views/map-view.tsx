import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import {
  useItems,
  useMembers,
  useCurrentUser,
  useModulePanel,
  useIsCompact,
  type ContentTypeConfig,
  ItemDetailPanel,
  ItemPreview,
  ItemTypeBadge,
  ItemMetaRow,
  ReactionBar,
  CreateFab,
  FilterBar,
  emptyFilterBarValue,
  useFilterableItems,
  type ItemEditorMapper,
  getItemColor,
  useItemGroupColorResolver,
  Button,
  Input,
  type FilterBarValue,
  type FilterTypeOption,
  type MapMarkerSpec,
} from "@real-life-stack/toolkit"
import { MapLibreMapAdapter } from "@real-life-stack/toolkit/maplibre"
import { Calendar, MapPin, Search } from "lucide-react"
import type { Item, User } from "@real-life-stack/data-interface"
import { useComposerHost } from "../composer-host"
import { useLocationPick } from "../location-pick"

const MAP_TYPES: FilterTypeOption[] = [
  { id: "event", label: "Events", icon: Calendar },
  { id: "place", label: "Orte", icon: MapPin },
]

// Provisional location-pick marker (visually distinct from item markers).
const PICK_MARKER_ID = "__rls_pick__"
const PICK_MARKER_COLOR = "#ef4444"

/**
 * Map module — vector version using the MapLibreMapAdapter from toolkit.
 *
 * Shows every item in the current space that has `data.position` (GeoJSON
 * Point). This is the cross-module case: a workshop with `type=event` and a
 * `position` appears on both the calendar and the map.
 *
 * Marker click opens the same AdaptivePanel + ItemDetailPanel + ItemPreview
 * stack that Feed / Kanban / Calendar use. A map popup with the ItemPreview
 * inline (and detail-open as a secondary action) is the obvious alternative —
 * UX discussion is open, see `docs/spec/modules/map.md` § Offene Punkte.
 */
/** Mobile detail sheet height as a fraction of the viewport — mirrors the
 *  AdaptivePanel drawer default (`drawerInitialHeight`), so we can pan a tapped
 *  marker into the strip of map left visible above the sheet. */
const MAP_SHEET_FRACTION = 0.55

export function MapView({ groupId, active = true }: { groupId: string; active?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Adapter lives in state so the markers-effect re-runs once `mount()` has
  // actually resolved. With the lazy-loaded map library, `mount()` is
  // genuinely async, and the StrictMode double-mount race is too tight for
  // refs alone.
  const [adapter, setAdapter] = useState<MapLibreMapAdapter | null>(null)
  // Field-presence filter (spec 06): any item with data.position is
  // map-renderable, regardless of `type`. The Point/coordinates check
  // below is still defensive validation, not the activation criterion.
  const { data: items } = useItems({ hasField: ["position"] })
  // Cross-space aggregate ("Mein Netzwerk"): useMembers(null) yields
  // the union of all known members, so authors of map items pulled
  // in from other spaces still resolve to their User.
  const { data: members } = useMembers(groupId === "__overview__" ? null : groupId)
  const { data: currentUser } = useCurrentUser()
  // Marker colour falls back to the colour of the group an item was *created* in
  // (origin group) — so the aggregate ("Mein Netzwerk") view shows each marker in
  // its origin group's colour. Shared resolver, also used for the active glow.
  const resolveItemGroupColor = useItemGroupColorResolver(
    groupId === "__overview__" ? undefined : groupId,
  )

  const modulePanel = useModulePanel()
  const [filterBarValue, setFilterBarValue] = useState<FilterBarValue>(emptyFilterBarValue)
  const [searchText, setSearchText] = useState("")
  const itemsAfterBar = useFilterableItems(items, filterBarValue)
  const filteredItems = useMemo(() => {
    const needle = searchText.trim().toLowerCase()
    if (!needle) return itemsAfterBar
    return itemsAfterBar.filter((item) => {
      const haystack = [item.data.title, item.data.description, item.data.content]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ")
      return haystack.includes(needle)
    })
  }, [itemsAfterBar, searchText])
  const availableTags = useMemo(() => {
    const seen = new Set<string>()
    for (const item of items) for (const tag of item.tags ?? []) seen.add(tag)
    return Array.from(seen).sort()
  }, [items])

  const mapContentTypes: ContentTypeConfig[] = useMemo(() => [
    {
      id: "place",
      label: "Ort",
      defaultWidgets: ["title", "text", "location"],
      submitLabel: "Erstellen",
    },
    {
      id: "event",
      label: "Veranstaltung",
      defaultWidgets: ["title", "text", "date", "location"],
      submitLabel: "Erstellen",
    },
  ], [])

  const mapSubmission = useCallback<ItemEditorMapper>((submission) => {
    const { text, tags: submittedTags, ...rest } = submission.data
    const cleaned = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => {
        if (v === "" || v === null || v === undefined) return false
        if (Array.isArray(v) && v.length === 0) return false
        return true
      }),
    )
    const itemData = { ...cleaned, ...(text ? { description: text } : {}) }
    const tags = Array.isArray(submittedTags) && submittedTags.length > 0 ? submittedTags : undefined
    return {
      type: submission.contentType,
      data: itemData,
      ...(tags ? { tags } : {}),
    }
  }, [])

  const { openComposer: openCreateComposer } = useComposerHost()
  const { isPicking, updatePick, confirmPick, cancelPick } = useLocationPick()
  const [pickPos, setPickPos] = useState<{ lat: number; lng: number } | null>(null)
  // "Fertig" (return the composer) is only needed when the composer is hidden,
  // i.e. as a drawer on compact screens. On desktop the sidebar stays visible.
  const isCompact = useIsCompact()

  // Id of the item open in the shared panel → its marker is highlighted.
  const activeItemId = modulePanel.current?.itemId

  // Build the markers and an id → item lookup in one pass — marker
  // clicks come back with just the id, and we need the full item to
  // open the detail panel.
  const { markers, itemsById } = useMemo(() => {
    const markerList: MapMarkerSpec[] = []
    const byId = new Map<string, Item>()
    for (const item of filteredItems) {
      const pos = item.data.position as { type?: string; coordinates?: number[] } | undefined
      if (!pos || pos.type !== "Point" || !Array.isArray(pos.coordinates) || pos.coordinates.length < 2) continue
      const [lng, lat] = pos.coordinates
      if (typeof lng !== "number" || typeof lat !== "number") continue
      const firstTag = item.tags?.[0]
      markerList.push({
        id: item.id,
        position: [lng, lat],
        label: typeof item.data.title === "string" ? item.data.title : item.id,
        color: getItemColor(item, { groupColor: resolveItemGroupColor(item) }),
        // Glyph: an explicit item icon, else the first tag's name (which resolves
        // to a curated icon when it matches, e.g. "cafe"); unknown → a dot.
        icon: (item.data.icon as string | undefined) ?? firstTag,
        // Highlight the marker whose item is open in the shared panel — a soft
        // glow in the item's origin-group colour (analogous to the cards).
        selected: item.id === activeItemId,
        glowColor: resolveItemGroupColor(item),
      })
      byId.set(item.id, item)
    }
    return { markers: markerList, itemsById: byId }
  }, [filteredItems, resolveItemGroupColor, activeItemId])

  // Mount the adapter once. The lazy-loaded map library means mount() is
  // properly async, which exposes a classic StrictMode race: both effect
  // passes start their own mount() in parallel and would race for the same
  // DOM container.
  //
  // Robust fix: each effect run gets its own fresh inner div as the map's
  // container, appended to the stable outer ref. On cleanup we tear down the
  // adapter and remove the inner div, so the second pass gets a pristine
  // container that no previous mount can have claimed.
  useEffect(() => {
    if (!containerRef.current) return
    const inner = document.createElement("div")
    inner.style.height = "100%"
    inner.style.width = "100%"
    containerRef.current.appendChild(inner)

    let cancelled = false
    let mounted = false
    const ad = new MapLibreMapAdapter()
    ad.mount(inner, {
      center: [13.4, 52.5], // Berlin-ish default; replace with space config later
      zoom: 6,
    }).then(
      () => {
        if (cancelled) {
          ad.unmount().catch(() => {})
        } else {
          mounted = true
          setAdapter(ad)
        }
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error("MapLibreMapAdapter mount failed", err)
      },
    )
    return () => {
      cancelled = true
      if (mounted) {
        ad.unmount().catch(() => {})
        setAdapter((current) => (current === ad ? null : current))
      }
      inner.remove()
    }
  }, [])

  // Kept-alive map: when this view is revealed again (its host toggles back from
  // `display:none`), the container regained its size — recompute so the map fills
  // it instead of staying at its last-hidden (often 0) dimensions.
  useEffect(() => {
    if (active && adapter) adapter.resize?.()
  }, [active, adapter])

  // Push markers to the adapter once it is mounted, and on every change.
  useEffect(() => {
    if (!adapter) return
    const provisional: MapMarkerSpec[] =
      isPicking && pickPos
        ? [{ id: PICK_MARKER_ID, position: [pickPos.lng, pickPos.lat], color: PICK_MARKER_COLOR }]
        : []
    adapter.setMarkers([...markers, ...provisional])
  }, [adapter, markers, isPicking, pickPos])

  const resolveAuthor = useCallback(
    (createdBy: string): User | undefined => {
      const member = members.find((m) => m.id === createdBy)
      if (member) return member
      if (currentUser?.id === createdBy) return currentUser
      return undefined
    },
    [members, currentUser],
  )

  const openDetail = useCallback((item: Item) => {
    modulePanel.open({
      kind: "detail",
      itemId: item.id,
      // No dimming backdrop on the map — the map below stays visible and pannable.
      backdrop: false,
      content: (
        <ItemDetailPanel
          itemId={item.id}
          renderCommentReactions={(commentId) => <ReactionBar itemId={commentId} />}
        >
          <div className="p-4">
            <ItemPreview
              item={item}
              author={resolveAuthor(item.createdBy)}
              headerAdornment={<ItemTypeBadge type={item.type} />}
              metaAdornment={<ItemMetaRow item={item} />}
              footerAdornment={
                item.type !== "task" ? <ReactionBar itemId={item.id} /> : undefined
              }
            />
          </div>
        </ItemDetailPanel>
      ),
    })
    // On mobile the detail sheet slides up over the lower part of the map. Pan
    // so the tapped marker stays visible, centred in the strip above the sheet.
    if (isCompact && adapter) {
      const pos = item.data.position as { coordinates?: number[] } | undefined
      const coords = pos?.coordinates
      if (coords && typeof coords[0] === "number" && typeof coords[1] === "number") {
        adapter.focusOn([coords[0], coords[1]], {
          bottomInset: window.innerHeight * MAP_SHEET_FRACTION,
          animate: true,
        })
      }
    }
  }, [modulePanel, resolveAuthor, isCompact, adapter])

  // Wire marker clicks to the shared module panel. The adapter's
  // subscriber returns an unsubscribe — clean up so we don't leak
  // callbacks across remounts. While picking a location, marker clicks
  // are ignored: a click should set the position, not open a detail.
  useEffect(() => {
    if (!adapter) return
    const unsubscribe = adapter.observeMarkerClicks((markerId) => {
      const item = itemsById.get(markerId)
      if (isPicking) {
        // Picking directly on an existing marker snaps the pick to it (the
        // marker element swallows the map click, so handle it here).
        const pos = item?.data.position as { coordinates?: number[] } | undefined
        if (pos?.coordinates && pos.coordinates.length >= 2) {
          const [lng, lat] = pos.coordinates
          if (typeof lng === "number" && typeof lat === "number") {
            updatePick({ lat, lng })
            setPickPos({ lat, lng })
          }
        }
        return
      }
      if (item) openDetail(item)
    })
    return unsubscribe
  }, [adapter, itemsById, openDetail, isPicking, updatePick])

  // While picking, a map click commits the position immediately (so "Erstellen"
  // always has it) and drops the marker where clicked. No recenter: the click
  // is already in the visible area, so this avoids jumps and a marker landing
  // under the composer sidebar.
  useEffect(() => {
    if (!adapter || !isPicking) return
    const unsubscribe = adapter.observeClicks((e) => {
      const [lng, lat] = e.position
      updatePick({ lat, lng })
      setPickPos({ lat, lng })
    })
    return unsubscribe
  }, [adapter, isPicking, updatePick])

  // Drop the provisional pick when picking ends.
  useEffect(() => {
    if (!isPicking) setPickPos(null)
  }, [isPicking])

  // Composer opens via the app-level host, so its save path survives the
  // round-trip to location picking. The Feed keeps its own fullscreen shell.
  const openComposer = useCallback(() => {
    openCreateComposer({ contentTypes: mapContentTypes, mapper: mapSubmission })
  }, [openCreateComposer, mapContentTypes, mapSubmission])

  return (
    <div className="relative h-full w-full">
      {/* `isolate` creates a new stacking context so the map library's
          internal control / popup z-indices stay contained and don't overlay
          the navbar / workspace switcher / user menu above. */}
      <div ref={containerRef} className="absolute inset-0 isolate" />

      {/* Location-pick banner: shown while a composer hands off position
          picking to this map. On mobile the composer drawer is suspended so
          the map is reachable; this banner is the pick affordance + cancel. */}
      {isPicking && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-background/95 px-3 py-2 text-sm shadow-md backdrop-blur">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            <span>
              {pickPos
                ? "Position gewählt."
                : "Tippe auf die Karte, um die Position zu setzen."}
            </span>
            {isCompact && pickPos && (
              <Button size="sm" className="h-7 px-2 text-xs" onClick={confirmPick}>
                Fertig
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={cancelPick}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {/* FilterBar floats above the map without a wrapper card —
          the trigger button + active chips sit directly on the map.
          pointer-events-none on the layer so the map keeps panning
          between elements; the FilterBar's own interactive children
          opt back in via pointer-events-auto. */}
      {/* The MapLibre adapter places its zoom control top-left (like the
          Leaflet adapter did); offset the FilterBar past it so the trigger
          doesn't hide the minus button. A low overlay z keeps the FilterBar
          above the map but still below the detail/composer panel when open. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 py-3 pr-3 pl-16 **:pointer-events-auto">
        <FilterBar
          value={filterBarValue}
          onChange={setFilterBarValue}
          availableTags={availableTags}
          availableTypes={MAP_TYPES}
          leadingActions={
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Suche…"
                aria-label="Karte durchsuchen"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="h-8 w-full pl-7 text-xs bg-background shadow-sm sm:w-40"
              />
            </div>
          }
        />
      </div>

      {/* Hidden while picking: the map click sets a position, not a new item. */}
      {!isPicking && <CreateFab onClick={openComposer} label="Ort erstellen" />}
    </div>
  )
}
