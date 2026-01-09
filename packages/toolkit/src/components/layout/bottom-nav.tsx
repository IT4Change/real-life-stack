"use client"

import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

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

export function BottomNav({
  items,
  activeItem,
  onItemChange,
  className,
}: BottomNavProps) {
  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg md:hidden",
        className
      )}
    >
      <div className="flex items-center justify-around py-2">
        {items.map((item) => {
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
      </div>
    </nav>
  )
}
