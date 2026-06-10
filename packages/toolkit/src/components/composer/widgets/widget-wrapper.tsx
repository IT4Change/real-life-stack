"use client"

import type * as React from "react"

interface WidgetWrapperProps {
  visible: boolean
  children: React.ReactNode
}

export function WidgetWrapper({ visible, children }: WidgetWrapperProps) {
  if (!visible) return null

  return <>{children}</>
}
