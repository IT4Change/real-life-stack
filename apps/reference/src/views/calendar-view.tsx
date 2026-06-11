import { useState } from "react"
import {
  CalendarView as ToolkitCalendarView,
  AdaptivePanel,
  ItemDetailPanel,
  ItemPreview,
  ItemTypeBadge,
  ItemTimeRange,
  ReactionBar,
  useItems,
  useMembers,
  useCurrentUser,
} from "@real-life-stack/toolkit"
import type { Item, User } from "@real-life-stack/data-interface"

export function CalendarViewWrapper({ groupId }: { groupId: string }) {
  // Calendar activates on data.start (event/v1). Cross-context items
  // (e.g. an event with a place) appear here too.
  const { data: events } = useItems({ hasField: ["start"] })
  const { data: members } = useMembers(groupId)
  const { data: currentUser } = useCurrentUser()

  const [detailItem, setDetailItem] = useState<Item | null>(null)

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
        onEventClick={(event) => setDetailItem(event)}
      />

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
