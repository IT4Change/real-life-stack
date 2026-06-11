"use client"

import type { User } from "@real-life-stack/data-interface"
import { Avatar, AvatarFallback, AvatarImage } from "../primitives/avatar"
import { Tooltip, TooltipTrigger, TooltipContent } from "../primitives/tooltip"
import { cn } from "../../lib/utils"

/**
 * `ItemAssignees` — overlapping avatar stack with a compact name
 * summary, used by `footerAdornment` to show who an item is assigned
 * to. Spec: `docs/spec/modules/shared-components.md` → `ItemAssignees`.
 *
 * Caller resolves the user objects (typically by reading
 * `assignedTo`-style relations and looking them up in a member list).
 * The component is purely presentational.
 *
 * Renders nothing when `users` is empty so callers can drop it in
 * unconditionally.
 *
 * UX:
 * - Avatars overlap with a 1.5-unit negative gap
 * - Short name summary on the right: single name, "A, B" for two,
 *   "A + N weitere" for three or more
 * - Hover-tooltip with the full comma-separated list
 */
export interface ItemAssigneesProps {
  users: readonly User[]
  className?: string
}

function getInitials(name: string): string {
  if (!name) return "?"
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]!).join("").toUpperCase().slice(0, 2)
}

export function ItemAssignees({ users, className }: ItemAssigneesProps) {
  if (users.length === 0) return null

  const summary =
    users.length === 1
      ? users[0].displayName ?? users[0].id
      : users.length === 2
        ? `${users[0].displayName ?? users[0].id}, ${users[1].displayName ?? users[1].id}`
        : `${users[0].displayName ?? users[0].id} + ${users.length - 1} weitere`

  const fullList = users.map((u) => u.displayName ?? u.id).join(", ")

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center gap-1", className)}>
          <div className="flex -space-x-1.5">
            {users.map((user) => (
              <Avatar key={user.id} className="h-5 w-5 border border-background">
                <AvatarImage src={user.avatarUrl} alt={user.displayName ?? user.id} />
                <AvatarFallback className="text-[8px] bg-muted">
                  {getInitials(user.displayName ?? user.id)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">{summary}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{fullList}</TooltipContent>
    </Tooltip>
  )
}
