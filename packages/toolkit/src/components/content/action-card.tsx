"use client"

import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type ActionVariant = "primary" | "secondary"

interface ActionCardProps {
  icon: LucideIcon
  label: string
  description?: string
  variant?: ActionVariant
  onClick?: () => void
  className?: string
}

export function ActionCard({
  icon: Icon,
  label,
  description,
  variant = "secondary",
  onClick,
  className,
}: ActionCardProps) {
  const isPrimary = variant === "primary"

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        isPrimary
          ? "bg-primary/5 border-primary/20 hover:bg-primary/10 hover:border-primary/30"
          : "bg-card border-border hover:bg-accent/5 hover:border-border/80",
        className
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          isPrimary
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "font-medium",
            isPrimary ? "text-primary" : "text-foreground"
          )}
        >
          {label}
        </p>
        {description && (
          <p className="text-sm text-muted-foreground truncate">{description}</p>
        )}
      </div>
    </button>
  )
}
