"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PersonOption {
  id: string
  name: string
}

interface PeopleWidgetProps {
  value: string[]
  onChange: (value: string[]) => void
  label: string
  /** Structured options: widget stores IDs, displays names */
  options?: PersonOption[]
  /** Simple string suggestions (legacy). Ignored when `options` is provided. */
  suggestions?: string[] | ((query: string) => Promise<string[]>)
  /** Quick-select suggestions shown as clickable chips below the input */
  quickSuggestions?: PersonOption[]
}

export function PeopleWidget({
  value,
  onChange,
  label,
  options,
  suggestions,
  quickSuggestions,
}: PeopleWidgetProps) {
  const [query, setQuery] = React.useState("")
  const [filtered, setFiltered] = React.useState<PersonOption[]>([])
  const [showSuggestions, setShowSuggestions] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement>(null)

  // Build a lookup map from options for resolving display names
  const optionMap = React.useMemo(() => {
    if (!options) return null
    const map = new Map<string, string>()
    for (const o of options) map.set(o.id, o.name)
    return map
  }, [options])

  const resolveLabel = React.useCallback(
    (id: string) => optionMap?.get(id) ?? id,
    [optionMap],
  )

  React.useEffect(() => {
    const q = query.trim().toLowerCase()

    if (options) {
      // Show all non-selected options when query is empty, filter by name otherwise
      setFiltered(
        options.filter(
          (o) =>
            (!q || o.name.toLowerCase().includes(q)) &&
            !value.includes(o.id),
        ),
      )
    } else if (!q) {
      // Legacy string suggestions: no query means no suggestions
      setFiltered([])
    } else if (Array.isArray(suggestions)) {
      setFiltered(
        suggestions
          .filter(
            (s) =>
              s.toLowerCase().includes(q) &&
              !value.includes(s),
          )
          .map((s) => ({ id: s, name: s })),
      )
    } else if (typeof suggestions === "function") {
      let cancelled = false
      suggestions(query).then((results) => {
        if (!cancelled) {
          setFiltered(
            results
              .filter((s) => !value.includes(s))
              .map((s) => ({ id: s, name: s })),
          )
        }
      })
      return () => {
        cancelled = true
      }
    }
  }, [query, options, suggestions, value])

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const addPerson = (id: string) => {
    const trimmed = id.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setQuery("")
    setShowSuggestions(false)
  }

  const removePerson = (id: string) => {
    onChange(value.filter((p) => p !== id))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (filtered.length > 0) {
        addPerson(filtered[0].id)
      }
    }
    if (e.key === "Backspace" && !query && value.length > 0) {
      removePerson(value[value.length - 1])
    }
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5">
        {value.map((personId) => (
          <span
            key={personId}
            className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 px-2 py-0.5 text-xs font-medium"
          >
            {resolveLabel(personId)}
            <button
              type="button"
              onClick={() => removePerson(personId)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowSuggestions(true)
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? "Hinzufuegen..." : ""}
          className="min-w-[60px] flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute top-full z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
          {filtered.slice(0, 8).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => addPerson(option.id)}
              className={cn(
                "w-full rounded-sm px-2 py-1.5 text-left text-sm",
                "hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}
      {quickSuggestions && quickSuggestions.filter((s) => !value.includes(s.id)).length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {quickSuggestions
            .filter((s) => !value.includes(s.id))
            .map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => addPerson(person.id)}
                className="inline-flex cursor-pointer items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700 opacity-70 transition-opacity hover:opacity-100 dark:bg-sky-900/30 dark:text-sky-300"
              >
                {person.name}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
