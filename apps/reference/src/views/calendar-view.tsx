import { useCallback, useMemo } from "react"
import {
  CalendarView as ToolkitCalendarView,
  CreateFab,
  ItemPreview,
  ItemTypeBadge,
  ItemScopeBadge,
  ItemTimeRange,
  ReactionBar,
  useItems,
  useMembers,
  useCurrentUser,
  useGroups,
  usePersonalGroupId,
  useModulePanel,
  useItemGroupColorResolver,
} from "@real-life-stack/toolkit"
import type { User } from "@real-life-stack/data-interface"
import { useCreate, useRegisterCreate, type CreateConfig } from "../create-host"
import { useItemFocus } from "../hooks/use-item-focus"
import { useRegisterDetail, type DetailConfig } from "../detail-host"
import { mapComposerSubmission, withGroupOptions } from "../composer-mapping"
import { CALENDAR_CREATE_TYPES } from "../content-types"
import { useItemDetailEdit } from "../hooks/use-item-detail-edit"

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
  // Groups + personal space for the sharing-scope picker in the composer.
  const { data: groups } = useGroups()
  const personalGroupId = usePersonalGroupId()
  const currentSpace = groupId === "__overview__" ? undefined : groupId
  // Scope badge (group/„Privat") is only shown in the aggregate („Mein Netzwerk")
  // — inside a single space it would be redundant.
  const isOverview = groupId === "__overview__"

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
  const { itemId: focusedId, focusItem } = useItemFocus()

  // Create offers events; the detail edit uses the full registry (shared hook).
  const calendarCreateTypes = useMemo(
    () => withGroupOptions(CALENDAR_CREATE_TYPES, groups, currentSpace, personalGroupId),
    [groups, currentSpace, personalGroupId],
  )
  const editConfig = useItemDetailEdit(members)

  const { startCreate, patchCreate, isComposing } = useCreate()
  const createConfig = useMemo<CreateConfig>(
    () => ({ contentTypes: calendarCreateTypes, mapper: mapComposerSubmission, shell: "sheet" }),
    [calendarCreateTypes],
  )
  useRegisterCreate("calendar", createConfig)

  // Resolve event author for the detail-panel ItemPreview. Calendar
  // list cards themselves render with `author={null}` (the date group
  // already carries temporal context), so the panel is the only place
  // we need a User.
  const resolveAuthor = useCallback(
    (createdBy: string): User | undefined => {
      const member = members.find((m) => m.id === createdBy)
      if (member) return member
      if (currentUser?.id === createdBy) return currentUser
      return undefined
    },
    [members, currentUser],
  )

  // Register the calendar's detail config with the host (which owns the panel +
  // read↔edit for the focused item). Memoised so it only re-registers when
  // author resolution changes.
  const detailConfig = useMemo<DetailConfig>(
    () => ({
      renderRead: (current, actions) => (
        <ItemPreview
          item={current}
          author={resolveAuthor(current.createdBy)}
          headerAdornment={
            <>
              <ItemTypeBadge type={current.type} />
              {isOverview && <ItemScopeBadge item={current} />}
            </>
          }
          actions={actions}
          metaAdornment={<ItemTimeRange item={current} />}
          footerAdornment={
            current.type !== "task" ? <ReactionBar itemId={current.id} /> : undefined
          }
        />
      ),
      ...editConfig,
      renderCommentReactions: (commentId) => <ReactionBar itemId={commentId} />,
      onShare: () => {
        void navigator.clipboard?.writeText(window.location.href)
      },
    }),
    [resolveAuthor, editConfig, isOverview],
  )
  useRegisterDetail("calendar", detailConfig)

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

  // startCreate navigates to `?compose=event` (dropping any focused item), so the
  // host opens the create form. The save path survives a switch to the Map for
  // location picking (the composer persists while `?compose` is carried).
  const openComposer = useCallback(() => startCreate("event"), [startCreate])

  // Click on an empty day/slot → composer prefilled with that date/time. A bare
  // day click (month) lands at local midnight → keep it date-only so no time is
  // shown until the user sets one; a time-slot click (week/day) keeps its hour.
  const openComposerAt = useCallback((date: Date) => {
    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0
    const start = hasTime ? toLocalDatetime(date) : toLocalDate(date)
    // Composer already open (user may be typing) → change only the date, keep the
    // rest. Otherwise open a fresh composer prefilled with the clicked date.
    if (isComposing) patchCreate({ start })
    else startCreate("event", { start })
  }, [isComposing, patchCreate, startCreate])

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
