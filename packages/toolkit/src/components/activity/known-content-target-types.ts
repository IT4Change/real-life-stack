/**
 * Activity entries for these item types keep the established item grammar.
 * Everything else is deliberately rendered as a neutral, forward-compatible
 * target-type event.
 */
export const KNOWN_CONTENT_TARGET_TYPES = [
  "post", "event", "task", "place", "resource", "person", "project", "comment", "reaction",
] as const

const knownContentTargetTypes = new Set<string>(KNOWN_CONTENT_TARGET_TYPES)

export function isKnownContentTargetType(targetType: string): boolean {
  return knownContentTargetTypes.has(targetType)
}
