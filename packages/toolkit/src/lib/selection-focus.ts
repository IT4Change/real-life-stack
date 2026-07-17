/**
 * Focus an active item at most once for each contiguous active-item value.
 *
 * The caller supplies the rendered target and focus action, keeping this logic
 * testable without a DOM. A missing target deliberately does not consume the
 * gate: when it appears in a later render, it receives its first focus.
 */
export function focusActiveItemOnce<T>(
  lastFocusedItemId: string | null,
  activeItemId: string | null | undefined,
  target: T | null,
  focus: (target: T) => void,
): string | null {
  if (!activeItemId) return null
  if (!target || lastFocusedItemId === activeItemId) return lastFocusedItemId

  focus(target)
  return activeItemId
}
