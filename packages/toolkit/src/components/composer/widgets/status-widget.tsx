"use client"

import { cn } from "@/lib/utils"

interface StatusOption {
  id: string
  label: string
  className?: string
}

interface StatusWidgetProps {
  value: string
  onChange: (value: string) => void
  label: string
  options: StatusOption[]
}

export function StatusWidget({
  value,
  onChange,
  label,
  options,
}: StatusWidgetProps) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
            value === option.id
              ? option.className || "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {option.label}
        </button>
      ))}
      </div>
    </div>
  )
}
