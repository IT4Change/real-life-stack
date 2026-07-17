/** Geometry for the order-stable masonry projection.
 *
 * Each source index owns a lane (`index % laneCount`). This deliberately
 * differs from CSS columns and TanStack's shortest-lane masonry assignment:
 * visual reading order stays 1, 2, 3, 4 / 5, 6, 7, 8 even when card heights
 * differ.
 */
export interface GridLanePlacement {
  index: number
  lane: number
  start: number
  size: number
  end: number
}

export interface GridLaneLayout {
  placements: readonly GridLanePlacement[]
  totalSize: number
}

export const GRID_CARD_ESTIMATE = 172
export const GRID_LANE_GAP = 16

/**
 * Pure, SSR-safe layout calculation. Heights that have not reached the DOM
 * use the stable estimate; measured heights replace them on the next pass.
 */
export function gridLaneLayout(
  itemCount: number,
  laneCount: number,
  measuredHeights: ReadonlyMap<number, number>,
  estimateSize = GRID_CARD_ESTIMATE,
  gap = GRID_LANE_GAP,
): GridLaneLayout {
  const safeLaneCount = Math.max(1, Math.floor(laneCount))
  const laneEnds = Array.from({ length: safeLaneCount }, () => 0)
  const placements: GridLanePlacement[] = []

  for (let index = 0; index < itemCount; index += 1) {
    const lane = index % safeLaneCount
    const measured = measuredHeights.get(index)
    const size = typeof measured === "number" && Number.isFinite(measured) && measured > 0
      ? measured
      : estimateSize
    const start = laneEnds[lane] === 0 ? 0 : laneEnds[lane] + gap
    const end = start + size
    placements.push({ index, lane, start, size, end })
    laneEnds[lane] = end
  }

  return { placements, totalSize: Math.max(0, ...laneEnds) }
}

/** Returns all cards touching a vertical window, across every lane. */
export function gridLaneRange(
  layout: GridLaneLayout,
  start: number,
  end: number,
): readonly GridLanePlacement[] {
  return layout.placements.filter((placement) => placement.end >= start && placement.start <= end)
}
