"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Filter, Tag, Layers } from "lucide-react"
import { Button } from "../primitives/button"
import { AdaptivePanel } from "../layout/adaptive-panel"
import { useOptionalModulePanel } from "../module-panel"
import { cn } from "../../lib/utils"
import {
  FilterChip,
  FilterMultiSelect,
  FilterSection,
  type FilterMultiSelectOption,
} from "./filter-building-blocks"
import type { FilterBarValue, FilterTypeOption } from "./types"

/**
 * `FilterBar` — shared filter surface for every Space Module.
 *
 * Spec: `docs/spec/modules/shared-components.md` → `FilterBar`.
 *
 * Layout pattern (chosen with Anton on 11.06.2026):
 * - A sticky row of active-filter chips with `✕` to remove individually.
 *   When no filter is active the row collapses.
 * - A trigger button on the right opens a `Sheet` with the available
 *   common filters (tags, types) plus an optional caller-supplied
 *   `drawerExtra` for module-specific filters.
 *
 * Controlled component: `value` lives in the caller, the bar emits
 * partial updates via `onChange`. View-specific persistence (URL
 * params, localStorage, etc.) stays the caller's job.
 *
 * Module-specific filters compose via two slots:
 * - `chipsExtra`: shown after the common chips. Reuse `<FilterChip>`
 *   for visual consistency.
 * - `drawerExtra`: shown after the common filter sections inside the
 *   Sheet. Reuse `<FilterSection>` + `<FilterMultiSelect>` /
 *   `<FilterToggle>` for visual consistency.
 */
export interface FilterBarProps {
  value: FilterBarValue
  onChange: (next: FilterBarValue) => void
  /** Tags available for selection (e.g. derived from current items). */
  availableTags?: readonly string[]
  /** Item-type options the module wants to expose. */
  availableTypes?: readonly FilterTypeOption[]
  /** Optional active-state chips for module-specific filters. */
  chipsExtra?: ReactNode
  /** Optional drawer content for module-specific filters. */
  drawerExtra?: ReactNode
  /** Optional trailing actions in the trigger row (e.g. "Multiselect"). */
  trailingActions?: ReactNode
  className?: string
}

export function FilterBar({
  value,
  onChange,
  availableTags,
  availableTypes,
  chipsExtra,
  drawerExtra,
  trailingActions,
  className,
}: FilterBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Sorted, deduplicated tag list — accept either the caller's curated
  // list or fall back to nothing (the drawer's tag section then shows
  // its empty state).
  const tagOptions = useMemo<FilterMultiSelectOption[]>(() => {
    const set = new Set<string>(availableTags ?? [])
    return [...set].sort().map((tag) => ({ id: tag, label: tag }))
  }, [availableTags])

  const typeOptions = useMemo<FilterMultiSelectOption[]>(
    () =>
      (availableTypes ?? []).map((opt) => ({
        id: opt.id,
        label: opt.label,
        icon: opt.icon ? <opt.icon className="h-3 w-3" /> : undefined,
      })),
    [availableTypes],
  )

  const typeLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of availableTypes ?? []) map.set(t.id, t.label)
    return map
  }, [availableTypes])

  const updateTags = (next: string[]) => onChange({ ...value, tags: next })
  const updateTypes = (next: string[]) => onChange({ ...value, types: next })

  // Dedupe before rendering — a caller that accidentally passes the
  // same tag/type twice would otherwise produce duplicate React keys
  // and visible duplicate chips. Filter logic already treats both as
  // sets.
  const uniqueTagIds = useMemo(() => Array.from(new Set(value.tags)), [value.tags])
  const uniqueTypeIds = useMemo(() => Array.from(new Set(value.types)), [value.types])

  const activeTagChips = uniqueTagIds.map((tag) => (
    <FilterChip
      key={`tag-${tag}`}
      label={tag}
      icon={<Tag className="h-3 w-3" />}
      onRemove={() => updateTags(value.tags.filter((t) => t !== tag))}
    />
  ))

  const activeTypeChips = uniqueTypeIds.map((typeId) => (
    <FilterChip
      key={`type-${typeId}`}
      label={typeLabelById.get(typeId) ?? typeId}
      icon={<Layers className="h-3 w-3" />}
      onRemove={() => updateTypes(value.types.filter((t) => t !== typeId))}
    />
  ))

  const hasAnyChips =
    activeTagChips.length > 0 || activeTypeChips.length > 0 || !!chipsExtra

  const modulePanel = useOptionalModulePanel()

  const drawerContent = (
    <div className="flex h-full flex-col">
      <div className="border-b p-4 pr-12">
        <h2 className="text-lg font-semibold">Filter</h2>
      </div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <FilterSection label="Tags">
          <FilterMultiSelect
            options={tagOptions}
            value={value.tags}
            onChange={updateTags}
            emptyLabel="Keine Tags verfügbar"
          />
        </FilterSection>

        {typeOptions.length > 0 && (
          <FilterSection label="Typ">
            <FilterMultiSelect
              options={typeOptions}
              value={value.types}
              onChange={updateTypes}
            />
          </FilterSection>
        )}

        {drawerExtra}
      </div>
    </div>
  )

  const openFilter = () => {
    if (modulePanel) {
      modulePanel.open({ kind: "filter", content: drawerContent })
    } else {
      setDrawerOpen(true)
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={openFilter}
      >
        <Filter className="h-4 w-4 mr-1.5" />
        Filter
      </Button>

      {/* Fallback own AdaptivePanel — used in Storybook / standalone
          render where no ModulePanelProvider exists. Inside a module
          surface the shared provider's single panel takes over and this
          one stays closed. */}
      {!modulePanel && (
        <AdaptivePanel
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          allowedModes={["sidebar", "drawer"]}
          sidebarWidth="380px"
        >
          {drawerContent}
        </AdaptivePanel>
      )}

      {hasAnyChips && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeTagChips}
          {activeTypeChips}
          {chipsExtra}
        </div>
      )}

      {trailingActions && <div className="ml-auto flex items-center gap-2">{trailingActions}</div>}
    </div>
  )
}
