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
  resolveTypePresentation,
} from "@real-life-stack/toolkit"
import { FileText, Search, SearchX } from "lucide-react"
import { Input, renderTypeFooter } from "@real-life-stack/toolkit"
import { isStandaloneItemType, type Item, type User } from "@real-life-stack/data-interface"
import { useItemFocus } from "../hooks/use-item-focus"
import { useRegisterDetail, type DetailConfig } from "../detail-host"
import { mapComposerSubmission, withGroupOptions } from "../composer-mapping"
import { FEED_CREATE_TYPES } from "../content-types"
import { useItemDetailEdit } from "../hooks/use-item-detail-edit"
import { useCreate, useRegisterCreate, type CreateConfig } from "../create-host"

/**
 * Everything new in the network, newest first: the feed is an AGGREGATING view
 * (spec 06 §"Verhältnis zwischen Schema- und Feldfiltern" names it alongside
 * search), not a field-activated module like map or calendar. So it shows every
 * item that stands on its own and asks `isStandaloneItemType` instead of
 * enumerating types — a place, task or project reaches the feed the day it
 * exists, without a second list to maintain here (Anton, 2026-08-17: the feed
 * shows all that is new, not only posts).
 *
 * Exported as a plain function so the membership rule is testable without
 * mounting the feed.
 */
export function selectFeedItems(items: readonly Item[]): Item[] {
  return items.filter((item) => isStandaloneItemType(item.type)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function FeedView({ groupId }: { groupId: string }) {
  // ONE unfiltered query: the feed's job is "what's new here", so it reads the
  // scope's items and drops only what has no card of its own (see
  // selectFeedItems). A field-based query would tie feed membership to
  // `data.content` — a place with a description would show up, the same place
  // without one would not.
  const { data: items, isLoading } = useItemsWithDraft()
  // `groupId === "__overview__"` is the cross-space aggregate view
  // ("Mein Netzwerk"). useMembers(null) returns the union of all
  // members the connector knows about, so author resolution still
  // resolves the items that surface here from other spaces.
  const { data: members } = useMembers(groupId === "__overview__" ? null : groupId)
  const { data: currentUser } = useCurrentUser()

  const feedItems = useMemo(() => selectFeedItems(items), [items])

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
  // The type filter offers the types actually PRESENT — same derivation as the
  // tags above. Label and icon come from the type register (spec 06), so a new
  // type is filterable without touching this view. `type` may drive a user
  // filter (spec 06 Z.93), it just must not decide feed membership.
  const availableTypes = useMemo<FilterTypeOption[]>(() => {
    const present = new Set(feedItems.map(({ type }) => type))
    return Array.from(present)
      .map((id) => {
        const presentation = resolveTypePresentation(id)
        return { id, label: presentation.label, icon: presentation.badge?.icon }
      })
      .sort((a, b) => a.label.localeCompare(b.label, "de"))
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

  const renderFeedFooter = useCallback(feedFooter, [])

  return (
    <div className="space-y-4">
      <FilterBar
        value={filterBarValue}
        onChange={setFilterBarValue}
        availableTags={availableTags}
        availableTypes={availableTypes}
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
            title={filterActive ? "Keine Treffer" : "Noch nichts hier"}
            description={
              filterActive
                ? "Passe Suche oder Filter an."
                : "Hier erscheint alles Neue — Beiträge, Termine, Orte, Aufgaben."
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

/**
 * Feed card footer: a ReactionBar on the left, the comment count on the right.
 *
 * Reactions are NOT type-dependent. Tasks were excluded here ("Tasks
 * intentionally don't get reactions in the feed view today"); Anton corrected
 * that — an item is reactable regardless of its type.
 *
 * Exported as a plain function so the rule is testable without mounting the
 * whole feed.
 */
export function feedFooter(item: Item, onCommentClick: () => void) {
  const commentCount = (item.data as Record<string, unknown>).commentCount
  const count = typeof commentCount === "number" ? commentCount : 0
  // Type-own footer (statement -> votes, task -> assignees) comes from the
  // type register (spec 06, rule 3) - this surface adds ONLY its own
  // conventions: reactions left, comment count right. No type branching.
  return (
    <div className="flex w-full flex-col gap-2">
      {renderTypeFooter(item)}
      <div className="flex items-center">
        <ReactionBar itemId={item.id} />
        {count > 0 && (
          <div className="ml-auto">
            <ItemCommentCount count={count} onClick={onCommentClick} />
          </div>
        )}
      </div>
    </div>
  )
}
