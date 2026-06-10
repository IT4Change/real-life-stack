"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn, getTagColor } from "@/lib/utils"

interface TagsWidgetProps {
  value: string[]
  onChange: (value: string[]) => void
  label: string
  suggestions?: string[] | ((query: string) => Promise<string[]>)
  /** Quick-select suggestions shown as clickable chips below the input */
  quickSuggestions?: string[]
}

export function TagsWidget({
  value,
  onChange,
  label,
  suggestions,
  quickSuggestions,
}: TagsWidgetProps) {
  const [query, setQuery] = React.useState("")
  const [filtered, setFiltered] = React.useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!query.trim()) {
      setFiltered([])
      return
    }

    if (Array.isArray(suggestions)) {
      setFiltered(
        suggestions.filter(
          (s) =>
            s.toLowerCase().includes(query.toLowerCase()) &&
            !value.includes(s),
        ),
      )
    } else if (typeof suggestions === "function") {
      let cancelled = false
      suggestions(query).then((results) => {
        if (!cancelled) {
          setFiltered(results.filter((s) => !value.includes(s)))
        }
      })
      return () => {
        cancelled = true
      }
    }
  }, [query, suggestions, value])

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

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setQuery("")
    setShowSuggestions(false)
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (filtered.length > 0) {
        addTag(filtered[0])
      } else if (query.trim()) {
        addTag(query)
      }
    }
    if (e.key === "Backspace" && !query && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium", getTagColor(tag))}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
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
          {filtered.slice(0, 8).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => addTag(suggestion)}
              className={cn(
                "w-full rounded-sm px-2 py-1.5 text-left text-sm",
                "hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      {quickSuggestions && quickSuggestions.filter((s) => !value.includes(s)).length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {quickSuggestions
            .filter((s) => !value.includes(s))
            .map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className={cn(
                  "inline-flex cursor-pointer items-center rounded-full px-2 py-0.5 text-[10px] font-medium opacity-70 transition-opacity hover:opacity-100",
                  getTagColor(tag),
                )}
              >
                {tag}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
