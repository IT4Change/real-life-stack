import { useCallback, useMemo } from "react"
import {
  CalendarView as ToolkitCalendarView,
  ContentComposer,
  CreateFab,
  type ContentTypeConfig,
  ItemDetailPanel,
  ItemPreview,
  ItemTypeBadge,
  ItemTimeRange,
  ReactionBar,
  LocationPickerMap,
  nominatimGeocode,
  useItems,
  useMembers,
  useCurrentUser,
  useItemEditor,
  useModulePanel,
  type ItemEditorMapper,
} from "@real-life-stack/toolkit"
import { MapLibreMapAdapter } from "@real-life-stack/toolkit/maplibre"
import type { Item, User } from "@real-life-stack/data-interface"

// Stable factory so the inline location-picker map mounts once (not per render).
const createMapPickerAdapter = () => new MapLibreMapAdapter()

export function CalendarViewWrapper({ groupId }: { groupId: string }) {
  // Calendar activates on data.start (event/v1). Cross-context items
  // (e.g. an event with a place) appear here too.
  const { data: events } = useItems({ hasField: ["start"] })
  // Cross-space aggregate ("Mein Netzwerk"): useMembers(null) yields
  // the union of all known members, so authors of items pulled in
  // from other spaces still resolve to their User.
  const { data: members } = useMembers(groupId === "__overview__" ? null : groupId)
  const { data: currentUser } = useCurrentUser()

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

  const editor = useItemEditor({
    currentUserId: currentUser?.id,
    mapSubmission,
  })

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

  // Composer opens into the shared module panel (Ebene 1) — sidebar on
  // desktop, drawer on mobile. (Previously a Radix Sheet that stayed a
  // sidebar even on phones.) The Feed keeps its own fullscreen-morph shell.
  const openComposer = useCallback(() => {
    editor.openCreate()
    modulePanel.open({
      kind: "composer",
      content: (
        <ContentComposer
          className="p-4 sm:p-6"
          contentTypes={calendarContentTypes}
          onSubmit={async (data) => {
            const result = await editor.submit(data)
            if (result) modulePanel.close()
          }}
          onCancel={() => modulePanel.close()}
          showPreview={false}
          geocode={nominatimGeocode}
          renderLocationMap={(slot) => (
            <LocationPickerMap
              createAdapter={createMapPickerAdapter}
              position={slot.position}
              onPositionChange={slot.onPositionChange}
            />
          )}
        />
      ),
      onClose: () => editor.close(),
    })
  }, [editor, modulePanel, calendarContentTypes])

  return (
    <>
      <ToolkitCalendarView
        events={events}
        currentUserId={currentUser?.id}
        onEventClick={openDetail}
      />

      <CreateFab onClick={openComposer} label="Veranstaltung erstellen" />
    </>
  )
}
