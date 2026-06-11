export { useIsMobile } from "./use-mobile"

// Connector
export { ConnectorProvider, useConnector } from "./connector-context"
export type { ConnectorProviderProps } from "./connector-context"

// Data Hooks
export { useItems, useItem } from "./use-items"
export { useRelatedItems } from "./use-related-items"
export { useCreateItem, useUpdateItem, useDeleteItem } from "./use-mutations"
export { useGroups, useCurrentGroup, useCreateGroup, useUpdateGroup, useDeleteGroup, useMembers, useInviteMember, useRemoveMember } from "./use-groups"
export { useAuthState, useCurrentUser } from "./use-auth"
export { useFeatures, useFeature } from "./use-features"
export { useContacts } from "./use-contacts"
export { useVerification } from "./use-verification"
export { useConfirmations } from "./use-confirmations"
export { useRelayStatus } from "./use-relay-status"
export { useReactions, useReactionUsers, type AggregatedReaction, type UseReactionsResult, type ReactionUser, type UseReactionUsersResult } from "./use-reactions"
export { useComments, useReplies, type CommentWithAuthor, type UseCommentsResult, type UseRepliesResult } from "./use-comments"
export { useIncomingEvents, IncomingEventsProvider } from "./use-incoming-events"

// Item-Detail Hooks (shared across modules — Feed, Kanban, Calendar, Map)
export { useItemAuthor } from "./use-item-author"
export { useItemTags } from "./use-item-tags"
export { useItemDateHint, formatItemDateHint, type ItemDateHint } from "./use-item-date-hint"
export { useItemPosition, type ItemPosition } from "./use-item-position"
export { useOpenProfile, OpenProfileProvider, type OpenProfile, type OpenProfileProviderProps } from "./use-open-profile"
export {
  useItemEditor,
  type UseItemEditorOptions,
  type UseItemEditorResult,
  type ItemEditorMapper,
  type ItemEditorPayload,
} from "./use-item-editor"
export { useFilterableItems } from "./use-filterable-items"
