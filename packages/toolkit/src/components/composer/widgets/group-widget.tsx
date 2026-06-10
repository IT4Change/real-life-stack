"use client"

import { cn } from "@/lib/utils"

interface GroupOption {
  id: string
  name: string
}

interface GroupWidgetProps {
  value: string
  onChange: (value: string) => void
  label: string
  options: GroupOption[]
  required?: boolean
}

export function GroupWidget({
  value,
  onChange,
  label,
  options,
  required,
}: GroupWidgetProps) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </span>
      <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
            value === option.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {option.name}
        </button>
      ))}
      </div>
    </div>
  )
}
