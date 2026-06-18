import { useState, useMemo, useCallback } from "react"
import {
  ContentComposer,
  type ContentTypeConfig,
  ItemDetailPanel,
  useModulePanel,
  ReactionBar,
  ItemPreview,
  ItemTypeBadge,
  ItemMetaRow,
  ItemCommentCount,
  FeedComposerTrigger,
  FilterBar,
  emptyFilterBarValue,
  useFilterableItems,
  type FilterBarValue,
  type FilterTypeOption,
  useItems,
  useMembers,
  useCurrentUser,
  useItemEditor,
  cn,
  type ItemEditorMapper,
} from "@real-life-stack/toolkit"
import { Calendar, FileText, Search } from "lucide-react"
import { Input } from "@real-life-stack/toolkit"
import type { Item, User } from "@real-life-stack/data-interface"

const FEED_TYPES: FilterTypeOption[] = [
  { id: "post", label: "Posts", icon: FileText },
  { id: "event", label: "Events", icon: Calendar },
]

export function FeedView({ groupId }: { groupId: string }) {
  // Spec 06 §"Verhältnis zwischen Schema- und Feldfiltern": modules activate
  // items by field presence, not the legacy `type` UI hint.
  // - Posts carry data.content (base/v1)
  // - Events carry data.start (event/v1)
  // Cross-context items (e.g. an event-with-place) naturally show up in
  // multiple modules without any extra handling.
  const { data: posts } = useItems({ hasField: ["content"] })
  const { data: events } = useItems({ hasField: ["start"] })
  // `groupId === "__overview__"` is the cross-space aggregate view
  // ("Mein Netzwerk"). useMembers(null) returns the union of all
  // members the connector knows about, so author resolution still
  // resolves the items that surface here from other spaces.
  const { data: members } = useMembers(groupId === "__overview__" ? null : groupId)
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

  // Resolve author info as a User the shared ItemPreview can render
  // directly. Falls back to undefined when the createdBy id isn't a
  // known member; ItemPreview then shows the raw id with an initials
  // avatar.
  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  )
  const resolveAuthor = useCallback(
    (createdBy: string): User | undefined => {
      const member = memberMap.get(createdBy)
      if (member) return member
      if (currentUser?.id === createdBy) return currentUser
      return undefined
    },
    [memberMap, currentUser],
  )

  // Detail panel — shared single panel via ModulePanelProvider
  const modulePanel = useModulePanel()
  const openDetail = useCallback((item: Item) => {
    modulePanel.open({
      kind: "detail",
      itemId: item.id,
      content: (
        <ItemDetailPanel
          itemId={item.id}
          renderCommentReactions={(commentId) => <ReactionBar itemId={commentId} />}
        >
          <div className="p-4">
            <ItemPreview
              item={item}
              author={resolveAuthor(item.createdBy)}
              headerAdornment={<ItemTypeBadge type={item.type} />}
              metaAdornment={<ItemMetaRow item={item} />}
              footerAdornment={
                item.type !== "task" ? <ReactionBar itemId={item.id} /> : undefined
              }
            />
          </div>
        </ItemDetailPanel>
      ),
    })
  }, [modulePanel, resolveAuthor])

  // FilterBar state — controlled, lives in the view
  const [filterBarValue, setFilterBarValue] = useState<FilterBarValue>(emptyFilterBarValue)
  const [searchText, setSearchText] = useState("")
  const itemsAfterBar = useFilterableItems(feedItems, filterBarValue)
  const filteredFeedItems = useMemo(() => {
    const needle = searchText.trim().toLowerCase()
    if (!needle) return itemsAfterBar
    return itemsAfterBar.filter((item) => {
      const haystack = [item.data.title, item.data.description, item.data.content]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ")
      return haystack.includes(needle)
    })
  }, [itemsAfterBar, searchText])
  const availableTags = useMemo(() => {
    const seen = new Set<string>()
    for (const item of feedItems) for (const tag of item.tags ?? []) seen.add(tag)
    return Array.from(seen).sort()
  }, [feedItems])

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
  // composer-created post lands in `data.text`, which ItemPreview doesn't
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

  // Feed footer convention: a ReactionBar on the left and a comment
  // count on the right. Tasks intentionally don't get reactions in the
  // feed view today — open a Sebastian-Polish ticket if that changes.
  const renderFeedFooter = useCallback((item: Item, onCommentClick: () => void) => {
    const commentCount = (item.data as Record<string, unknown>).commentCount
    const count = typeof commentCount === "number" ? commentCount : 0
    const showReactions = item.type !== "task"
    if (!showReactions && count <= 0) return undefined
    return (
      <>
        {showReactions && <ReactionBar itemId={item.id} />}
        {count > 0 && (
          <div className="ml-auto">
            <ItemCommentCount count={count} onClick={onCommentClick} />
          </div>
        )}
      </>
    )
  }, [])

  return (
    <div className="space-y-4">
      <FilterBar
        value={filterBarValue}
        onChange={setFilterBarValue}
        availableTags={availableTags}
        availableTypes={FEED_TYPES}
        leadingActions={
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Suche…"
              aria-label="Feed durchsuchen"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 w-full pl-7 text-xs sm:w-40"
            />
          </div>
        }
      />

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
              onSubmit={async (data) => {
                const result = await editor.submit(data)
                if (result) onClose()
              }}
              onCancel={onClose}
              showPreview={false}
            />
          </div>
        )}
      </FeedComposerTrigger>

      {/* Feed items */}
      <div className="space-y-4">
        {filteredFeedItems.map((item) => (
          <ItemPreview
            key={item.id}
            item={item}
            author={resolveAuthor(item.createdBy)}
            className={cn(modulePanel.current?.itemId === item.id && "ring-2 ring-primary")}
            onClick={() => openDetail(item)}
            headerAdornment={<ItemTypeBadge type={item.type} />}
            metaAdornment={<ItemMetaRow item={item} />}
            footerAdornment={renderFeedFooter(item, () => openDetail(item))}
          />
        ))}
      </div>

    </div>
  )
}
