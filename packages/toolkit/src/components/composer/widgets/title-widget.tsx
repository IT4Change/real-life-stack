"use client"

import { Input } from "@/components/primitives/input"

interface TitleWidgetProps {
  value: string
  onChange: (value: string) => void
  label: string
  autoFocus?: boolean
}

export function TitleWidget({ value, onChange, label, autoFocus }: TitleWidgetProps) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={label}
      className="text-lg font-semibold"
      autoFocus={autoFocus}
    />
  )
}
