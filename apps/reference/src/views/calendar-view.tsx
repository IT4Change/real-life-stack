import { useCallback, useMemo, useState } from "react"
import {
  CalendarView as ToolkitCalendarView,
  AdaptivePanel,
  ContentComposer,
  CreateFab,
  type ContentTypeConfig,
  ItemDetailPanel,
  ItemPreview,
  ItemTypeBadge,
  ItemTimeRange,
  ReactionBar,
  Sheet,
  SheetContent,
  useItems,
  useMembers,
  useCurrentUser,
  useItemEditor,
  type ItemEditorMapper,
} from "@real-life-stack/toolkit"
import type { Item, User } from "@real-life-stack/data-interface"

export function CalendarViewWrapper({ groupId }: { groupId: string }) {
  // Calendar activates on data.start (event/v1). Cross-context items
  // (e.g. an event with a place) appear here too.
  const { data: events } = useItems({ hasField: ["start"] })
  // Cross-space aggregate ("Mein Netzwerk"): useMembers(null) yields
  // the union of all known members, so authors of items pulled in
  // from other spaces still resolve to their User.
  const { data: members } = useMembers(groupId === "__overview__" ? null : groupId)
  const { data: currentUser } = useCurrentUser()

  const [detailItem, setDetailItem] = useState<Item | null>(null)

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

  return (
    <>
      <ToolkitCalendarView
        events={events}
        currentUserId={currentUser?.id}
        onEventClick={(event) => setDetailItem(event)}
      />

      <CreateFab onClick={() => editor.openCreate()} label="Veranstaltung erstellen" />

      <Sheet open={editor.isOpen} onOpenChange={(open) => { if (!open) editor.close() }}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <ContentComposer
            className="p-4 sm:p-6"
            contentTypes={calendarContentTypes}
            onSubmit={async (data) => {
              const result = await editor.submit(data)
              if (result) editor.close()
            }}
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
                metaAdornment={<ItemTimeRange item={detailItem} />}
                footerAdornment={
                  detailItem.type !== "task" ? <ReactionBar itemId={detailItem.id} /> : undefined
                }
              />
            </div>
          </ItemDetailPanel>
        )}
      </AdaptivePanel>
    </>
  )
}
