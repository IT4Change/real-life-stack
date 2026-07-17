"use client"

import { cn } from "@/lib/utils"
import { MoreHorizontal } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../primitives/dropdown-menu"

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
}

interface BottomNavProps {
  items: NavItem[]
  activeItem: string
  onItemChange: (itemId: string) => void
  className?: string
}

const DEFAULT_VISIBLE_ITEM_COUNT = 4

/** Keeps compact navigation touch-friendly while retaining access to every destination. */
export function bottomNavItems(items: readonly NavItem[], activeItem: string) {
  if (items.length <= DEFAULT_VISIBLE_ITEM_COUNT + 1) {
    return { visibleItems: items, overflowItems: [] as readonly NavItem[] }
  }

  const overflowItems = items.slice(DEFAULT_VISIBLE_ITEM_COUNT)
  const activeOverflowItem = overflowItems.find(({ id }) => id === activeItem)
  return {
    // An active overflow destination remains directly visible so its current state is never hidden.
    visibleItems: activeOverflowItem
      ? [...items.slice(0, DEFAULT_VISIBLE_ITEM_COUNT - 1), activeOverflowItem]
      : items.slice(0, DEFAULT_VISIBLE_ITEM_COUNT),
    overflowItems: activeOverflowItem
      ? overflowItems.filter(({ id }) => id !== activeOverflowItem.id).concat(items[DEFAULT_VISIBLE_ITEM_COUNT - 1]!)
      : overflowItems,
  }
}

export function BottomNav({
  items,
  activeItem,
  onItemChange,
  className,
}: BottomNavProps) {
  const { visibleItems, overflowItems } = bottomNavItems(items, activeItem)
  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg pb-[env(safe-area-inset-bottom)] md:hidden",
        className
      )}
    >
      <div className="flex items-center justify-around py-2">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive = activeItem === item.id

          return (
            <button
              key={item.id}
              onClick={() => onItemChange(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span>{item.label}</span>
            </button>
          )
        })}
        {overflowItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Weitere Navigation"
                className="flex flex-col items-center gap-1 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <MoreHorizontal className="h-5 w-5" />
                <span>Mehr</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end">
              {overflowItems.map((item) => {
                const Icon = item.icon
                return (
                  <DropdownMenuItem key={item.id} onSelect={() => onItemChange(item.id)}>
                    <Icon />
                    {item.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  )
}
