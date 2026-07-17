/** Portion of a view that a shell panel covers during selection focus. */
export interface SelectionFocusVisibleArea {
  /** CSS pixels covered by a bottom drawer. */
  bottomInset?: number
}

/** Focus state for surfaces that must re-centre when their covered area changes. */
export interface SelectionFocusVisibleAreaState {
  itemId: string | null
  bottomInset: number
}

/** The small virtualizer contract used by selection focus and its Node tests. */
export interface SelectionFocusVirtualizer {
  scrollToIndex: (index: number, options: { align: "center" }) => void
  scrollBy?: (delta: number) => void
}

function normalizedBottomInset(visibleArea: SelectionFocusVisibleArea | undefined): number {
  const bottomInset = visibleArea?.bottomInset
  return typeof bottomInset === "number" && Number.isFinite(bottomInset) && bottomInset > 0
    ? bottomInset
    : 0
}

export function initialSelectionFocusVisibleAreaState(): SelectionFocusVisibleAreaState {
  return { itemId: null, bottomInset: 0 }
}

/**
 * Focus an active item at most once for each contiguous rendered selection.
 *
 * The caller supplies the rendered target and focus action, keeping this logic
 * testable without a DOM. A missing target resets the gate: it might be a
 * non-renderable selection between two appearances of the same item, so that
 * item's next contiguous selection must receive focus again.
 */
export function focusActiveItemOnce<T>(
  lastFocusedItemId: string | null,
  activeItemId: string | null | undefined,
  target: T | null,
  focus: (target: T) => void,
): string | null {
  if (!activeItemId || !target) return null
  if (lastFocusedItemId === activeItemId) return lastFocusedItemId

  focus(target)
  return activeItemId
}

/**
 * The virtual counterpart of `focusActiveItemOnce`. It deliberately gates on
 * an item index rather than a mounted card: a selected item can be outside
 * the current virtual range. The lower obstruction moves the centre point
 * into the remaining visible area after the virtualizer has centred the row.
 */
export function focusVirtualItemOnce(
  lastFocusedItemId: string | null,
  activeItemId: string | null | undefined,
  itemIndex: number | undefined,
  virtualizer: SelectionFocusVirtualizer | null,
  visibleArea: SelectionFocusVisibleArea | undefined,
): string | null {
  return focusActiveItemOnce(
    lastFocusedItemId,
    activeItemId,
    itemIndex === undefined || !virtualizer ? null : { itemIndex, virtualizer },
    ({ itemIndex: resolvedIndex, virtualizer: resolvedVirtualizer }) => {
      resolvedVirtualizer.scrollToIndex(resolvedIndex, { align: "center" })
      const bottomInset = normalizedBottomInset(visibleArea)
      if (bottomInset > 0) resolvedVirtualizer.scrollBy?.(bottomInset / 2)
    },
  )
}

/**
 * Apply the common one-shot gate while forwarding a shell-owned visible area
 * to the concrete surface. Graph and map use the same bottom-drawer semantic.
 */
export function focusActiveItemInVisibleAreaOnce<T>(
  lastFocusedItemId: string | null,
  activeItemId: string | null | undefined,
  target: T | null,
  visibleArea: SelectionFocusVisibleArea | undefined,
  focus: (target: T, visibleArea: SelectionFocusVisibleArea) => void,
): string | null {
  return focusActiveItemOnce(
    lastFocusedItemId,
    activeItemId,
    target,
    (resolvedTarget) => focus(resolvedTarget, visibleArea ?? {}),
  )
}

/**
 * Focus an active item once per visible-area geometry. A drawer-height change
 * is a new geometry, so the existing selection is deliberately re-centred.
 */
export function focusActiveItemInVisibleArea<T>(
  state: SelectionFocusVisibleAreaState,
  activeItemId: string | null | undefined,
  target: T | null,
  visibleArea: SelectionFocusVisibleArea | undefined,
  focus: (target: T, visibleArea: SelectionFocusVisibleArea) => void,
): SelectionFocusVisibleAreaState {
  if (!activeItemId || !target) return initialSelectionFocusVisibleAreaState()
  const bottomInset = normalizedBottomInset(visibleArea)
  if (state.itemId === activeItemId && state.bottomInset === bottomInset) return state

  focus(target, visibleArea ?? {})
  return { itemId: activeItemId, bottomInset }
}

/**
 * `scrollIntoView({ block: "center" })` centres the target's scroll-margin
 * box. Extending its lower edge by the obscured drawer height therefore keeps
 * the target centred in the remaining visible area.
 */
export function selectionFocusScrollMarginBlockEnd(
  visibleArea: SelectionFocusVisibleArea | undefined,
): string | undefined {
  const bottomInset = visibleArea?.bottomInset
  return typeof bottomInset === "number" && Number.isFinite(bottomInset) && bottomInset > 0
    ? `${bottomInset}px`
    : undefined
}
