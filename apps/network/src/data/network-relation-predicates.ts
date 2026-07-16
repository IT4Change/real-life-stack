import {
  relationStoreOptionsFrom,
  type RelationPredicateDefinition,
} from "@real-life-stack/data-interface"

/**
 * Interim app-owned relation catalog until P5 stores versioned
 * RelationTypeDefinitions in each Space (Relation Records rule 3).
 *
 * `symmetric` affects endpoint canonicalization and therefore relation IDs.
 * Changing an existing flag requires an ID migration.
 */
export const NETWORK_RELATION_PREDICATES = [
  { predicate: "knows", symmetric: true },
  { predicate: "attends", symmetric: false },
  { predicate: "partOf", symmetric: false },
  { predicate: "connectedWith", symmetric: true },
  { predicate: "takesPlaceAt", symmetric: false },
  { predicate: "livesAt", symmetric: false },
  { predicate: "locatedAt", symmetric: false },
] as const satisfies readonly RelationPredicateDefinition[]

export type NetworkRelationPredicate =
  typeof NETWORK_RELATION_PREDICATES[number]["predicate"]

export const NETWORK_RELATION_STORE_OPTIONS = relationStoreOptionsFrom(
  NETWORK_RELATION_PREDICATES,
)
