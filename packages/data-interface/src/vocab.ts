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

function isGeoJSONPoint(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  if (v.type !== "Point") return false
  const coords = v.coordinates
  return Array.isArray(coords) && coords.length >= 2 && coords.every((c) => typeof c === "number")
}

/**
 * Compute the `@context` array for an item from its `type` and `data`.
 *
 * Activation rules:
 * - `base/v1` is always included (always first).
 * - `event/v1` if `data.start` is a non-empty string.
 * - `place/v1` if `data.position` is a GeoJSON Point.
 * - `task/v1` if `type === "task"` or `data.status` is one of the task spec
 *   enum values (`open` | `in-progress` | `done` | `archived`).
 * - `person/v1` if `type === "person"`.
 */
export function deriveContext(type: string, data: Record<string, unknown>): string[] {
  const ctx: string[] = [VOCAB_BASE]

  if (typeof data.start === "string" && data.start.length > 0) {
    ctx.push(VOCAB_EVENT)
  }

  if (isGeoJSONPoint(data.position)) {
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
