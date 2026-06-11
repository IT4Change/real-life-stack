import type { ComponentType } from "react"

/**
 * The shared `FilterBar` value. Modules hold this in their view state
 * (controlled component) and pass it back via `onChange`. Module-
 * specific extras live alongside, not inside.
 */
export interface FilterBarValue {
  /** Tag IDs (matched against top-level `item.tags`). Empty = no filter. */
  tags: string[]
  /** Item-type IDs. Empty = no filter. */
  types: string[]
}

/** Empty `FilterBarValue` constant — handy as initial state. */
export const emptyFilterBarValue: FilterBarValue = Object.freeze({
  tags: [],
  types: [],
}) as FilterBarValue

/**
 * Option entry for the type filter. Each module supplies the types it
 * wants to expose; the toolkit doesn't decide which item types exist.
 */
export interface FilterTypeOption {
  id: string
  label: string
  /** Optional lucide-react (or compatible) icon component for the row. */
  icon?: ComponentType<{ className?: string }>
}
