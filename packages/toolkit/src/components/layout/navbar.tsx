"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface NavbarProps {
  children?: React.ReactNode
  className?: string
}

export function Navbar({ children, className }: NavbarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full",
        "glass-navbar",
        "shadow-sm",
        className
      )}
    >
      <div className="flex h-14 items-center px-4">{children}</div>
    </header>
  )
}

interface NavbarSectionProps {
  children?: React.ReactNode
  className?: string
}

export function NavbarStart({ children, className }: NavbarSectionProps) {
  return (
    <div className={cn("flex items-center gap-2 w-56 shrink-0", className)}>{children}</div>
  )
}

export function NavbarCenter({ children, className }: NavbarSectionProps) {
  return (
    <div className={cn("flex flex-1 items-center justify-center", className)}>
      {children}
    </div>
  )
}

export function NavbarEnd({ children, className }: NavbarSectionProps) {
  return (
    <div className={cn("flex items-center gap-2 w-56 shrink-0 justify-end", className)}>{children}</div>
  )
}
