// Item data type specification
// Companion types for type-safe narrowing of Item.data
//
// Embedded relation conventions:
//   Forward  = this item carries the relation in item.relations[]
//   Reverse  = another item points to this item with the given predicate
//              (queryable via getRelatedItems(id, predicate, { direction: "to" }))
//
// These *Relations interfaces and KnownPredicate describe embedded
// Item.relations[] only. RelationRecord predicates live in relation item data
// and are typed separately. `locatedAt` intentionally exists in both worlds:
// embedded Event -> Place relations keep the legacy name, while the
// RelationRecord catalog uses it for Project -> Place.
//
// Cardinality:
//   0..1  = optional, at most one relation of this type
//   1     = exactly one (required)
//   0..n  = any number
//
// Scope convention for relation.target:
//   "item:xxx"            = item in the same group/space
//   "space:{id}/item:xxx" = cross-space reference
//   "global:xxx"          = user ID (DID)
//
// Item.relations remains Relation[] — these interfaces are pure
// documentation and a foundation for future typing.

import type { Item } from "./index.js"

// --- Shared Types ---

/** GeoJSON position in [longitude, latitude, optional elevation] order. */
export type GeoJSONPosition = [longitude: number, latitude: number, elevation?: number]

export interface GeoJSONPoint {
  type: "Point"
  coordinates: GeoJSONPosition
}

export interface GeoJSONLineString {
  type: "LineString"
  coordinates: GeoJSONPosition[]
}

export interface GeoJSONPolygon {
  type: "Polygon"
  coordinates: GeoJSONPosition[][]
}

/** Geometry variants accepted by place/v1. */
export type GeoJSONGeometry = GeoJSONPoint | GeoJSONLineString | GeoJSONPolygon

/** Aggregated reaction counts, embedded in target item's data. Emoji → number of users. */
export type ReactionSummary = Record<string, number>

/** Mixin for item data types that support reactions. */
export interface Reactable {
  /** Aggregated reaction counts. Emoji → number of users. Maintained by connector. */
  reactions?: ReactionSummary
  /** The emoji the current user has reacted with, or undefined if none. User-specific, set by connector per session. */
  myReaction?: string
}

/** Mixin for item data types that support comments. */
export interface Commentable {
  /** Total number of comments (all levels). Maintained by connector. */
  commentCount?: number
}

// ============================================================
// Task
// ============================================================

export interface TaskData extends Commentable {
  /** Display name of the task. */
  title: string
  /** Description, markdown. */
  description?: string
  /** Kanban column key. Defaults follow task/v1 spec enum (open | in-progress | done | archived); apps pick the actual column set via the KanbanBoard `columns` prop. */
  status: string
  /** Sort order within a kanban column (task/v1 `order`). Lower values appear higher. Not `position` — that's place/v1's GeoJSON geometry. */
  order?: number
}

export type TaskItem = Item & { type: "task"; data: TaskData }

/** Forward and reverse relations for a task. */
export interface TaskRelations {
  forward: {
    /** Task is assigned to a person → ProfileItem (scope: global:, 0..n) */
    assignedTo: ProfileItem
    /** Subtask belongs to a parent task → TaskItem (scope: item:, 0..1) */
    childOf: TaskItem
    /** Task blocks other tasks → TaskItem (scope: item:, 0..n) */
    blocks: TaskItem
    /** General link → any item (scope: item:, 0..n) */
    relatedTo: Item
  }
  reverse: {
    /** Subtasks that have this task as parent (childOf → this task, 0..n) */
    childOf: TaskItem
    /** Tasks blocked by this task (blocks → this task, 0..n) */
    blocks: TaskItem
    /** Comments on this task (commentOn → this task, 0..n) */
    commentOn: Item
  }
}

export function isTask(item: Item): item is TaskItem {
  return item.type === "task"
}

// ============================================================
// Event
// ============================================================

export interface EventData extends Reactable, Commentable {
  /** Display name of the event. */
  title: string
  /** Description, markdown. */
  description?: string
  /** Start time, ISO-8601 string (e.g. "2026-03-10T10:00"). Determines calendar display. */
  start: string
  /** End time, ISO-8601 string. If absent, the event is treated as a point in time. */
  end?: string
  /** ISO-8601 duration. Mutually exclusive with end per event/v1. */
  duration?: string
  /** RFC 5545 recurrence rule. */
  rrule?: string
  /** Online meeting URI. */
  meetingLink?: string
  /** Event status (e.g. "confirmed", "tentative", "cancelled"). Different value space than Task.status. */
  status?: string
}

export type EventItem = Item & { type: "event"; data: EventData }

/** Forward and reverse relations for an event. */
export interface EventRelations {
  forward: {
    /** Event takes place at a location → PlaceItem (scope: item:, 0..1) */
    locatedAt: PlaceItem
    /** General link → any item (scope: item:, 0..n) */
    relatedTo: Item
  }
  reverse: {
    /** Comments on this event (commentOn → this event, 0..n) */
    commentOn: Item
    /** Reactions on this event (reactsTo → this event, 0..n) */
    reactsTo: ReactionItem
  }
}

export function isEvent(item: Item): item is EventItem {
  return item.type === "event"
}

// ============================================================
// Post
// ============================================================

export interface PostData extends Reactable, Commentable {
  /** Optional headline. */
  title?: string
  /** Body content, markdown. Determines feed display. */
  content: string
}

export type PostItem = Item & { type: "post"; data: PostData }

/** Forward and reverse relations for a post. */
export interface PostRelations {
  forward: {
    /** General link → any item (scope: item:, 0..n) */
    relatedTo: Item
  }
  reverse: {
    /** Reactions on this post (reactsTo → this post, 0..n) */
    reactsTo: ReactionItem
    /** Comments on this post (commentOn → this post, 0..n) */
    commentOn: Item
  }
}

export function isPost(item: Item): item is PostItem {
  return item.type === "post"
}

// ============================================================
// Place
// ============================================================

export interface PlaceData {
  /** Display name of the place. */
  title: string
  /** Description, markdown. */
  description?: string
  /** GeoJSON geometry (required). Determines map display. */
  position: GeoJSONGeometry
  /** Human-readable address. */
  address?: string
  /** Named location (e.g. "Markthalle 7"). */
  locationName?: string
}

export type PlaceItem = Item & { type: "place"; data: PlaceData }

/** Forward and reverse relations for a place. */
export interface PlaceRelations {
  forward: {
    /** General link → any item (scope: item:, 0..n) */
    relatedTo: Item
  }
  reverse: {
    /** Events that take place here (locatedAt → this place, 0..n) */
    locatedAt: EventItem
  }
}

export function isPlace(item: Item): item is PlaceItem {
  return item.type === "place"
}

// ============================================================
// Project
// ============================================================

export interface ProjectData {
  /** Display name of the project. */
  title: string
  /** Description, markdown. */
  description?: string
  /** Public project website. */
  website?: string
  /** Source repository URI. */
  repo?: string
}

export type ProjectItem = Item & { type: "project"; data: ProjectData }

export function isProject(item: Item): item is ProjectItem {
  return item.type === "project"
}

// ============================================================
// Resource
// ============================================================

export interface ResourceData {
  /** Display name of the resource. */
  title: string
  /** Resource kind (e.g. tool, space, material). */
  kind?: string
  /** Free-text availability information. */
  availability?: string
  /** Description, markdown. */
  description?: string
}

export type ResourceItem = Item & { type: "resource"; data: ResourceData }

export function isResource(item: Item): item is ResourceItem {
  return item.type === "resource"
}

// ============================================================
// Feature
// ============================================================

export interface FeatureData {
  /** Kanban module enabled. Can be an options object (e.g. { customColumns: true }). */
  kanban?: unknown
  /** Feed module enabled. true or options object. */
  feed?: unknown
  /** Calendar module enabled. true or options object. */
  calendar?: unknown
  /** Map module enabled. true or options object. */
  map?: unknown
  /** Additional modules/features. Truthy = supported, falsy = not supported. */
  [key: string]: unknown
}

export type FeatureItem = Item & { type: "feature"; data: FeatureData }

export function isFeatureItem(item: Item): item is FeatureItem {
  return item.type === "feature"
}

// ============================================================
// Profile
// ============================================================

export interface ProfileItemData {
  /** Optional stable identity used to bind person items to confirmations. */
  did?: string
  /** Display name. */
  displayName: string
  /** Short bio, free text. */
  bio?: string
  /** Profile picture URL. */
  avatarUrl?: string
  /** Phone number (contacts-only visibility). */
  phone?: string
  /** Address (contacts-only visibility). */
  address?: string
  /** Skills / competencies. */
  skills?: string[]
  /** What the person can offer. */
  offers?: string[]
  /** What the person is looking for. */
  needs?: string[]
}

// Canonical type string is "person" — matches the person/v1 vocab and
// deriveContext (which activates person/v1 on type === "person"). The
// "Profile" naming describes the data shape, consistent with the UI layer
// (ProfileLink, ProfileDialog).
export type ProfileItem = Item & { type: "person"; data: ProfileItemData }

/** Forward and reverse relations for a profile. */
export interface ProfileRelations {
  forward: {}
  reverse: {
    /** Tasks assigned to this profile (assignedTo → this profile, 0..n) */
    assignedTo: TaskItem
  }
}

export function isProfileItem(item: Item): item is ProfileItem {
  return item.type === "person"
}

// ============================================================
// Reaction
// ============================================================

export interface ReactionData {
  /** The emoji character used for this reaction (e.g. "❤️", "👍"). */
  emoji: string
}

export type ReactionItem = Item & { type: "reaction"; data: ReactionData }

/** Forward relations for a reaction. */
export interface ReactionRelations {
  forward: {
    /** Reaction targets an item → any Item (scope: item:, 1) */
    reactsTo: Item
  }
}

export function isReaction(item: Item): item is ReactionItem {
  return item.type === "reaction"
}

// ============================================================
// Comment
// ============================================================

export interface CommentData extends Reactable {
  /** Comment text content. */
  content: string
  /** ID of the first-level comment this is a reply to. If undefined, this is a first-level comment. */
  replyTo?: string
  /** ID of the specific comment being replied to (for quote display). May differ from replyTo when replying to a second-level comment. */
  replyToComment?: string
}

export type CommentItem = Item & { type: "comment"; data: CommentData }

/** Forward and reverse relations for a comment. */
export interface CommentRelations {
  forward: {
    /** Comment belongs to a root item → any Item (scope: item:, 1) */
    commentOn: Item
  }
  reverse: {
    /** Reactions on this comment (reactsTo → this comment, 0..n) */
    reactsTo: ReactionItem
  }
}

export function isComment(item: Item): item is CommentItem {
  return item.type === "comment"
}

// ============================================================
// Group (not an item — types Group.data which is Record<string, unknown>)
// ============================================================

/** Data fields for Group.data. Group is not an Item but has an untyped data bag. */
export interface GroupData {
  /** Group scope. "aggregate" = virtual group spanning all groups, "group" = regular group. */
  scope?: string
  /** Enabled UI modules for this group (e.g. ["feed", "kanban", "calendar", "map"]). */
  modules?: string[]
  /** Group image URL or filename. */
  image?: string
  /** Group avatar URL or filename (alternative to image). */
  avatar?: string
}

// ============================================================
// Predicate and type catalog
// ============================================================

/** Known relation predicates. Connectors may define additional ones. */
export type KnownPredicate =
  | keyof TaskRelations["forward"]
  | keyof PostRelations["reverse"]
  | keyof EventRelations["forward"]
  | keyof ReactionRelations["forward"]
  | keyof CommentRelations["forward"]

/** Known item types. Connectors may define additional ones. */
export type KnownItemType =
  | "task"
  | "event"
  | "post"
  | "place"
  | "project"
  | "resource"
  | "feature"
  | "person"
  | "relation"
  | "reaction"
  | "comment"
