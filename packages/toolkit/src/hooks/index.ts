export { useIsMobile, useIsCompact } from "./use-mobile"

// Connector
export { ConnectorProvider, useConnector, useOptionalConnector } from "./connector-context"
export type { ConnectorProviderProps } from "./connector-context"

// Data Hooks
export { useItems, useItem, useItemsWithDraft } from "./use-items"
export { useActivity } from "./use-activity"
export { useNotifications, useMarkNotificationsSeen } from "./use-notifications"
export {
  DraftItemProvider,
  useDraftItem,
  useSetDraftItem,
  DRAFT_ITEM_ID,
} from "./use-draft-item"
export {
  UnsavedChangesProvider,
  useUnsavedChanges,
  useSetUnsavedDirty,
} from "./use-unsaved-changes"
export { useRelatedItems } from "./use-related-items"
export { useRelationRecords, useRelationNeighbors } from "./use-relation-records"
export { useCreateItem, useUpdateItem, useDeleteItem } from "./use-mutations"
export { useItemPermissions, useCanCreate, type ItemPermissions } from "./use-item-permissions"
export { useGroups, usePersonalGroupId, useCurrentGroup, useCreateGroup, useUpdateGroup, useDeleteGroup, useMembers, useInviteMember, useRemoveMember } from "./use-groups"
export { useAuthState, useCurrentUser } from "./use-auth"
export { useFeatures, useFeature } from "./use-features"
export { useContacts } from "./use-contacts"
export { useVerification } from "./use-verification"
export { useConfirmations } from "./use-confirmations"
export { useRelayStatus } from "./use-relay-status"
export { useInitialSync } from "./use-initial-sync"
export { useReactions, useReactionUsers, type AggregatedReaction, type UseReactionsResult, type ReactionUser, type UseReactionUsersResult } from "./use-reactions"
export { useCommentCount } from "./use-comment-count"
export { useUserNameResolver } from "./use-user-names"
export { useComments, useReplies, type CommentWithAuthor, type UseCommentsResult, type UseRepliesResult } from "./use-comments"
export { useVotes, useVoteUsers, useVerifiedRelationRecords, type VoteSummary, type UseVotesResult, type VoteUser, type UseVoteUsersResult } from "./use-votes"
export { useIncomingEvents, IncomingEventsProvider } from "./use-incoming-events"

// Item-Detail Hooks (shared across modules — Feed, Kanban, Calendar, Map)
export { useItemAuthor } from "./use-item-author"
export { useItemTags } from "./use-item-tags"
export { useItemDateHint, formatItemDateHint, type ItemDateHint } from "./use-item-date-hint"
export { useItemPosition, type ItemPosition } from "./use-item-position"
export { useItemGroupColorResolver, useItemGroupResolver, useItemPrivacyResolver } from "./use-item-group-color"
export { useOpenProfile, OpenProfileProvider, type OpenProfile, type OpenProfileProviderProps } from "./use-open-profile"
export {
  useItemEditor,
  type UseItemEditorOptions,
  type UseItemEditorResult,
  type ItemEditorMapper,
  type ItemEditorPayload,
} from "./use-item-editor"
export { useFilterableItems, applyFilterBarValue } from "./use-filterable-items"
export { useResolvedUsers } from "./use-resolved-users"
