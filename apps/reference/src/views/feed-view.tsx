import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import {
  useModulePanel,
  ReactionBar,
  ItemPreview,
  ItemPreviewSkeleton,
  EmptyState,
  ItemTypeBadge,
  ItemGroupBadge,
  ItemPrivateBadge,
  ItemMetaRow,
  ItemCommentCount,
  FeedComposerTrigger,
  FilterBar,
  emptyFilterBarValue,
  useFilterableItems,
  type FilterBarValue,
  type FilterTypeOption,
  useItemsWithDraft,
  useMembers,
  useCurrentUser,
  useResolvedUsers,
  useGroups,
  usePersonalGroupId,
  useItemGroupColorResolver,
  useItemGroupResolver,
  useItemPrivacyResolver,
  getActivePanelGlow,
} from "@real-life-stack/toolkit"
import { Calendar, FileText, Search, SearchX } from "lucide-react"
import { Input } from "@real-life-stack/toolkit"
import type { Item, User } from "@real-life-stack/data-interface"
import { useItemFocus } from "../hooks/use-item-focus"
import { useRegisterDetail, type DetailConfig } from "../detail-host"
import { mapComposerSubmission, withGroupOptions } from "../composer-mapping"
import { FEED_CREATE_TYPES } from "../content-types"
import { useItemDetailEdit } from "../hooks/use-item-detail-edit"
import { useCreate, useRegisterCreate, type CreateConfig } from "../create-host"

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
  const { data: posts, isLoading: postsLoading } = useItemsWithDraft({ hasField: ["content"] })
  const { data: events, isLoading: eventsLoading } = useItemsWithDraft({ hasField: ["start"] })
  // Feed is the union of both queries → it has "loaded" only once both have.
  const isLoading = postsLoading || eventsLoading
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
  // Members can lag behind synced items (membership entry not yet arrived) —
  // resolve unknown authors through the connector cascade (contacts!) before
  // ever showing a raw DID.
  const unknownAuthorIds = useMemo(
    () => [...new Set(feedItems.map(({ createdBy }) => createdBy))].filter((id) => !memberMap.has(id) && id !== currentUser?.id),
    [feedItems, memberMap, currentUser],
  )
  const resolvedAuthors = useResolvedUsers(unknownAuthorIds)
  const resolveAuthor = useCallback(
    (createdBy: string): User | undefined => {
      const member = memberMap.get(createdBy)
      if (member) return member
      if (currentUser?.id === createdBy) return currentUser
      return resolvedAuthors.get(createdBy)
    },
    [memberMap, currentUser, resolvedAuthors],
  )

  // Detail panel — shared single panel via ModulePanelProvider
  const modulePanel = useModulePanel()
  // URL is the single source of truth for the focused item: a click writes
  // `/{scope}/feed/{id}` and an effect below opens the detail + scrolls to it;
  // browser-back clears the URL and closes the panel.
  const { itemId: focusedId, focusItem } = useItemFocus()
  // Active-item glow uses the colour of each item's origin group.
  const isOverview = groupId === "__overview__"
  const resolveItemGroupColor = useItemGroupColorResolver(isOverview ? undefined : groupId)
  // Origin group per item — only surfaced as a badge in the aggregate view.
  const resolveItemGroup = useItemGroupResolver()
  // Private items (in the personal space, shared with nobody) get a „Privat" badge.
  const isItemPrivate = useItemPrivacyResolver()
  // Groups + personal space for the sharing-scope picker in the composer.
  const { data: groups } = useGroups()
  const personalGroupId = usePersonalGroupId()
  // Create offers the feed's own types (post/event); the detail edit uses the
  // full registry (shared hook) so any item is editable with its own fields.
  const feedCreateTypes = useMemo(
    () => withGroupOptions(FEED_CREATE_TYPES, groups, isOverview ? undefined : groupId, personalGroupId),
    [groups, isOverview, groupId, personalGroupId],
  )
  const editConfig = useItemDetailEdit(members)
  // Register the feed's detail config with the host (which owns the panel + the
  // read↔edit lifecycle for the focused item). Memoised so it only re-registers
  // when author resolution changes.
  const detailConfig = useMemo<DetailConfig>(
    () => ({
      groupId,
      ...editConfig,
      renderCommentReactions: (commentId) => <ReactionBar itemId={commentId} />,
      onShare: () => {
        void navigator.clipboard?.writeText(window.location.href)
      },
    }),
    [resolveAuthor, editConfig, isOverview],
  )
  useRegisterDetail("feed", detailConfig)

  // Reveal: scroll the focused card into view once it is in the rendered
  // (filtered) list. The host opens the detail panel itself; this only handles
  // the feed-specific scroll. Filtered out → the panel still opens, scroll no-ops.
  const revealedIdRef = useRef<string | null>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  useEffect(() => {
    if (!focusedId) {
      revealedIdRef.current = null
      return
    }
    if (revealedIdRef.current === focusedId) return
    const el = itemRefs.current.get(focusedId)
    if (!el) return // not rendered yet — re-runs when feedItems updates
    revealedIdRef.current = focusedId
    el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [focusedId, feedItems])

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
  // Distinguishes "no items at all" from "filtered/searched to nothing" for the
  // empty state copy.
  const filterActive =
    searchText.trim() !== "" || filterBarValue.tags.length > 0 || filterBarValue.types.length > 0

  // Create runs through the app-level host in the fullscreen shell (the feed's
  // "write a post" surface). The trigger card just points the URL at `?compose`.
  const { startCreate } = useCreate()
  const composerProps = editConfig.composerProps
  const createConfig = useMemo<CreateConfig>(
    () => ({ contentTypes: feedCreateTypes, mapper: mapComposerSubmission, composerProps, shell: "fullscreen" }),
    [feedCreateTypes, composerProps],
  )
  useRegisterCreate("feed", createConfig)

  // Feed footer convention: a ReactionBar on the left and a comment
  // count on the right. Reactions are NOT type-dependent — tasks were excluded
  // here until Anton corrected that: reactable is a property of the surface and
  // the connector's capability, not of the item's type.
  const renderFeedFooter = useCallback((item: Item, onCommentClick: () => void) => {
    const commentCount = (item.data as Record<string, unknown>).commentCount
    const count = typeof commentCount === "number" ? commentCount : 0
    return (
      <>
        <ReactionBar itemId={item.id} />
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

      {/* Composer trigger — hands off to the app-level create host (fullscreen). */}
      <FeedComposerTrigger
        placeholder="Was gibt's Neues?"
        userName={currentUser?.displayName}
        userAvatar={currentUser?.avatarUrl}
        onCompose={(initialText) => startCreate("post", initialText ? { text: initialText } : undefined)}
      />

      {/* Feed items — skeleton while loading, empty state once loaded with
          nothing, otherwise the list. */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <ItemPreviewSkeleton key={`skeleton-${i}`} />)
        ) : filteredFeedItems.length === 0 ? (
          <EmptyState
            icon={filterActive ? SearchX : FileText}
            title={filterActive ? "Keine Treffer" : "Noch keine Beiträge"}
            description={
              filterActive
                ? "Passe Suche oder Filter an."
                : "Teile den ersten Beitrag mit deinem Space."
            }
          />
        ) : (
          filteredFeedItems.map((item) => {
          // In the aggregate view, show which group an item comes from — a chip
          // next to the type badge (analogous to it). Omitted inside a single group.
          const group = isOverview ? resolveItemGroup(item) : undefined
          return (
            <div
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.id, el)
                else itemRefs.current.delete(item.id)
              }}
            >
              <ItemPreview
                item={item}
                author={resolveAuthor(item.createdBy)}
                style={modulePanel.current?.itemId === item.id ? getActivePanelGlow(resolveItemGroupColor(item)) : undefined}
                onClick={() => focusItem(item.id)}
                headerAdornment={
                  <>
                    <ItemTypeBadge type={item.type} />
                    {group && <ItemGroupBadge name={group.name} color={resolveItemGroupColor(item)} />}
                    {isOverview && isItemPrivate(item) && <ItemPrivateBadge />}
                  </>
                }
                metaAdornment={<ItemMetaRow item={item} />}
                footerAdornment={renderFeedFooter(item, () => focusItem(item.id))}
              />
            </div>
          )
          })
        )}
      </div>

    </div>
  )
}
