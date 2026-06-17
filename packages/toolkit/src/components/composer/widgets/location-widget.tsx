"use client"

import * as React from "react"
import { Globe, Loader2, MapPin } from "lucide-react"
import { Input } from "@/components/primitives/input"
import { Button } from "@/components/primitives/button"
import { cn } from "@/lib/utils"
import type { Geocoder, GeocodeResult } from "@/lib/geocode"

interface LocationData {
  address?: string
  link?: string
  isOnline?: boolean
  position?: { lat: number; lng: number }
}

interface LocationWidgetProps {
  value: LocationData
  onChange: (value: LocationData) => void
  label: string
  /**
   * Optional address geocoder. When provided, typing an address shows
   * debounced suggestions; picking one sets `position`. Without it the address
   * stays free text (no position from the address).
   */
  geocode?: Geocoder
  renderMap?: (props: {
    position: { lat: number; lng: number } | null
    onPositionChange: (pos: { lat: number; lng: number }) => void
    onConfirm: () => void
  }) => React.ReactNode
}

const GEOCODE_DEBOUNCE_MS = 500
const GEOCODE_MIN_CHARS = 3

export function LocationWidget({
  value,
  onChange,
  label,
  geocode,
  renderMap,
}: LocationWidgetProps) {
  const isOnline = value.isOnline ?? false
  const address = value.address ?? ""

  // Geocoding is driven by what the user actually *types*, not by every
  // external `address` change. So opening an editor with a prefilled address
  // does not auto-search, and picking a suggestion (which sets address = label)
  // does not re-search. `null` means "no pending user query".
  const [userQuery, setUserQuery] = React.useState<string | null>(null)
  const [results, setResults] = React.useState<GeocodeResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(-1)
  const [failed, setFailed] = React.useState(false)
  const blurTimer = React.useRef<number | null>(null)
  const listId = React.useId()

  React.useEffect(() => {
    if (!geocode || isOnline || userQuery === null) return
    const q = userQuery.trim()
    if (q.length < GEOCODE_MIN_CHARS) {
      setResults([])
      setOpen(false)
      setActiveIndex(-1)
      setFailed(false)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      geocode(q, { signal: controller.signal })
        .then((hits) => {
          if (controller.signal.aborted) return
          setResults(hits)
          setOpen(hits.length > 0)
          setActiveIndex(-1)
          setFailed(false)
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || (err as { name?: string })?.name === "AbortError") return
          setResults([])
          setOpen(false)
          setFailed(true)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, GEOCODE_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [userQuery, geocode, isOnline])

  // Clear a pending blur-close timer on unmount.
  React.useEffect(
    () => () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current)
    },
    [],
  )

  const closeSoon = () => {
    if (blurTimer.current) window.clearTimeout(blurTimer.current)
    // Delay so a mouse click on a suggestion registers before the list closes.
    blurTimer.current = window.setTimeout(() => setOpen(false), 120)
  }

  const selectResult = (r: GeocodeResult) => {
    onChange({ ...value, address: r.label, position: { lat: r.lat, lng: r.lng } })
    setUserQuery(null) // not a user query → no re-search
    setResults([])
    setOpen(false)
    setActiveIndex(-1)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === "Enter" && open && activeIndex >= 0) {
      e.preventDefault()
      selectResult(results[activeIndex])
    } else if (e.key === "Escape") {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {/* Online/Offline Toggle */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={!isOnline ? "default" : "ghost"}
          size="sm"
          onClick={() => onChange({ ...value, isOnline: false })}
          className="h-7 gap-1 px-2 text-xs"
        >
          <MapPin className="h-3 w-3" />
          Vor Ort
        </Button>
        <Button
          type="button"
          variant={isOnline ? "default" : "ghost"}
          size="sm"
          onClick={() => onChange({ ...value, isOnline: true })}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Globe className="h-3 w-3" />
          Online
        </Button>
      </div>
      {/* Input field */}
      {isOnline ? (
        <Input
          value={value.link || ""}
          onChange={(e) => onChange({ ...value, link: e.target.value })}
          placeholder="Meeting-Link (z.B. https://meet.example.com/...)"
          type="url"
          className="text-sm"
        />
      ) : (
        <>
          <div className="relative">
            <Input
              value={address}
              onChange={(e) => {
                onChange({ ...value, address: e.target.value })
                setUserQuery(e.target.value)
              }}
              onFocus={() => {
                if (results.length > 0) setOpen(true)
              }}
              onBlur={closeSoon}
              onKeyDown={onInputKeyDown}
              placeholder="Adresse eingeben..."
              className="text-sm"
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                open && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
              }
            />
            {loading && (
              <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {open && results.length > 0 && (
              <ul
                id={listId}
                role="listbox"
                className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover text-sm shadow-md"
              >
                {results.map((r, i) => (
                  <li
                    key={`${r.lat},${r.lng},${i}`}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                  >
                    <button
                      type="button"
                      // Keep the input focused so onBlur does not close the list
                      // before the click lands.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectResult(r)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={cn(
                        "block w-full px-2 py-1.5 text-left hover:bg-accent",
                        i === activeIndex && "bg-accent",
                      )}
                    >
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {failed && !loading && (
            <p className="px-1 text-[11px] text-muted-foreground">
              Adresssuche gerade nicht verfügbar.
            </p>
          )}
          {/* Map slot */}
          {renderMap && (
            <div className="mt-2 overflow-hidden rounded-md border">
              {renderMap({
                position: value.position || null,
                onPositionChange: (pos) => onChange({ ...value, position: pos }),
                onConfirm: () => {},
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
