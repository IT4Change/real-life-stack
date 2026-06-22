import { Skeleton } from "../primitives/skeleton"
import { cn } from "@/lib/utils"

/**
 * Loading placeholder shaped like {@link ItemPreview} (author row + title +
 * description lines). Shown while an item query is still loading — distinct from
 * the empty state, which appears once a query has loaded but returned nothing.
 */
export function ItemPreviewSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)} aria-hidden>
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2 py-1">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    </div>
  )
}
