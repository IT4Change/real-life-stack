import { useCallback, useMemo } from "react"
import {
  CalendarView as ToolkitCalendarView,
  CreateFab,
  type ContentTypeConfig,
  ItemPreview,
  ItemTypeBadge,
  ItemTimeRange,
  ReactionBar,
  nominatimGeocode,
  nominatimReverseGeocode,
  useItems,
  useMembers,
  useCurrentUser,
  useModulePanel,
  useItemGroupColorResolver,
} from "@real-life-stack/toolkit"
import type { User } from "@real-life-stack/data-interface"
import { useComposerHost } from "../composer-host"
import { useItemFocus } from "../hooks/use-item-focus"
import { useRegisterDetail, type DetailConfig } from "../detail-host"
import { mapComposerSubmission, itemToComposerData } from "../composer-mapping"

const pad2 = (n: number) => String(n).padStart(2, "0")
/** Local `datetime-local` string (YYYY-MM-DDTHH:mm) — used for a time-slot click. */
function toLocalDatetime(d: Date): string {
  return `${toLocalDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
/** Local date-only string (YYYY-MM-DD) — used for a bare day click (no time yet). */
function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function CalendarViewWrapper({ groupId }: { groupId: string }) {
  // Calendar activates on data.start (event/v1). Cross-context items
  // (e.g. an event with a place) appear here too.
  const { data: events } = useItems({ hasField: ["start"] })
  // Cross-space aggregate ("Mein Netzwerk"): useMembers(null) yields
  // the union of all known members, so authors of items pulled in
  // from other spaces still resolve to their User.
  const { data: members } = useMembers(groupId === "__overview__" ? null : groupId)
  const { data: currentUser } = useCurrentUser()

  // Item colour falls back to the colour of the group an item was *created* in
  // (origin group) — so the aggregate ("Mein Netzwerk") view shows each item in
  // its origin group's colour. Shared resolver, also used for the active glow.
  const resolveItemGroupColor = useItemGroupColorResolver(
    groupId === "__overview__" ? undefined : groupId,
  )

  const modulePanel = useModulePanel()
  // URL is the single source of truth for the focused event: a click writes
  // `/{scope}/calendar/{id}`, the effect below opens the detail and the calendar
  // jumps to its month (focusDate); browser-back clears it and closes the panel.
  const { itemId: focusedId, focusItem, clearFocus } = useItemFocus()

  const calendarContentTypes: ContentTypeConfig[] = useMemo(() => [
    {
      id: "event",
      label: "Veranstaltung",
      defaultWidgets: ["title", "text", "date", "location"],
      submitLabel: "Erstellen",
    },
  ], [])

  const { openComposer: openCreateComposer, patchData: patchComposerData } = useComposerHost()

  // Resolve event author for the detail-panel ItemPreview. Calendar
  // list cards themselves render with `author={null}` (the date group
  // already carries temporal context), so the panel is the only place
  // we need a User.
  const resolveAuthor = (createdBy: string): User | undefined => {
    const member = members.find((m) => m.id === createdBy)
    if (member) return member
    if (currentUser?.id === createdBy) return currentUser
    return undefined
  }

  // Register the calendar's detail config with the host (which owns the panel +
  // read↔edit for the focused item). Memoised so it only re-registers when
  // author resolution changes.
  const detailConfig = useMemo<DetailConfig>(
    () => ({
      renderRead: (current, actions) => (
        <ItemPreview
          item={current}
          author={resolveAuthor(current.createdBy)}
          headerAdornment={<ItemTypeBadge type={current.type} />}
          actions={actions}
          metaAdornment={<ItemTimeRange item={current} />}
          footerAdornment={
            current.type !== "task" ? <ReactionBar itemId={current.id} /> : undefined
          }
        />
      ),
      contentTypes: calendarContentTypes,
      mapper: mapComposerSubmission,
      editInitialData: itemToComposerData,
      composerProps: { geocode: nominatimGeocode, reverseGeocode: nominatimReverseGeocode },
      renderCommentReactions: (commentId) => <ReactionBar itemId={commentId} />,
      onShare: () => {
        void navigator.clipboard?.writeText(window.location.href)
      },
    }),
    [resolveAuthor, calendarContentTypes],
  )
  useRegisterDetail(detailConfig)

  // The URL-focused event (from the loaded list) + the month to reveal it in.
  const focusedEvent = useMemo(
    () => (focusedId ? events.find((e) => e.id === focusedId) : undefined),
    [focusedId, events],
  )
  const focusDate = useMemo(() => {
    const start = focusedEvent?.data.start
    if (typeof start !== "string") return undefined
    const d = new Date(start)
    return Number.isNaN(d.getTime()) ? undefined : d
  }, [focusedEvent])

  // The detail panel is owned by the host; the calendar only drives the month
  // reveal (focusDate prop) from the URL focus.

  const clearFocusForComposer = useCallback(() => {
    // Opening the create composer replaces the detail panel, so clear the URL
    // focus too — otherwise re-clicking the same event is a no-op (`focusItem`
    // sees the URL already there). The host releases the panel without closing
    // the composer (it only closes its own `kind: "detail"`).
    clearFocus()
  }, [clearFocus])

  // Composer opens via the app-level host, so its save path survives a switch
  // to the Map module for location picking. The Feed keeps its own
  // fullscreen-morph shell.
  const openComposer = useCallback(() => {
    clearFocusForComposer()
    openCreateComposer({ contentTypes: calendarContentTypes, mapper: mapComposerSubmission })
  }, [clearFocusForComposer, openCreateComposer, calendarContentTypes])

  // Click on an empty day/slot → composer prefilled with that date/time. A bare
  // day click (month) lands at local midnight → keep it date-only so no time is
  // shown until the user sets one; a time-slot click (week/day) keeps its hour.
  const openComposerAt = useCallback((date: Date) => {
    clearFocusForComposer()
    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0
    const start = hasTime ? toLocalDatetime(date) : toLocalDate(date)
    // Composer already open (user may be typing) → change only the date, keep the
    // rest. Otherwise open a fresh composer prefilled with the clicked date.
    if (modulePanel.current?.kind === "composer") {
      patchComposerData({ start })
    } else {
      openCreateComposer({
        contentTypes: calendarContentTypes,
        mapper: mapComposerSubmission,
        initialData: { start },
      })
    }
  }, [clearFocusForComposer, openCreateComposer, patchComposerData, modulePanel, calendarContentTypes])

  return (
    <>
      <ToolkitCalendarView
        events={events}
        currentUserId={currentUser?.id}
        resolveItemGroupColor={resolveItemGroupColor}
        activeItemId={modulePanel.current?.itemId}
        focusDate={focusDate}
        onEventClick={(event) => focusItem(event.id)}
        onCreateEvent={openComposerAt}
      />

      <CreateFab onClick={openComposer} label="Veranstaltung erstellen" />
    </>
  )
}
