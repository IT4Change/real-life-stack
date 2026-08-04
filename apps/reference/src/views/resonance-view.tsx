import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import {
  CreateFab,
  EmptyState,
  FilterBar,
  ItemMetaRow,
  ItemPreview,
  ItemPreviewSkeleton,
  ItemTypeBadge,
  ReactionBar,
  VoteBar,
  emptyFilterBarValue,
  getActivePanelGlow,
  useCurrentUser,
  useFilterableItems,
  useGroups,
  useItemGroupColorResolver,
  useItems,
  useMembers,
  useModulePanel,
  usePersonalGroupId,
  useRelationRecords,
  useResolvedUsers,
  type FilterBarValue,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@real-life-stack/toolkit"
import { ArrowUpDown, MessageSquareQuote } from "lucide-react"
import { VOCAB_STATEMENT, VOTE_PREDICATE, type User } from "@real-life-stack/data-interface"
import { useItemFocus } from "../hooks/use-item-focus"
import { useItemDetailEdit } from "../hooks/use-item-detail-edit"
import { RESONANCE_CREATE_TYPES } from "../content-types"
import { withGroupOptions } from "../composer-mapping"
import { useCreate, useRegisterCreate, type CreateConfig } from "../create-host"
import { useRegisterDetail, type DetailConfig } from "../detail-host"
import { aggregateVoteStats, sortStatements, type ResonanceSortMode } from "../resonance-sort"

const SORT_LABELS: Record<ResonanceSortMode, string> = {
  newest: "Neueste",
  votes: "Stimmen",
  approval: "Zustimmung",
  activity: "Aktivität",
}

const SORT_MODES: readonly ResonanceSortMode[] = ["newest", "votes", "approval", "activity"]

/**
 * Resonance module: statements the group positions itself on with a
 * green/yellow/red vote. Spec: docs/spec/modules/resonance.md.
 */
export function ResonanceView({ groupId }: { groupId: string }) {
  // Statements are activated by their SCHEMA (statement/v1), per spec 06 —
  // `type` never drives module activation. The composer stamps the vocabulary
  // via deriveContext on create.
  const { data: statements, isLoading } = useItems({ hasSchema: [VOCAB_STATEMENT] })
  // All votes of the scope in one query — the per-statement sort keys (count,
  // approval, last activity) need the full picture, not per-card subscriptions.
  const { data: voteRecords } = useRelationRecords({ predicate: VOTE_PREDICATE })
  const { data: members } = useMembers(groupId === "__overview__" ? null : groupId)
  const { data: currentUser } = useCurrentUser()
  const modulePanel = useModulePanel()
  const { itemId: focusedId, focusItem } = useItemFocus()
  const resolveGroupColor = useItemGroupColorResolver(groupId === "__overview__" ? undefined : groupId)

  // Author resolution: members first, then the connector cascade (contacts),
  // never a raw DID if avoidable — same approach as the feed.
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const unknownAuthorIds = useMemo(
    () => [...new Set(statements.map(({ createdBy }) => createdBy))].filter((id) => !memberMap.has(id) && id !== currentUser?.id),
    [statements, memberMap, currentUser],
  )
  const resolvedAuthors = useResolvedUsers(unknownAuthorIds)
  const resolveAuthor = useCallback(
    (createdBy: string): User | undefined =>
      memberMap.get(createdBy) ?? (currentUser?.id === createdBy ? currentUser : undefined) ?? resolvedAuthors.get(createdBy),
    [memberMap, currentUser, resolvedAuthors],
  )

  // Filter (tags) → sort (mode-specific chains, resonance-sort.ts).
  const [filterBarValue, setFilterBarValue] = useState<FilterBarValue>(emptyFilterBarValue)
  const [sortMode, setSortMode] = useState<ResonanceSortMode>("newest")
  const filteredStatements = useFilterableItems(statements, filterBarValue)
  const voteStats = useMemo(() => aggregateVoteStats(voteRecords), [voteRecords])
  const sortedStatements = useMemo(
    () => sortStatements(filteredStatements, voteStats, sortMode),
    [filteredStatements, voteStats, sortMode],
  )
  const availableTags = useMemo(() => {
    const seen = new Set<string>()
    for (const item of statements) for (const tag of item.tags ?? []) seen.add(tag)
    return Array.from(seen).sort()
  }, [statements])
  const filterActive = filterBarValue.tags.length > 0

  // Detail: the read body is the host's shared, type-driven renderer (#203) —
  // the module only contributes the edit half + panel plumbing.
  const editConfig = useItemDetailEdit(members)
  const detailConfig = useMemo<DetailConfig>(() => ({
    ...editConfig,
    renderCommentReactions: (commentId) => <ReactionBar itemId={commentId} />,
    onShare: () => void navigator.clipboard?.writeText(window.location.href),
  }), [editConfig])
  useRegisterDetail("resonance", detailConfig)

  const { startCreate } = useCreate()
  const { data: groups } = useGroups()
  const personalGroupId = usePersonalGroupId()
  const createTypes = useMemo(
    () => withGroupOptions(RESONANCE_CREATE_TYPES, groups, groupId === "__overview__" ? undefined : groupId, personalGroupId),
    [groups, groupId, personalGroupId],
  )
  const createConfig = useMemo<CreateConfig>(
    () => ({
      contentTypes: createTypes,
      mapper: editConfig.mapper,
      composerProps: editConfig.composerProps,
      shell: "sheet",
    }),
    [createTypes, editConfig],
  )
  useRegisterCreate("resonance", createConfig)
  const handleCreate = useCallback(() => startCreate("statement"), [startCreate])

  // Reveal: scroll the focused card into view (same pattern as the feed).
  const revealedIdRef = useRef<string | null>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  useEffect(() => {
    if (!focusedId) {
      revealedIdRef.current = null
      return
    }
    if (revealedIdRef.current === focusedId) return
    const el = itemRefs.current.get(focusedId)
    if (!el) return
    revealedIdRef.current = focusedId
    el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [focusedId, sortedStatements])

  return (
    <div className="space-y-4">
      <FilterBar
        value={filterBarValue}
        onChange={setFilterBarValue}
        availableTags={availableTags}
        leadingActions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <ArrowUpDown className="h-3.5 w-3.5" />
                {SORT_LABELS[sortMode]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup value={sortMode} onValueChange={(value) => setSortMode(value as ResonanceSortMode)}>
                {SORT_MODES.map((mode) => (
                  <DropdownMenuRadioItem key={mode} value={mode}>
                    {SORT_LABELS[mode]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <ItemPreviewSkeleton key={`skeleton-${i}`} />)
        ) : sortedStatements.length === 0 ? (
          <EmptyState
            icon={MessageSquareQuote}
            title={filterActive ? "Keine Treffer" : "Noch keine Aussagen"}
            description={
              filterActive
                ? "Passe die Filter an."
                : "Bring die erste Aussage ein und finde heraus, was in der Gruppe Resonanz findet."
            }
          />
        ) : (
          sortedStatements.map((item) => (
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
                style={modulePanel.current?.itemId === item.id ? getActivePanelGlow(resolveGroupColor(item)) : undefined}
                onClick={() => focusItem(item.id)}
                headerAdornment={<ItemTypeBadge type={item.type} />}
                metaAdornment={<ItemMetaRow item={item} />}
                footerAdornment={<VoteBar statementId={item.id} />}
              />
            </div>
          ))
        )}
      </div>

      <CreateFab onClick={handleCreate} label="Aussage einbringen" />
    </div>
  )
}
