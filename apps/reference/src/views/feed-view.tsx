import { useState, useMemo, useCallback } from "react"
import {
  ContentComposer,
  type ContentTypeConfig,
  AdaptivePanel,
  ItemDetailPanel,
  ReactionBar,
  FeedItem,
  FeedComposerTrigger,
  useItems,
  useMembers,
  useCurrentUser,
  useItemEditor,
  type ItemEditorMapper,
} from "@real-life-stack/toolkit"
import type { Item } from "@real-life-stack/data-interface"

export function FeedView({ groupId }: { groupId: string }) {
  // Spec 06 §"Verhältnis zwischen Schema- und Feldfiltern": modules activate
  // items by field presence, not the legacy `type` UI hint.
  // - Posts carry data.content (base/v1)
  // - Events carry data.start (event/v1)
  // Cross-context items (e.g. an event-with-place) naturally show up in
  // multiple modules without any extra handling.
  const { data: posts } = useItems({ hasField: ["content"] })
  const { data: events } = useItems({ hasField: ["start"] })
  const { data: members } = useMembers(groupId)
  const { data: currentUser } = useCurrentUser()

  // Merge posts + events, dedupe, sort newest first.
  // Dedupe is load-bearing: with hasField filters, a single item can
  // satisfy both queries (a post that also carries data.start, an event
  // with data.content, …) and would otherwise render twice.
  //
  // Comment items also carry `data.content` (use-comments writes them
  // as `type: "comment"` with `data.content`). Without an exclusion
  // they'd surface in the feed as if they were posts. Use the `type`
  // UI-hint as a discriminator — spec 06 keeps `type` valid for that
  // role even when activation runs on field presence. A future
  // comment/v1 vocab + hasSchema would make this redundant.
  const feedItems = useMemo(() => {
    const merged = [...posts, ...events].filter((it) => it.type !== "comment")
    const unique = Array.from(new Map(merged.map((it) => [it.id, it])).values())
    return unique.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [posts, events])

  // Resolve author info
  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  )

  const resolveAuthor = useCallback((createdBy: string) => {
    const member = memberMap.get(createdBy)
    if (member) return { name: member.displayName ?? member.id, avatar: member.avatarUrl }
    if (currentUser && createdBy === currentUser.id) return { name: currentUser.displayName ?? currentUser.id, avatar: currentUser.avatarUrl }
    return { name: createdBy }
  }, [memberMap, currentUser])

  // Detail panel state
  const [detailItem, setDetailItem] = useState<Item | null>(null)

  // Content type configs for the composer
  const feedContentTypes: ContentTypeConfig[] = useMemo(() => [
    {
      id: "post",
      label: "Post",
      defaultWidgets: ["text"],
      submitLabel: "Posten",
    },
    {
      id: "event",
      label: "Veranstaltung",
      defaultWidgets: ["title", "text", "date", "location"],
      submitLabel: "Erstellen",
    },
  ], [])

  // ContentComposer surfaces the free-text field as `text`; spec base/v1
  // uses `content` for posts and `description` for items that already
  // carry a structured payload (events here). Without this mapping a
  // composer-created post lands in `data.text`, which FeedItem doesn't
  // render and `hasField: ["content"]` doesn't match.
  //
  // We also strip empty defaults from the composer state (it initializes
  // status/group/title/text/media/people/tags to "" or []). Without this
  // a post would ship with `data.status = ""` and match the Kanban
  // filter `hasField: ["status"]`, leaking it onto the board.
  const mapSubmission = useCallback<ItemEditorMapper>((submission) => {
    const { text, tags: submittedTags, ...rest } = submission.data
    const cleaned = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => {
        if (v === "" || v === null || v === undefined) return false
        if (Array.isArray(v) && v.length === 0) return false
        return true
      }),
    )
    const itemData = submission.contentType === "post"
      ? { ...cleaned, ...(text ? { content: text } : {}) }
      : { ...cleaned, ...(text ? { description: text } : {}) }
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

  return (
    <div className="space-y-4">
      {/* Composer trigger — morphs into fullscreen modal */}
      <FeedComposerTrigger
        placeholder="Was gibt's Neues?"
        userName={currentUser?.displayName}
        userAvatar={currentUser?.avatarUrl}
      >
        {({ onClose, initialText }) => (
          <div className="flex flex-col h-full">
            <ContentComposer
              className="p-4 sm:p-6 flex-1"
              contentTypes={feedContentTypes}
              initialData={initialText ? { text: initialText } : undefined}
              onSubmit={(data) => { editor.submit(data); onClose() }}
              onCancel={onClose}
              showPreview={false}
            />
          </div>
        )}
      </FeedComposerTrigger>

      {/* Feed items */}
      <div className="space-y-4">
        {feedItems.map((item) => (
          <FeedItem
            key={item.id}
            item={item}
            author={resolveAuthor(item.createdBy)}
            onClick={() => setDetailItem(item)}
            reactionSlot={item.type !== "task" ? <ReactionBar itemId={item.id} /> : undefined}
            commentCount={(item.data as Record<string, unknown>).commentCount as number | undefined}
            onCommentClick={() => setDetailItem(item)}
          />
        ))}
      </div>

      {/* Detail panel */}
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
              <FeedItem
                item={detailItem}
                author={resolveAuthor(detailItem.createdBy)}
                reactionSlot={detailItem.type !== "task" ? <ReactionBar itemId={detailItem.id} /> : undefined}
              />
            </div>
          </ItemDetailPanel>
        )}
      </AdaptivePanel>
    </div>
  )
}
