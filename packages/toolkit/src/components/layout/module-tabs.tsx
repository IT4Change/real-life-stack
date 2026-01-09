"use client"

import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

export interface Module {
  id: string
  label: string
  icon: LucideIcon
}

interface ModuleTabsProps {
  modules: Module[]
  activeModule: string
  onModuleChange: (moduleId: string) => void
  className?: string
}

export function ModuleTabs({
  modules,
  activeModule,
  onModuleChange,
  className,
}: ModuleTabsProps) {
  return (
    <nav className={cn("hidden md:flex items-center gap-1", className)}>
      {modules.map((module) => {
        const Icon = module.icon
        const isActive = activeModule === module.id

        return (
          <button
            key={module.id}
            onClick={() => onModuleChange(module.id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{module.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
