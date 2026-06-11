import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import {
  useItems,
  useMembers,
  useCurrentUser,
  AdaptivePanel,
  ContentComposer,
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
  useItemEditor,
  type ItemEditorMapper,
  getTagAccentColor,
  Input,
  Sheet,
  SheetContent,
  type FilterBarValue,
  type FilterTypeOption,
  type MapMarkerSpec,
} from "@real-life-stack/toolkit"
import { LeafletMapAdapter } from "@real-life-stack/toolkit/leaflet"
import { Calendar, MapPin, Search, Sparkles } from "lucide-react"
import type { Item, User } from "@real-life-stack/data-interface"

const MAP_TYPES: FilterTypeOption[] = [
  { id: "event", label: "Events", icon: Calendar },
  { id: "place", label: "Orte", icon: MapPin },
  { id: "quest", label: "Quests", icon: Sparkles },
]

/**
 * Map module — first real version using the LeafletMapAdapter from toolkit.
 *
 * Shows every item in the current space that has `data.position` (GeoJSON
 * Point). This is the cross-module case: a workshop with `type=event` and a
 * `position` appears on both the calendar and the map.
 *
 * Marker click opens the same AdaptivePanel + ItemDetailPanel + ItemPreview
 * stack that Feed / Kanban / Calendar use. A Leaflet popup with the
 * ItemPreview inline (and detail-open as a secondary action) is the
 * obvious alternative — UX discussion is open, see
 * `docs/spec/modules/map.md` § Offene Punkte.
 */
export function MapView({ groupId }: { groupId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Adapter lives in state so the markers-effect re-runs once `mount()` has
  // actually resolved. With lazy-loaded leaflet, `mount()` is genuinely async,
  // and the StrictMode double-mount race is too tight for refs alone.
  const [adapter, setAdapter] = useState<LeafletMapAdapter | null>(null)
  // Field-presence filter (spec 06): any item with data.position is
  // map-renderable, regardless of `type`. The Point/coordinates check
  // below is still defensive validation, not the activation criterion.
  const { data: items } = useItems({ hasField: ["position"] })
  // Cross-space aggregate ("Mein Netzwerk"): useMembers(null) yields
  // the union of all known members, so authors of map items pulled
  // in from other spaces still resolve to their User.
  const { data: members } = useMembers(groupId === "__overview__" ? null : groupId)
  const { data: currentUser } = useCurrentUser()

  const [detailItem, setDetailItem] = useState<Item | null>(null)
  const [filterBarValue, setFilterBarValue] = useState<FilterBarValue>(emptyFilterBarValue)
  const [searchText, setSearchText] = useState("")
  const itemsAfterBar = useFilterableItems(items, filterBarValue)
  const filteredItems = useMemo(() => {
    const needle = searchText.trim().toLowerCase()
    if (!needle) return itemsAfterBar
    return itemsAfterBar.filter((item) => {
      const title = String(item.data.title ?? "").toLowerCase()
      const description = String(item.data.description ?? "").toLowerCase()
      return title.includes(needle) || description.includes(needle)
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

  const editor = useItemEditor({
    currentUserId: currentUser?.id,
    mapSubmission,
  })

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
        color: firstTag ? getTagAccentColor(firstTag) : undefined,
      })
      byId.set(item.id, item)
    }
    return { markers: markerList, itemsById: byId }
  }, [filteredItems])

  // Mount the adapter once. Lazy-loaded leaflet means mount() is properly
  // async, which exposes a classic StrictMode race: both effect passes start
  // their own mount() in parallel and would race for the same DOM container,
  // ending in Leaflet's "Map container is already initialized" error.
  //
  // Robust fix: each effect run gets its own fresh inner div as Leaflet's
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
    const ad = new LeafletMapAdapter()
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
        console.error("LeafletMapAdapter mount failed", err)
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

  // Push markers to the adapter once it is mounted, and on every change.
  useEffect(() => {
    adapter?.setMarkers(markers)
  }, [adapter, markers])

  // Wire marker clicks to the detail panel. The adapter's subscriber
  // pattern returns an unsubscribe — clean up so we don't leak callbacks
  // across remounts.
  useEffect(() => {
    if (!adapter) return
    const unsubscribe = adapter.observeMarkerClicks((markerId) => {
      const item = itemsById.get(markerId)
      if (item) setDetailItem(item)
    })
    return unsubscribe
  }, [adapter, itemsById])

  const resolveAuthor = useCallback(
    (createdBy: string): User | undefined => {
      const member = members.find((m) => m.id === createdBy)
      if (member) return member
      if (currentUser?.id === createdBy) return currentUser
      return undefined
    },
    [members, currentUser],
  )

  return (
    <div className="relative h-full w-full">
      {/* `isolate` creates a new stacking context so Leaflet's internal
          z-indices (zoom controls up to 1000, popup panes 700, marker
          panes 600) stay contained and don't overlay the navbar /
          workspace switcher / user menu above. */}
      <div ref={containerRef} className="absolute inset-0 isolate" />

      {/* FilterBar floats above the map without a wrapper card —
          the trigger button + active chips sit directly on the map.
          pointer-events-none on the layer so the map keeps panning
          between elements; the FilterBar's own interactive children
          opt back in via pointer-events-auto. */}
      {/* Leaflet's default zoom controls sit top-left at ~44px; offset
          the FilterBar past them so the trigger doesn't hide the minus
          button. The `isolate` on the map container bounds Leaflet's
          internal z-indices, so a low overlay z keeps the FilterBar
          above the map but still below Sheet/Dialog (z-50) when the
          detail panel opens. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 py-3 pr-3 pl-16 **:pointer-events-auto">
        <FilterBar
          value={filterBarValue}
          onChange={setFilterBarValue}
          availableTags={availableTags}
          availableTypes={MAP_TYPES}
          trailingActions={
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Suche…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="h-8 w-40 pl-7 text-xs bg-background shadow-sm"
              />
            </div>
          }
        />
      </div>

      <CreateFab onClick={() => editor.openCreate()} label="Ort erstellen" />

      <Sheet open={editor.isOpen} onOpenChange={(open) => { if (!open) editor.close() }}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <ContentComposer
            className="p-4 sm:p-6"
            contentTypes={mapContentTypes}
            onSubmit={(data) => editor.submit(data)}
            onCancel={() => editor.close()}
            showPreview={false}
          />
        </SheetContent>
      </Sheet>

      <AdaptivePanel
        open={detailItem !== null}
        onClose={() => setDetailItem(null)}
        allowedModes={["sidebar", "drawer"]}
        sidebarWidth="420px"
      >
        {detailItem && (
          <ItemDetailPanel
            itemId={detailItem.id}
            renderCommentReactions={(commentId) => <ReactionBar itemId={commentId} />}
          >
            <div className="p-4">
              <ItemPreview
                item={detailItem}
                author={resolveAuthor(detailItem.createdBy)}
                headerAdornment={<ItemTypeBadge type={detailItem.type} />}
                metaAdornment={<ItemMetaRow item={detailItem} />}
                footerAdornment={
                  detailItem.type !== "task" ? <ReactionBar itemId={detailItem.id} /> : undefined
                }
              />
            </div>
          </ItemDetailPanel>
        )}
      </AdaptivePanel>
    </div>
  )
}
