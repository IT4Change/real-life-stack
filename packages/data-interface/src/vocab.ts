// Vocabulary URLs and @context derivation.
//
// Each Item carries an `@context` array that opts it into vocabulary-specific
// schemas. `base/v1` is always included; further vocabs are added based on
// the item's `type` and the fields present in `data`.
//
// Conformance: see docs/spec/06-schema-composition.md.

export const VOCAB_BASE = "https://real-life-stack.org/vocab/base/v1"
export const VOCAB_EVENT = "https://real-life-stack.org/vocab/event/v1"
export const VOCAB_PLACE = "https://real-life-stack.org/vocab/place/v1"
export const VOCAB_TASK = "https://real-life-stack.org/vocab/task/v1"
export const VOCAB_PERSON = "https://real-life-stack.org/vocab/person/v1"

const TASK_STATUS_VALUES = new Set(["open", "in-progress", "done", "archived"])
const PLACE_GEOMETRY_TYPES = new Set(["Point", "LineString", "Polygon"])

function isPlaceGeometry(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.type !== "string" || !PLACE_GEOMETRY_TYPES.has(v.type)) return false
  return Array.isArray(v.coordinates) && v.coordinates.length > 0
}

/**
 * Compute the `@context` array for an item from its `type` and `data`.
 *
 * Activation rules:
 * - `base/v1` is always included (always first).
 * - `event/v1` if `data.start` is a non-empty string.
 * - `place/v1` if `data.position` is a GeoJSON geometry accepted by the
 *   `place/v1` schema (`Point`, `LineString`, or `Polygon`) with a non-empty
 *   `coordinates` array. Detailed coordinate shape is validated by AJV, not
 *   here — this helper only decides whether the vocab is active.
 * - `task/v1` if `type === "task"` or `data.status` is one of the task spec
 *   enum values (`open` | `in-progress` | `done` | `archived`).
 * - `person/v1` if `type === "person"`.
 */
export function deriveContext(type: string, data: Record<string, unknown>): string[] {
  const ctx: string[] = [VOCAB_BASE]

  if (typeof data.start === "string" && data.start.length > 0) {
    ctx.push(VOCAB_EVENT)
  }

  if (isPlaceGeometry(data.position)) {
    ctx.push(VOCAB_PLACE)
  }

  if (type === "task" || (typeof data.status === "string" && TASK_STATUS_VALUES.has(data.status))) {
    ctx.push(VOCAB_TASK)
  }

  if (type === "person") {
    ctx.push(VOCAB_PERSON)
  }

  return ctx
}
