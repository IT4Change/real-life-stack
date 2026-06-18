"use client"

import { createContext, useContext, useMemo, useRef, useState, type TouchEvent, type TransitionEvent } from "react"
import {
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns,
  Grid3x3,
  List,
  Search,
} from "lucide-react"
import { Button } from "../primitives/button"
import { Input } from "../primitives/input"
import { cn, getItemColor, getReadableTextColor, getActivePanelGlow } from "../../lib/utils"
import { isAllDayDate, parseEventDate } from "../../lib/date-utils"
import { ItemPreview } from "../preview/item-preview"
import { ItemTypeBadge } from "../preview/item-type-badge"
import { ItemTimeRange } from "../preview/item-time-range"
import { FilterBar } from "../filter/filter-bar"
import { FilterSection, FilterToggle, FilterMultiSelect } from "../filter/filter-building-blocks"
import { emptyFilterBarValue, type FilterBarValue, type FilterTypeOption } from "../filter/types"
import { useFilterableItems } from "../../hooks/use-filterable-items"
import type { Item } from "@real-life-stack/data-interface"

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
]
const DAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]
const LONG_DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"]
const TIME_SLOTS = Array.from({ length: 18 }, (_, index) => index + 6)

/** Resolves the group/space fallback colour for a given item, so every EventPill
 *  uses the same custom → tag → group logic without threading colour through each
 *  view. The resolver lets each item fall back to the colour of the group it was
 *  created in (origin group), which is what makes the aggregate ("Mein Netzwerk")
 *  view show per-group colours instead of one active-group colour. */
type GroupColorResolver = (item: Item) => string
const CalendarGroupColorContext = createContext<GroupColorResolver>(() => "#2563eb")

/** Id of the item currently open in the shared panel, so its pill/card is
 *  highlighted across the calendar (and stays in sync with map/feed/kanban). */
const CalendarActiveItemContext = createContext<string | undefined>(undefined)

/** Min horizontal travel (px) to commit a period swipe — PR spec contract. */
const SWIPE_COMMIT_PX = 60
/** Week grid template: a narrow time gutter + 7 equal day columns that shrink to
 *  fit the viewport (no horizontal scroll), so the week paginates via the same
 *  swipe carousel as month/day instead of an inner scroll. */
const WEEK_COLS = "grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]"

export type CalendarViewMode = "month" | "week" | "day" | "list"
type LocationFilter = "all" | "with" | "without"

interface CalendarDay {
  date: Date
  key: string
  number: number
  isCurrentMonth: boolean
  isSelected: boolean
  isToday: boolean
  events: CalendarEvent[]
}

interface CalendarEvent {
  item: Item
  start: Date
  end?: Date
  /** True when the source value was a bare YYYY-MM-DD (no clock time). */
  allDay: boolean
  title: string
  description?: string
  location?: string
  tags: string[]
}

interface CalendarEventGroup {
  key: string
  date: Date
  events: CalendarEvent[]
}

const VIEW_MODES: Array<{ id: CalendarViewMode; label: string; icon: typeof CalendarIcon }> = [
  { id: "month", label: "Monat", icon: Grid3x3 },
  { id: "week", label: "Woche", icon: Columns },
  { id: "day", label: "Tag", icon: CalendarIcon },
  { id: "list", label: "Liste", icon: List },
]

function getInitialDate(value?: Date | string): Date {
  if (!value) return new Date()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function isSameDate(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b)
}

function atStartOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function startOfWeek(date: Date): Date {
  const start = atStartOfDay(date)
  const weekday = start.getDay()
  start.setDate(start.getDate() - (weekday === 0 ? 6 : weekday - 1))
  return start
}

function getEventDate(value: unknown): Date | null {
  if (!value) return null
  // parseEventDate handles bare YYYY-MM-DD as local midnight; without
  // this, all-day events would shift by the local UTC offset (e.g. CEST
  // would show "02:00" on a date the user picked as the full day).
  const date = parseEventDate(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function getLocationLabel(locationName: unknown, address: unknown): string | undefined {
  if (typeof locationName === "string" && locationName.length > 0) return locationName
  if (typeof address === "string" && address.length > 0) return address
  return undefined
}

function toCalendarEvent(item: Item): CalendarEvent | null {
  const start = getEventDate(item.data.start)
  if (!start) return null

  const end = getEventDate(item.data.end) ?? undefined
  const description = item.data.description ?? item.data.content
  // Treat the event as all-day when the source string carries no clock
  // time on either end. Same rule as feed-item.tsx.
  const startRaw = typeof item.data.start === "string" ? item.data.start : ""
  const endRaw = typeof item.data.end === "string" ? item.data.end : ""
  const allDay = isAllDayDate(startRaw) && (!endRaw || isAllDayDate(endRaw))
  return {
    item,
    start,
    end,
    allDay,
    title: String(item.data.title ?? item.data.name ?? "Ohne Titel"),
    description: typeof description === "string" ? description : undefined,
    location: getLocationLabel(item.data.locationName, item.data.address),
    tags: item.tags ?? [],
  }
}

function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  return a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title)
}

function buildCalendarDays(
  year: number,
  month: number,
  selectedDate: Date,
  today: Date,
  eventsByDay: Map<string, CalendarEvent[]>,
): CalendarDay[] {
  const firstDay = new Date(year, month, 1).getDay()
  const startOffset = firstDay === 0 ? 6 : firstDay - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()

  return Array.from({ length: 42 }, (_, index) => {
    const dayNum = index - startOffset + 1
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth
    const number = dayNum < 1 ? daysInPrev + dayNum : dayNum > daysInMonth ? dayNum - daysInMonth : dayNum
    const date = inMonth
      ? new Date(year, month, number)
      : dayNum < 1
        ? new Date(year, month - 1, number)
        : new Date(year, month + 1, number)
    const key = toDateKey(date)
    return {
      date,
      key,
      number,
      isCurrentMonth: inMonth,
      isSelected: isSameDate(date, selectedDate),
      isToday: isSameDate(date, today),
      events: eventsByDay.get(key) ?? [],
    }
  })
}

function groupEventsByDay(events: CalendarEvent[]): CalendarEventGroup[] {
  const grouped = new Map<string, CalendarEventGroup>()
  for (const event of events) {
    const key = toDateKey(event.start)
    grouped.set(key, {
      key,
      date: grouped.get(key)?.date ?? atStartOfDay(event.start),
      events: [...(grouped.get(key)?.events ?? []), event].sort(compareEvents),
    })
  }
  return [...grouped.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}

function withTime(date: Date, hour: number, minute = 0): Date {
  const next = new Date(date)
  next.setHours(hour, minute, 0, 0)
  return next
}

function getEventsForDay(eventsByDay: Map<string, CalendarEvent[]>, date: Date): CalendarEvent[] {
  return eventsByDay.get(toDateKey(date)) ?? []
}

function getPeriodEvents(events: CalendarEvent[], visibleDate: Date, viewMode: CalendarViewMode): CalendarEvent[] {
  if (viewMode === "day") {
    return events.filter((event) => isSameDate(event.start, visibleDate))
  }
  if (viewMode === "week") {
    const weekStart = startOfWeek(visibleDate)
    const weekEnd = addDays(weekStart, 7)
    return events.filter((event) => event.start >= weekStart && event.start < weekEnd)
  }
  return events.filter(
    (event) =>
      event.start.getFullYear() === visibleDate.getFullYear() &&
      event.start.getMonth() === visibleDate.getMonth(),
  )
}

function getHeaderLabel(date: Date, viewMode: CalendarViewMode): string {
  if (viewMode === "day") {
    return `${LONG_DAY_NAMES[date.getDay()]}, ${date.getDate()}. ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
  }
  if (viewMode === "week") {
    const weekStart = startOfWeek(date)
    const weekEnd = addDays(weekStart, 6)
    if (weekStart.getMonth() === weekEnd.getMonth()) {
      return `${weekStart.getDate()}. - ${weekEnd.getDate()}. ${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    }
    return `${weekStart.getDate()}. ${MONTH_NAMES[weekStart.getMonth()]} - ${weekEnd.getDate()}. ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
  }
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    event: "Events",
    project: "Projekte",
    offer: "Angebote",
    task: "Tasks",
    quest: "Quests",
  }
  return labels[type] ?? type
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
}

function formatDayLabel(date: Date): string {
  return `${LONG_DAY_NAMES[date.getDay()]}, ${date.getDate()}. ${MONTH_NAMES[date.getMonth()]}`
}

export interface CalendarViewProps {
  events: Item[]
  initialDate?: Date | string
  initialViewMode?: CalendarViewMode
  currentUserId?: string
  /** Active group/space colour — the group fallback when no per-item resolver is given. */
  groupColor?: string
  /** Per-item group fallback colour (origin group). Takes precedence over `groupColor`;
   *  lets the aggregate view colour each item by the group it was created in. */
  resolveItemGroupColor?: (item: Item) => string
  /** Id of the item currently open in the shared panel — its pill/card is highlighted. */
  activeItemId?: string
  onEventClick?: (event: Item) => void
  onCreateEvent?: (date: Date) => void
  className?: string
}

export function CalendarView({
  events,
  initialDate,
  initialViewMode = "month",
  currentUserId,
  groupColor = "#2563eb",
  resolveItemGroupColor,
  activeItemId,
  onEventClick,
  onCreateEvent,
  className,
}: CalendarViewProps) {
  const today = useMemo(() => getInitialDate(initialDate), [initialDate])
  const [visibleDate, setVisibleDate] = useState(today)
  const [selectedDate, setSelectedDate] = useState(today)
  const [viewMode, setViewMode] = useState<CalendarViewMode>(initialViewMode)
  const [filterBarValue, setFilterBarValue] = useState<FilterBarValue>(emptyFilterBarValue)
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all")
  const [myEventsOnly, setMyEventsOnly] = useState(false)
  const [searchText, setSearchText] = useState("")

  const eventsAfterBar = useFilterableItems(events, filterBarValue)

  const calendarEvents = useMemo(
    () => eventsAfterBar.map(toCalendarEvent).filter((event): event is CalendarEvent => event !== null).sort(compareEvents),
    [eventsAfterBar],
  )

  const availableTags = useMemo(() => {
    const seen = new Set<string>()
    for (const event of events) for (const tag of event.tags ?? []) seen.add(tag)
    return Array.from(seen).sort()
  }, [events])

  const availableTypes = useMemo<FilterTypeOption[]>(() => {
    const seen = new Set<string>()
    for (const event of events) seen.add(event.type)
    return Array.from(seen).sort().map((id) => ({ id, label: getTypeLabel(id) }))
  }, [events])

  const filteredEvents = useMemo(() => {
    const needle = searchText.trim().toLowerCase()
    return calendarEvents.filter((event) => {
      if (locationFilter === "with" && !event.location) return false
      if (locationFilter === "without" && event.location) return false
      if (myEventsOnly && currentUserId && event.item.createdBy !== currentUserId) return false
      if (needle) {
        const title = event.title.toLowerCase()
        const description = (event.description ?? "").toLowerCase()
        if (!title.includes(needle) && !description.includes(needle)) return false
      }
      return true
    })
  }, [calendarEvents, currentUserId, locationFilter, myEventsOnly, searchText])

  const eventsByDay = useMemo(
    () => {
      const map = new Map<string, CalendarEvent[]>()
      for (const event of filteredEvents) {
        const key = toDateKey(event.start)
        map.set(key, [...(map.get(key) ?? []), event].sort(compareEvents))
      }
      return map
    },
    [filteredEvents],
  )

  function movePeriod(direction: -1 | 1) {
    setVisibleDate((date) => {
      if (viewMode === "day") return addDays(date, direction)
      if (viewMode === "week") return addDays(date, direction * 7)
      return addMonths(date, direction)
    })
  }

  function goToday() {
    setVisibleDate(today)
    setSelectedDate(today)
  }

  function selectViewMode(nextMode: CalendarViewMode) {
    setViewMode(nextMode)
    if (nextMode === "day") setSelectedDate(visibleDate)
  }

  // Swipe-to-navigate as a carousel: the previous and next period are
  // rendered alongside the current one in a flex track, so the neighbour is
  // already attached while the finger drags — no empty gap between periods.
  // The track rests at translateX(-100%) (one panel = the viewport width) to
  // centre the middle panel; the finger adds a pixel offset. On release past
  // the threshold the chosen neighbour animates fully into view, then we
  // commit the period change and recentre with no animation — the swapped
  // content re-renders into the middle panel at the same on-screen spot, so
  // the snap is invisible. `touch-action: pan-y` lets vertical scrolling
  // (week/day/list) through while we own horizontal gestures; small moves
  // stay below the threshold so taps work.
  const swipeTrackRef = useRef<HTMLDivElement>(null)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipeAxisRef = useRef<"h" | "v" | null>(null)
  const swipeDirRef = useRef<-1 | 1>(1)
  const swipeBusyRef = useRef(false)
  const swipeDxRef = useRef(0)
  const [swipeDx, setSwipeDx] = useState(0)
  const [swipeAnimating, setSwipeAnimating] = useState(false)

  const setSwipeOffset = (x: number) => {
    swipeDxRef.current = x
    setSwipeDx(x)
  }
  const panelWidth = () => swipeTrackRef.current?.offsetWidth || 1
  const snapBackToCenter = () => {
    if (swipeDxRef.current !== 0) {
      setSwipeAnimating(true)
      setSwipeOffset(0)
    }
  }

  const handleSwipeStart = (e: TouchEvent) => {
    // A single finger owns a swipe — ignore multi-touch (pinch/zoom), which
    // would otherwise record a start point and paginate on release.
    if (swipeBusyRef.current || e.touches.length !== 1) {
      swipeStartRef.current = null
      return
    }
    const t = e.touches[0]
    swipeStartRef.current = { x: t.clientX, y: t.clientY }
    swipeAxisRef.current = null
    setSwipeAnimating(false)
  }
  const handleSwipeMove = (e: TouchEvent) => {
    const start = swipeStartRef.current
    if (!start || swipeBusyRef.current) return
    if (e.touches.length !== 1) {
      // A second finger landed mid-drag — abandon the swipe and snap back
      // without navigating.
      swipeStartRef.current = null
      swipeAxisRef.current = null
      snapBackToCenter()
      return
    }
    const t = e.touches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (swipeAxisRef.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      // Require clear horizontal dominance before we own the gesture, so
      // diagonal/vertical scrolls stay with the page (PR spec: |dx| > |dy|*1.5).
      swipeAxisRef.current = Math.abs(dx) > Math.abs(dy) * 1.5 ? "h" : "v"
    }
    if (swipeAxisRef.current === "h") setSwipeOffset(dx)
  }
  const handleSwipeEnd = () => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    const horizontal = swipeAxisRef.current === "h"
    swipeAxisRef.current = null
    if (!start || !horizontal || swipeBusyRef.current) return
    const dx = swipeDxRef.current
    const width = panelWidth()
    if (Math.abs(dx) > SWIPE_COMMIT_PX) {
      const dir: -1 | 1 = dx < 0 ? 1 : -1 // swipe left → next, right → prev
      swipeDirRef.current = dir
      swipeBusyRef.current = true
      setSwipeAnimating(true)
      setSwipeOffset(dir === 1 ? -width : width) // bring the chosen neighbour fully in
    } else if (dx !== 0) {
      // Below threshold → snap back to the current period. (dx === 0 is a tap;
      // nothing to animate, so we leave the track where it rests.)
      snapBackToCenter()
    }
  }
  const handleSwipeCancel = () => {
    // touchcancel (OS/browser interrupts the sequence): abandon the gesture and
    // snap back — never commit navigation off a cancelled touch.
    if (swipeBusyRef.current) return // a commit animation already owns the track
    swipeStartRef.current = null
    swipeAxisRef.current = null
    snapBackToCenter()
  }
  const handleSwipeTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    // Only the track's own transform transition counts — ignore transitionend
    // events bubbling up from child hover/colour transitions.
    if (e.target !== e.currentTarget) return
    if (!swipeBusyRef.current) {
      setSwipeAnimating(false) // a snap-back finished
      return
    }
    // Neighbour fully in view: commit the period change and recentre without
    // animation. The new current period re-renders into the middle panel at
    // the same on-screen position, so there is no visible jump.
    movePeriod(swipeDirRef.current)
    setSwipeAnimating(false)
    setSwipeOffset(0)
    swipeBusyRef.current = false
  }

  const periodDate = (date: Date, steps: number) => {
    if (viewMode === "day") return addDays(date, steps)
    if (viewMode === "week") return addDays(date, steps * 7)
    return addMonths(date, steps)
  }

  const renderPeriod = (date: Date) => {
    if (viewMode === "month") {
      return (
        <MonthCalendar
          visibleDate={date}
          selectedDate={selectedDate}
          today={today}
          eventsByDay={eventsByDay}
          onSelectDate={(d) => {
            setSelectedDate(d)
            setVisibleDate(d)
          }}
          onOpenDay={(d) => {
            setSelectedDate(d)
            setVisibleDate(d)
            setViewMode("day")
          }}
          onEventClick={onEventClick}
          onCreateEvent={onCreateEvent}
        />
      )
    }
    if (viewMode === "week") {
      return (
        <WeekCalendar
          visibleDate={date}
          eventsByDay={eventsByDay}
          events={filteredEvents}
          onSelectDate={(d) => {
            setSelectedDate(d)
            setVisibleDate(d)
            setViewMode("day")
          }}
          onEventClick={onEventClick}
          onCreateEvent={onCreateEvent}
        />
      )
    }
    if (viewMode === "day") {
      return (
        <DayCalendar
          visibleDate={date}
          eventsByDay={eventsByDay}
          onEventClick={onEventClick}
          onCreateEvent={onCreateEvent}
        />
      )
    }
    return (
      <EventList
        events={getPeriodEvents(filteredEvents, date, viewMode).sort(compareEvents)}
        onEventClick={onEventClick}
      />
    )
  }

  const resolveGroupColor = resolveItemGroupColor ?? (() => groupColor)

  return (
    <CalendarGroupColorContext.Provider value={resolveGroupColor}>
    <CalendarActiveItemContext.Provider value={activeItemId}>
    <div className={cn("w-full space-y-3", className)}>
      <FilterBar
        value={filterBarValue}
        onChange={setFilterBarValue}
        availableTags={availableTags}
        availableTypes={availableTypes}
        leadingActions={
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Suche…"
              aria-label="Kalender durchsuchen"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 w-full pl-7 text-xs sm:w-40"
            />
          </div>
        }
        trailingActions={
          <Button variant="outline" size="sm" className="shrink-0" onClick={goToday}>
            Heute
          </Button>
        }
        drawerExtra={
          <>
            <FilterSection label="Ort">
              <FilterMultiSelect
                options={[
                  { id: "with", label: "Mit Ort" },
                  { id: "without", label: "Ohne Ort" },
                ]}
                value={locationFilter === "all" ? [] : [locationFilter]}
                onChange={(next) => {
                  if (next.length === 0) setLocationFilter("all")
                  else setLocationFilter(next[next.length - 1] as LocationFilter)
                }}
              />
            </FilterSection>
            {currentUserId && (
              <FilterSection label="Zuweisung">
                <FilterToggle
                  label="Nur meine Events"
                  value={myEventsOnly}
                  onChange={setMyEventsOnly}
                />
              </FilterSection>
            )}
          </>
        }
        chipsExtra={
          <>
            {locationFilter !== "all" && (
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 pl-2 pr-1 py-0.5 text-xs font-medium">
                {locationFilter === "with" ? "Mit Ort" : "Ohne Ort"}
                <button
                  type="button"
                  onClick={() => setLocationFilter("all")}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  aria-label="Ortsfilter entfernen"
                >
                  ×
                </button>
              </span>
            )}
            {myEventsOnly && currentUserId && (
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 pl-2 pr-1 py-0.5 text-xs font-medium">
                Nur meine
                <button
                  type="button"
                  onClick={() => setMyEventsOnly(false)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  aria-label="Filter entfernen"
                >
                  ×
                </button>
              </span>
            )}
          </>
        }
      />

      <div className="-mx-4 sm:mx-0 sm:overflow-hidden sm:rounded-lg sm:border">
      <div className="flex flex-col gap-3 border-b p-3 sm:gap-4 sm:p-4 md:flex-row md:items-center md:justify-between">
        {/* Title between the two arrows, hugging the text (no reserved width, so
            no floating gap). Centred on mobile to sit balanced above the
            full-width view switcher, left-aligned on desktop. The view switcher
            may shift slightly on desktop when the label width changes between
            views — an acceptable trade for a header that doesn't stand apart. */}
        <div className="flex items-center justify-center gap-0.5 md:justify-start">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Vorheriger Zeitraum"
            onClick={() => movePeriod(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-0 truncate px-1 text-center text-base font-semibold sm:text-lg">
            {getHeaderLabel(visibleDate, viewMode)}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Nächster Zeitraum"
            onClick={() => movePeriod(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="grid w-full grid-cols-4 rounded-lg bg-muted p-1 sm:flex sm:w-auto">
            {VIEW_MODES.map((mode) => {
              const Icon = mode.icon
              const selected = viewMode === mode.id
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={selected}
                  title={mode.label}
                  onClick={() => selectViewMode(mode.id)}
                  className={cn(
                    "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors sm:px-3",
                    selected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{mode.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Swipe left/right to step the period — all views, week included now
          that it fits 7 columns without horizontal scroll. Previous, current
          and next render side by side in the track so the neighbour is already
          attached while dragging — no empty gap (see the carousel handlers above). */}
      <div className="overflow-hidden">
        <div
          ref={swipeTrackRef}
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          onTouchCancel={handleSwipeCancel}
          onTransitionEnd={handleSwipeTransitionEnd}
          className="flex items-start"
          style={{
            transform: `translateX(calc(-100% + ${swipeDx}px))`,
            transition: swipeAnimating ? "transform 250ms ease-out" : "none",
            touchAction: "pan-y",
          }}
        >
          {/* Only the centred panel is interactive. The off-screen neighbours
              render full calendars (buttons, cards), so mark them inert +
              aria-hidden to keep them out of the focus and a11y tree; after a
              swap they re-render by position, so the middle one is always the
              live period. */}
          <div className="w-full shrink-0" aria-hidden inert>{renderPeriod(periodDate(visibleDate, -1))}</div>
          <div className="w-full shrink-0">{renderPeriod(visibleDate)}</div>
          <div className="w-full shrink-0" aria-hidden inert>{renderPeriod(periodDate(visibleDate, 1))}</div>
        </div>
      </div>
      </div>
    </div>
    </CalendarActiveItemContext.Provider>
    </CalendarGroupColorContext.Provider>
  )
}

interface MonthCalendarProps {
  visibleDate: Date
  selectedDate: Date
  today: Date
  eventsByDay: Map<string, CalendarEvent[]>
  onSelectDate: (date: Date) => void
  onOpenDay: (date: Date) => void
  onEventClick?: (event: Item) => void
  onCreateEvent?: (date: Date) => void
}

function MonthCalendar({
  visibleDate,
  selectedDate,
  today,
  eventsByDay,
  onSelectDate,
  onOpenDay,
  onEventClick,
  onCreateEvent,
}: MonthCalendarProps) {
  const days = useMemo(
    () => buildCalendarDays(
      visibleDate.getFullYear(),
      visibleDate.getMonth(),
      selectedDate,
      today,
      eventsByDay,
    ),
    [eventsByDay, selectedDate, today, visibleDate],
  )

  return (
    <div>
      <div className="grid grid-cols-7 border-b bg-muted/30 text-xs font-semibold text-muted-foreground">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="px-2 py-2 text-center">
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <div
            key={day.key}
            className={cn(
              "group flex min-h-20 flex-col border-b border-r p-1.5 text-left align-top transition-colors sm:min-h-28 lg:min-h-32",
              !day.isCurrentMonth && "bg-muted/20 text-muted-foreground/50",
              day.isCurrentMonth && "hover:bg-muted/50",
              day.isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/40",
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => onSelectDate(day.date)}
                onDoubleClick={() => onOpenDay(day.date)}
                className={cn(
                  "flex h-6 min-w-6 items-center justify-center rounded-full text-sm font-semibold",
                  day.isToday && "bg-primary text-primary-foreground",
                )}
              >
                {day.number}
              </button>
              {day.events.length > 0 && (
                <span className="text-xs font-medium text-primary">{day.events.length}</span>
              )}
            </div>

            <div className="hidden space-y-1 md:block">
              {day.events.slice(0, 3).map((event) => (
                <EventPill
                  key={event.item.id}
                  event={event}
                  compact
                  onClick={onEventClick}
                />
              ))}
              {day.events.length > 3 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenDay(day.date)
                  }}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  +{day.events.length - 3} weitere
                </button>
              )}
            </div>

            <div className="mt-1 space-y-0.5 md:hidden">
              {day.events.slice(0, 2).map((event) => (
                <EventPill
                  key={event.item.id}
                  event={event}
                  onClick={onEventClick}
                />
              ))}
              {day.events.length > 2 && (
                <button
                  type="button"
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation()
                    onOpenDay(day.date)
                  }}
                  className="w-full rounded px-1 py-0.5 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  +{day.events.length - 2} weitere
                </button>
              )}
            </div>

            {onCreateEvent && day.isCurrentMonth && (
              <button
                type="button"
                aria-label="Event an diesem Tag erstellen"
                onClick={() => onCreateEvent(day.date)}
                tabIndex={-1}
                className="mt-0.5 min-h-4 flex-1 rounded transition-colors hover:bg-primary/5"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface WeekCalendarProps {
  visibleDate: Date
  eventsByDay: Map<string, CalendarEvent[]>
  /** Full filtered list — needed for all-day/multi-day spanning across the week. */
  events: CalendarEvent[]
  onSelectDate: (date: Date) => void
  onEventClick?: (event: Item) => void
  onCreateEvent?: (date: Date) => void
}

function WeekCalendar({
  visibleDate,
  eventsByDay,
  events,
  onSelectDate,
  onEventClick,
  onCreateEvent,
}: WeekCalendarProps) {
  const weekStart = startOfWeek(visibleDate)
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const weekEnd = addDays(weekStart, 6)

  // All-day / multi-day events overlapping the visible week, as spanning bars
  // (Thunderbird-style). They are invisible in the timed grid (start at local
  // midnight, below the 06:00 first slot), so this row is where they appear.
  const dayIndex = (d: Date) =>
    Math.max(0, Math.min(6, Math.round((atStartOfDay(d).getTime() - weekStart.getTime()) / 86_400_000)))
  const allDayBars = events
    .filter((e) => e.allDay && atStartOfDay(e.start) <= weekEnd && atStartOfDay(e.end ?? e.start) >= weekStart)
    .sort(compareEvents)
    .map((e) => {
      const startCol = dayIndex(e.start)
      const endCol = dayIndex(e.end ?? e.start)
      return { event: e, startCol, span: endCol - startCol + 1 }
    })

  return (
    <div>
      <div className={cn("grid border-b bg-muted/30 text-[11px] font-semibold text-muted-foreground", WEEK_COLS)}>
        <div className="px-1 py-2 text-center">Zeit</div>
        {weekDays.map((day) => (
          <button
            key={day.toISOString()}
            type="button"
            onClick={() => onSelectDate(day)}
            className="px-1 py-2 text-center hover:bg-muted"
          >
            <span>{DAY_NAMES[day.getDay()]}</span>
            <span className="ml-1 text-foreground">{day.getDate()}</span>
          </button>
        ))}
      </div>

      {allDayBars.length > 0 && (
        <div
          className={cn("grid gap-y-0.5 border-b bg-background py-0.5", WEEK_COLS)}
          style={{ gridTemplateRows: `repeat(${allDayBars.length}, minmax(22px, auto))` }}
        >
          <div
            className="flex items-center justify-center border-r bg-muted/20 px-0.5 text-center text-[9px] leading-tight text-muted-foreground"
            style={{ gridColumn: 1, gridRow: `1 / ${allDayBars.length + 1}` }}
          >
            Ganztägig
          </div>
          {allDayBars.map(({ event, startCol, span }, index) => (
            <div
              key={event.item.id}
              className="px-0.5"
              style={{ gridColumn: `${startCol + 2} / span ${span}`, gridRow: index + 1 }}
            >
              <EventPill event={event} onClick={onEventClick} />
            </div>
          ))}
        </div>
      )}

      <div className={cn("grid", WEEK_COLS)}>
        {TIME_SLOTS.map((hour) => (
          <div key={hour} className="contents">
            <div className="border-b border-r bg-muted/20 px-1 py-3 text-right text-[10px] text-muted-foreground">
              {String(hour).padStart(2, "0")}:00
            </div>
            {weekDays.map((day) => {
              const slotEvents = getEventsForDay(eventsByDay, day).filter((event) => event.start.getHours() === hour)
              const canCreateInSlot = slotEvents.length === 0 && onCreateEvent
              const SlotElement = canCreateInSlot ? "button" : "div"
              return (
                <SlotElement
                  key={`${day.toISOString()}-${hour}`}
                  {...(canCreateInSlot
                    ? { type: "button" as const, onClick: () => onCreateEvent(withTime(day, hour)) }
                    : {})}
                  className="min-h-16 border-b border-r p-0.5 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="space-y-1">
                    {slotEvents.map((event) => (
                      // No `compact`: the hour is already in the time gutter, so
                      // the pill shows just the title — identical to the month pills.
                      <EventPill
                        key={event.item.id}
                        event={event}
                        onClick={onEventClick}
                      />
                    ))}
                  </div>
                </SlotElement>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

interface DayCalendarProps {
  visibleDate: Date
  eventsByDay: Map<string, CalendarEvent[]>
  onEventClick?: (event: Item) => void
  onCreateEvent?: (date: Date) => void
}

function DayCalendar({ visibleDate, eventsByDay, onEventClick, onCreateEvent }: DayCalendarProps) {
  const dayEvents = getEventsForDay(eventsByDay, visibleDate)

  return (
    <div>
      <div className="border-b bg-muted/20 px-4 py-3">
        <h3 className="font-semibold">{formatDayLabel(visibleDate)}</h3>
        <p className="text-sm text-muted-foreground">
          {dayEvents.length === 1 ? "1 Event" : `${dayEvents.length} Events`}
        </p>
      </div>

      <div>
        {TIME_SLOTS.map((hour) => {
          const slotEvents = dayEvents.filter((event) => event.start.getHours() === hour)
          const canCreateInSlot = slotEvents.length === 0 && onCreateEvent
          const SlotElement = canCreateInSlot ? "button" : "div"
          return (
            <SlotElement
              key={hour}
              {...(canCreateInSlot
                ? { type: "button" as const, onClick: () => onCreateEvent(withTime(visibleDate, hour)) }
                : {})}
              className="grid min-h-20 w-full grid-cols-[72px_1fr] border-b text-left transition-colors hover:bg-muted/40"
            >
              <div className="border-r bg-muted/20 px-2 py-3 text-right text-xs text-muted-foreground">
                {String(hour).padStart(2, "0")}:00
              </div>
              <div className="space-y-2 p-2">
                {slotEvents.map((event) => (
                  <EventCard
                    key={event.item.id}
                    event={event}
                    onClick={onEventClick}
                  />
                ))}
              </div>
            </SlotElement>
          )
        })}
      </div>
    </div>
  )
}

interface EventListProps {
  events: CalendarEvent[]
  onEventClick?: (event: Item) => void
}

function EventList({ events, onEventClick }: EventListProps) {
  const groups = useMemo(() => groupEventsByDay(events), [events])

  if (events.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
        <CalendarDays className="mb-3 h-8 w-8" />
        Keine Events im sichtbaren Zeitraum
      </div>
    )
  }

  return (
    <div className="max-h-[720px] overflow-y-auto">
      {groups.map((group) => (
        <div key={group.key} className="border-b">
          <div className="sticky top-0 z-10 border-b bg-card/95 px-4 py-3 backdrop-blur">
            <h3 className="font-semibold">{formatDayLabel(group.date)}</h3>
            <p className="text-sm text-muted-foreground">
              {group.events.length === 1 ? "1 Event" : `${group.events.length} Events`}
            </p>
          </div>
          <div className="space-y-3 p-4">
            {group.events.map((event) => (
              <EventCard
                key={event.item.id}
                event={event}
                onClick={onEventClick}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

interface EventPillProps {
  event: CalendarEvent
  compact?: boolean
  onClick?: (event: Item) => void
}

function EventPill({ event, compact = false, onClick }: EventPillProps) {
  const resolveGroupColor = useContext(CalendarGroupColorContext)
  const activeItemId = useContext(CalendarActiveItemContext)
  const groupColor = resolveGroupColor(event.item)
  const color = getItemColor(event.item, { groupColor })
  const isActive = activeItemId === event.item.id
  return (
    <button
      type="button"
      title={event.title}
      aria-current={isActive ? "true" : undefined}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation()
        onClick?.(event.item)
      }}
      style={{
        backgroundColor: color,
        color: getReadableTextColor(color),
        // Soft glow in the group colour for the item open in the shared panel.
        ...(isActive ? getActivePanelGlow(groupColor) : null),
      }}
      className="block w-full truncate rounded-md px-2 py-1 text-left text-xs font-medium transition-opacity hover:opacity-90"
    >
      {compact
        ? event.allDay
          ? event.title
          : `${formatTime(event.start)} ${event.title}`
        : event.title}
    </button>
  )
}

interface EventCardProps {
  event: CalendarEvent
  onClick?: (event: Item) => void
}

function EventCard({ event, onClick }: EventCardProps) {
  const activeItemId = useContext(CalendarActiveItemContext)
  const resolveGroupColor = useContext(CalendarGroupColorContext)
  const isActive = activeItemId === event.item.id
  // The calendar list-view card uses ItemPreview with `author={null}`
  // (the date group header above already carries the temporal context),
  // a TypeBadge in the header slot, and `ItemTimeRange` in the meta
  // slot — the day is implied by the grouping, so we only need the
  // time-of-day and location. Tags + description come from
  // ItemPreview's defaults.
  //
  // `event.location` is the pre-normalised label that
  // `toCalendarEvent()` already computed (locationName ?? address).
  // Pass it through so the card uses the same fallback as the rest of
  // the calendar UI.
  return (
    <ItemPreview
      item={event.item}
      author={null}
      style={isActive ? getActivePanelGlow(resolveGroupColor(event.item)) : undefined}
      onClick={onClick ? () => onClick(event.item) : undefined}
      headerAdornment={
        <ItemTypeBadge type={event.item.type} />
      }
      metaAdornment={<ItemTimeRange item={event.item} locationLabel={event.location} />}
    />
  )
}
