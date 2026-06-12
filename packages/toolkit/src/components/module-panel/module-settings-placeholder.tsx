"use client"

import { Settings } from "lucide-react"
import type { ReactNode } from "react"

export interface ModuleSettingsPlaceholderProps {
  /** Module display name, e.g. "Kanban" — shown in the heading. */
  moduleLabel: string
  /**
   * Optional list of planned settings to hint at what will live here.
   * Rendered as muted bullet points so Sebastian has a concrete surface
   * to design into.
   */
  plannedItems?: ReactNode[]
}

/**
 * Placeholder content for the per-module settings panel. Opened into the
 * shared `ModulePanel` via a gear button in the module toolbar.
 *
 * Intentionally non-functional for now: it reserves the entry point and
 * the surface. Sebastian-Wunsch 12.06.2026 — Moduleinstellungen kommen
 * früher oder später pro Modul; bis dahin steht hier der Platzhalter.
 */
export function ModuleSettingsPlaceholder({
  moduleLabel,
  plannedItems,
}: ModuleSettingsPlaceholderProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4 pr-12">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Settings className="h-4 w-4" />
          {moduleLabel}-Einstellungen
        </h2>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <p className="text-sm text-muted-foreground">
          Moduleinstellungen sind in Vorbereitung. Hier konfigurierst du
          später, wie das {moduleLabel}-Modul in diesem Space aussieht und
          sich verhält.
        </p>
        {plannedItems && plannedItems.length > 0 && (
          <div className="rounded-lg border border-dashed p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Geplant
            </p>
            <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {plannedItems.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
