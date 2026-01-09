"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface AppShellProps {
  children: React.ReactNode
  className?: string
}

export function AppShell({ children, className }: AppShellProps) {
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      {children}
    </div>
  )
}

interface AppShellMainProps {
  children: React.ReactNode
  className?: string
  /** Add padding at bottom for mobile bottom navigation */
  withBottomNav?: boolean
}

export function AppShellMain({
  children,
  className,
  withBottomNav = false,
}: AppShellMainProps) {
  return (
    <main
      className={cn(
        "flex-1",
        withBottomNav && "pb-20 md:pb-0",
        className
      )}
    >
      {children}
    </main>
  )
}
