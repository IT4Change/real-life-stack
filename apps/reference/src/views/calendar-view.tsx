import { useCallback, useMemo } from "react"
import {
  CalendarView as ToolkitCalendarView,
  CreateFab,
  type ContentTypeConfig,
  ItemDetailPanel,
  ItemPreview,
  ItemTypeBadge,
  ItemTimeRange,
  ReactionBar,
  useItems,
  useMembers,
  useCurrentUser,
  useModulePanel,
  useItemGroupColorResolver,
  type ItemEditorMapper,
} from "@real-life-stack/toolkit"
import type { Item, User } from "@real-life-stack/data-interface"
import { useComposerHost } from "../composer-host"

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

  const calendarContentTypes: ContentTypeConfig[] = useMemo(() => [
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

  const openDetail = useCallback((event: Item) => {
    modulePanel.open({
      kind: "detail",
      itemId: event.id,
      content: (
        <ItemDetailPanel
          itemId={event.id}
          renderCommentReactions={(commentId) => <ReactionBar itemId={commentId} />}
        >
          <div className="p-4">
            <ItemPreview
              item={event}
              author={resolveAuthor(event.createdBy)}
              headerAdornment={<ItemTypeBadge type={event.type} />}
              metaAdornment={<ItemTimeRange item={event} />}
              footerAdornment={
                event.type !== "task" ? <ReactionBar itemId={event.id} /> : undefined
              }
            />
          </div>
        </ItemDetailPanel>
      ),
    })
  }, [modulePanel, members, currentUser])

  // Composer opens via the app-level host, so its save path survives a switch
  // to the Map module for location picking. The Feed keeps its own
  // fullscreen-morph shell.
  const openComposer = useCallback(() => {
    openCreateComposer({ contentTypes: calendarContentTypes, mapper: mapSubmission })
  }, [openCreateComposer, calendarContentTypes, mapSubmission])

  // Click on an empty day/slot → composer prefilled with that date/time. A bare
  // day click (month) lands at local midnight → keep it date-only so no time is
  // shown until the user sets one; a time-slot click (week/day) keeps its hour.
  const openComposerAt = useCallback((date: Date) => {
    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0
    const start = hasTime ? toLocalDatetime(date) : toLocalDate(date)
    // Composer already open (user may be typing) → change only the date, keep the
    // rest. Otherwise open a fresh composer prefilled with the clicked date.
    if (modulePanel.current?.kind === "composer") {
      patchComposerData({ start })
    } else {
      openCreateComposer({
        contentTypes: calendarContentTypes,
        mapper: mapSubmission,
        initialData: { start },
      })
    }
  }, [openCreateComposer, patchComposerData, modulePanel, calendarContentTypes, mapSubmission])

  return (
    <>
      <ToolkitCalendarView
        events={events}
        currentUserId={currentUser?.id}
        resolveItemGroupColor={resolveItemGroupColor}
        activeItemId={modulePanel.current?.itemId}
        onEventClick={openDetail}
        onCreateEvent={openComposerAt}
      />

      <CreateFab onClick={openComposer} label="Veranstaltung erstellen" />
    </>
  )
}
