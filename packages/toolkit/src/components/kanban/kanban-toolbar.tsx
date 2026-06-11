import { useState, useMemo, type ReactNode } from "react"
import type { Item, User } from "@real-life-stack/data-interface"
import { Button } from "../primitives/button"
import { Input } from "../primitives/input"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../primitives/dropdown-menu"
import { Plus, CheckSquare, User as UserIcon, Users, Search, Tag, Settings, Filter, X } from "lucide-react"
import { cn } from "../../lib/utils"
import type { ItemListFilter } from "../../lib/item-filter"

export interface KanbanToolbarProps {
  items: Item[]
  users?: User[]
  currentUserId?: string
  availableTags?: string[]
  onFilterChange?: (filter: ItemListFilter) => void
  onCreateItem?: () => void
  onMultiSelectChange?: (enabled: boolean) => void
  onEditColumns?: () => void
  extraActions?: ReactNode
  className?: string
}

export function KanbanToolbar({
  items,
  users,
  currentUserId,
  availableTags,
  onFilterChange,
  onCreateItem,
  onMultiSelectChange,
  onEditColumns,
  extraActions,
  className,
}: KanbanToolbarProps) {
  const [searchText, setSearchText] = useState("")
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [myItemsOnly, setMyItemsOnly] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [multiSelect, setMultiSelect] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Derive tags from items if not provided
  const tags = useMemo(() => {
    if (availableTags) return availableTags
    const tagSet = new Set<string>()
    for (const item of items) {
      for (const tag of item.tags ?? []) {
        tagSet.add(tag)
      }
    }
    return [...tagSet].sort()
  }, [items, availableTags])

  // Notify parent synchronously — avoids extra render cycle from useEffect
  const notify = (patch: Partial<ItemListFilter>) => {
    const next = { searchText, assignedTo, myItemsOnly, tags: selectedTags, ...patch }
    onFilterChange?.(next)
  }

  const handleSearchChange = (value: string) => {
    setSearchText(value)
    notify({ searchText: value })
  }

  const handleMyItemsToggle = () => {
    if (myItemsOnly) {
      setMyItemsOnly(false)
      notify({ myItemsOnly: false })
    } else {
      setMyItemsOnly(true)
      setAssignedTo(null)
      notify({ myItemsOnly: true, assignedTo: null })
    }
  }

  const handleUserToggle = (userId: string) => {
    if (assignedTo === userId) {
      setAssignedTo(null)
      notify({ assignedTo: null })
    } else {
      setAssignedTo(userId)
      setMyItemsOnly(false)
      notify({ assignedTo: userId, myItemsOnly: false })
    }
  }

  const handleUserClear = () => {
    setAssignedTo(null)
    notify({ assignedTo: null })
  }

  const handleTagToggle = (tag: string) => {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag]
    setSelectedTags(next)
    notify({ tags: next })
  }

  const handleTagsClear = () => {
    setSelectedTags([])
    notify({ tags: [] })
  }

  const handleMultiSelectToggle = () => {
    const next = !multiSelect
    setMultiSelect(next)
    onMultiSelectChange?.(next)
  }

  const resetFilters = () => {
    setSearchText("")
    setAssignedTo(null)
    setMyItemsOnly(false)
    setSelectedTags([])
    onFilterChange?.({ searchText: "", assignedTo: null, myItemsOnly: false, tags: [] })
  }

  const hasActiveFilters = searchText || assignedTo || myItemsOnly || selectedTags.length > 0

  // Count active filters for badge
  const activeFilterCount =
    (searchText ? 1 : 0) + (assignedTo ? 1 : 0) + (myItemsOnly ? 1 : 0) + selectedTags.length

  // --- Shared filter elements ---

  const userDropdown = (iconOnly: boolean) =>
    users && users.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant={assignedTo ? "secondary" : "outline"}>
            <Users className="h-4 w-4 shrink-0" />
            {!iconOnly && (
              <span className="ml-1">
                {assignedTo
                  ? users.find((u) => u.id === assignedTo)?.displayName ?? "User"
                  : "User"}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Zugewiesen an</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {assignedTo && (
            <>
              <DropdownMenuItem
                onClick={handleUserClear}
                onSelect={(e) => e.preventDefault()}
              >
                <X className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                Filter entfernen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {users.map((user) => (
            <DropdownMenuCheckboxItem
              key={user.id}
              checked={assignedTo === user.id}
              onCheckedChange={() => handleUserToggle(user.id)}
              onSelect={(e) => e.preventDefault()}
            >
              {user.displayName ?? user.id}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null

  const tagsDropdown = (iconOnly: boolean) =>
    tags.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant={selectedTags.length > 0 ? "secondary" : "outline"}>
            <Tag className="h-4 w-4 shrink-0" />
            {!iconOnly && <span className="ml-1">Tags</span>}
            {selectedTags.length > 0 && (
              <span className="ml-1 text-xs bg-primary/20 rounded-full px-1.5">
                {selectedTags.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Tags filtern</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {selectedTags.length > 0 && (
            <>
              <DropdownMenuItem
                onClick={handleTagsClear}
                onSelect={(e) => e.preventDefault()}
              >
                <X className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                Alle entfernen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {tags.map((tag) => (
            <DropdownMenuCheckboxItem
              key={tag}
              checked={selectedTags.includes(tag)}
              onCheckedChange={() => handleTagToggle(tag)}
              onSelect={(e) => e.preventDefault()}
            >
              {tag}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null

  const settingsButton = onEditColumns ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEditColumns}>
          Spalten bearbeiten
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null

  return (
    <div className={cn("@container flex flex-col gap-2", className)}>
      {/* First row: actions + filter toggle + settings */}
      <div className="flex items-center gap-2">
        {onCreateItem && (
          <Button size="sm" onClick={onCreateItem}>
            <Plus className="h-4 w-4 mr-1" />
            Task
          </Button>
        )}

        {currentUserId && (
          <Button
            size="sm"
            variant={myItemsOnly ? "secondary" : "outline"}
            onClick={handleMyItemsToggle}
          >
            <UserIcon className="h-4 w-4 shrink-0" />
            <span className="ml-1 hidden @3xl:inline">Meine Tasks</span>
          </Button>
        )}

        <div className="flex-1" />

        {/* Filter toggle */}
        <Button
          size="sm"
          variant={filtersOpen ? "secondary" : "outline"}
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="relative"
        >
          <Filter className="h-4 w-4" />
          <span className="ml-1 hidden @3xl:inline">Filter</span>
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>

        {extraActions}

        {settingsButton}
      </div>

      {/* Second row (collapsible): search + filter dropdowns */}
      {filtersOpen && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[120px] @3xl:min-w-[150px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Suchen..."
              value={searchText}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-8 pl-7"
            />
          </div>

          {userDropdown(false)}
          {tagsDropdown(false)}

          {/* Multi-Select Toggle */}
          {onMultiSelectChange && (
            <Button
              size="sm"
              variant={multiSelect ? "secondary" : "outline"}
              onClick={handleMultiSelectToggle}
            >
              <CheckSquare className="h-4 w-4" />
              <span className="ml-1 hidden @3xl:inline">Selektion</span>
            </Button>
          )}

          {hasActiveFilters && (
            <Button size="sm" variant="outline" onClick={resetFilters}>
              <X className="h-4 w-4 mr-1" />
              <span className="hidden @3xl:inline">Zurücksetzen</span>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
