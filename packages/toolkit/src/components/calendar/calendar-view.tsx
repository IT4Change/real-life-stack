"use client"

import { useMemo, useState } from "react"
import {
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns,
  Filter,
  Grid3x3,
  List,
  MapPin,
  Plus,
  Tag,
} from "lucide-react"
import { Button } from "../primitives/button"
import { cn } from "../../lib/utils"
import { isAllDayDate, parseEventDate } from "../../lib/date-utils"
import type { Item } from "@real-life-stack/data-interface"

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
]
const DAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]
const LONG_DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"]
const TIME_SLOTS = Array.from({ length: 18 }, (_, index) => index + 6)

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

const EVENT_TYPE_STYLES: Record<string, string> = {
  event: "bg-violet-600 text-white hover:bg-violet-700",
  project: "bg-blue-600 text-white hover:bg-blue-700",
  offer: "bg-emerald-600 text-white hover:bg-emerald-700",
  task: "bg-amber-500 text-amber-950 hover:bg-amber-600",
  quest: "bg-rose-600 text-white hover:bg-rose-700",
}

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

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
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
    tags: getStringArray(item.data.tags),
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

function getEventTypeClass(type: string): string {
  return EVENT_TYPE_STYLES[type] ?? "bg-primary text-primary-foreground hover:bg-primary/90"
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

function formatEventTime(start: Date, end?: Date, allDay?: boolean): string {
  if (allDay) return "Ganztägig"
  const startTime = formatTime(start)
  if (!end) return `${startTime} Uhr`
  return `${startTime} - ${formatTime(end)} Uhr`
}

function formatDayLabel(date: Date): string {
  return `${LONG_DAY_NAMES[date.getDay()]}, ${date.getDate()}. ${MONTH_NAMES[date.getMonth()]}`
}

export interface CalendarViewProps {
  events: Item[]
  initialDate?: Date | string
  initialViewMode?: CalendarViewMode
  currentUserId?: string
  onEventClick?: (event: Item) => void
  onCreateEvent?: (date: Date) => void
  className?: string
}

export function CalendarView({
  events,
  initialDate,
  initialViewMode = "month",
  currentUserId,
  onEventClick,
  onCreateEvent,
  className,
}: CalendarViewProps) {
  const today = useMemo(() => getInitialDate(initialDate), [initialDate])
  const [visibleDate, setVisibleDate] = useState(today)
  const [selectedDate, setSelectedDate] = useState(today)
  const [viewMode, setViewMode] = useState<CalendarViewMode>(initialViewMode)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [hiddenTypes, setHiddenTypes] = useState<string[]>([])
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all")
  const [myEventsOnly, setMyEventsOnly] = useState(false)

  const calendarEvents = useMemo(
    () => events.map(toCalendarEvent).filter((event): event is CalendarEvent => event !== null).sort(compareEvents),
    [events],
  )

  const eventTypes = useMemo(
    () => [...new Set(calendarEvents.map((event) => event.item.type))].sort(),
    [calendarEvents],
  )

  const filteredEvents = useMemo(
    () =>
      calendarEvents.filter((event) => {
        if (hiddenTypes.includes(event.item.type)) return false
        if (locationFilter === "with" && !event.location) return false
        if (locationFilter === "without" && event.location) return false
        if (myEventsOnly && currentUserId && event.item.createdBy !== currentUserId) return false
        return true
      }),
    [calendarEvents, currentUserId, hiddenTypes, locationFilter, myEventsOnly],
  )

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

  const visibleEvents = useMemo(
    () => getPeriodEvents(filteredEvents, visibleDate, viewMode).sort(compareEvents),
    [filteredEvents, visibleDate, viewMode],
  )

  const activeFilterCount =
    hiddenTypes.length + (locationFilter !== "all" ? 1 : 0) + (myEventsOnly && currentUserId ? 1 : 0)

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

  function toggleType(type: string) {
    setHiddenTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    )
  }

  function resetFilters() {
    setHiddenTypes([])
    setLocationFilter("all")
    setMyEventsOnly(false)
  }

  return (
    <div className={cn("w-full overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm", className)}>
      <div className="flex flex-col gap-3 border-b bg-muted/40 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Vorheriger Zeitraum"
            onClick={() => movePeriod(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 px-1 sm:min-w-56">
            <h2 className="truncate text-lg font-semibold">{getHeaderLabel(visibleDate, viewMode)}</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToday}
          >
            Heute
          </Button>
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

          <Button
            variant={filtersOpen ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Filter"
            onClick={() => setFiltersOpen((open) => !open)}
            className="relative"
          >
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {onCreateEvent && (
            <Button
              size="icon-sm"
              aria-label="Event erstellen"
              onClick={() => onCreateEvent(selectedDate)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className="grid gap-4 border-b bg-muted/20 p-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div>
            <div className="mb-2 text-sm font-medium">Typen</div>
            <div className="flex flex-wrap gap-2">
              {eventTypes.map((type) => {
                const active = !hiddenTypes.includes(type)
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleType(type)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {getTypeLabel(type)}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">Ort</div>
            <div className="flex rounded-lg bg-muted p-1">
              {(["all", "with", "without"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLocationFilter(value)}
                  className={cn(
                    "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                    locationFilter === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value === "all" ? "Alle" : value === "with" ? "Mit Ort" : "Ohne Ort"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUserId && (
              <button
                type="button"
                aria-pressed={myEventsOnly}
                onClick={() => setMyEventsOnly((value) => !value)}
                className={cn(
                  "h-8 rounded-md border px-3 text-sm font-medium transition-colors",
                  myEventsOnly
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                Nur meine
              </button>
            )}
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Zurücksetzen
            </Button>
          </div>
        </div>
      )}

      {viewMode === "month" && (
        <MonthCalendar
          visibleDate={visibleDate}
          selectedDate={selectedDate}
          today={today}
          eventsByDay={eventsByDay}
          onSelectDate={(date) => {
            setSelectedDate(date)
            setVisibleDate(date)
          }}
          onOpenDay={(date) => {
            setSelectedDate(date)
            setVisibleDate(date)
            setViewMode("day")
          }}
          onEventClick={onEventClick}
        />
      )}

      {viewMode === "week" && (
        <WeekCalendar
          visibleDate={visibleDate}
          eventsByDay={eventsByDay}
          onSelectDate={(date) => {
            setSelectedDate(date)
            setVisibleDate(date)
            setViewMode("day")
          }}
          onEventClick={onEventClick}
          onCreateEvent={onCreateEvent}
        />
      )}

      {viewMode === "day" && (
        <DayCalendar
          visibleDate={visibleDate}
          eventsByDay={eventsByDay}
          onEventClick={onEventClick}
          onCreateEvent={onCreateEvent}
        />
      )}

      {viewMode === "list" && (
        <EventList
          events={visibleEvents}
          onEventClick={onEventClick}
        />
      )}
    </div>
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
}

function MonthCalendar({
  visibleDate,
  selectedDate,
  today,
  eventsByDay,
  onSelectDate,
  onOpenDay,
  onEventClick,
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
              "group min-h-20 border-b border-r p-1.5 text-left align-top transition-colors sm:min-h-28 lg:min-h-32",
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

            <div className="mt-2 flex flex-wrap gap-1 md:hidden">
              {day.events.slice(0, 4).map((event) => (
                <span
                  key={event.item.id}
                  className={cn("h-1.5 w-1.5 rounded-full", getEventTypeClass(event.item.type))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface WeekCalendarProps {
  visibleDate: Date
  eventsByDay: Map<string, CalendarEvent[]>
  onSelectDate: (date: Date) => void
  onEventClick?: (event: Item) => void
  onCreateEvent?: (date: Date) => void
}

function WeekCalendar({
  visibleDate,
  eventsByDay,
  onSelectDate,
  onEventClick,
  onCreateEvent,
}: WeekCalendarProps) {
  const weekStart = startOfWeek(visibleDate)
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[72px_repeat(7,minmax(96px,1fr))] border-b bg-muted/30 text-xs font-semibold text-muted-foreground">
          <div className="px-2 py-2 text-center">Zeit</div>
          {weekDays.map((day) => (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDate(day)}
              className="px-2 py-2 text-center hover:bg-muted"
            >
              <span>{DAY_NAMES[day.getDay()]}</span>
              <span className="ml-1 text-foreground">{day.getDate()}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[72px_repeat(7,minmax(96px,1fr))]">
          {TIME_SLOTS.map((hour) => (
            <div key={hour} className="contents">
              <div className="border-b border-r bg-muted/20 px-2 py-3 text-right text-xs text-muted-foreground">
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
                    className="min-h-16 border-b border-r p-1 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="space-y-1">
                      {slotEvents.map((event) => (
                        <EventPill
                          key={event.item.id}
                          event={event}
                          compact
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
  return (
    <button
      type="button"
      title={event.title}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation()
        onClick?.(event.item)
      }}
      className={cn(
        "block w-full truncate rounded-md px-2 py-1 text-left text-xs font-medium transition-colors",
        getEventTypeClass(event.item.type),
      )}
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
  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation()
        onClick?.(event.item)
      }}
      className="w-full rounded-lg border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 h-3 w-3 shrink-0 rounded-full", getEventTypeClass(event.item.type))} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h4 className="font-semibold">{event.title}</h4>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {getTypeLabel(event.item.type)}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatEventTime(event.start, event.end, event.allDay)}
            </span>
            {event.location && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate">{event.location}</span>
              </span>
            )}
            {event.tags.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" />
                {event.tags.join(" · ")}
              </span>
            )}
          </div>

          {event.description && (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {event.description}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}
