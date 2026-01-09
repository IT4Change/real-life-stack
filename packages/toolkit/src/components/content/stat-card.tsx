"use client"

import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type StatColor = "blue" | "green" | "orange" | "purple" | "red"

interface StatCardProps {
  icon: LucideIcon
  value: number | string
  label: string
  color?: StatColor
  className?: string
}

const colorClasses: Record<StatColor, { bg: string; text: string }> = {
  blue: {
    bg: "bg-primary/10",
    text: "text-primary",
  },
  green: {
    bg: "bg-secondary/10",
    text: "text-secondary",
  },
  orange: {
    bg: "bg-accent/10",
    text: "text-accent",
  },
  purple: {
    bg: "bg-purple-100 dark:bg-purple-900/30",
    text: "text-purple-600 dark:text-purple-400",
  },
  red: {
    bg: "bg-destructive/10",
    text: "text-destructive",
  },
}

export function StatCard({
  icon: Icon,
  value,
  label,
  color = "blue",
  className,
}: StatCardProps) {
  const colors = colorClasses[color]

  return (
    <Card className={cn("transition-all hover:shadow-md", className)}>
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl",
            colors.bg
          )}
        >
          <Icon className={cn("h-6 w-6", colors.text)} />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}
