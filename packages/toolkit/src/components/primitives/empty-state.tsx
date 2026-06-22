import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface EmptyStateProps {
  /** Optional illustrative icon shown above the title. */
  icon?: LucideIcon
  title: string
  description?: string
  /** Optional call-to-action (e.g. a "create" button). */
  action?: ReactNode
  className?: string
}

/**
 * Shared empty-state for module surfaces: shown when a query has **loaded** but
 * returned nothing (distinct from "still loading", which shows a skeleton). A
 * neutral, centered icon + title + optional description and action.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && <Icon className="h-10 w-10 text-muted-foreground/50" aria-hidden />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
