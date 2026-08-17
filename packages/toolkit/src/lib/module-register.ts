// Modul-Register — die einzige Quelle fuer die Frage, welche Module es gibt.
//
// Spec: docs/spec/01-app-composition.md → "Modul-Register".
//
// Dieselbe Frage wurde vorher an fuenf Stellen unabhaengig beantwortet:
// Aktivierbarkeit im Space-Dialog, gueltige Modul-Segmente im Routing,
// Anzeigenamen, Dispatch der Flaeche und der Fallback der
// Benachrichtigungs-Navigation. Die Listen sind lautlos auseinandergelaufen —
// `collection` und `graph` fehlten in der Benachrichtigungs-Liste, und ein neu
// gebautes Modul erschien in der Uebersicht, liess sich aber in KEINEM Space
// aktivieren, weil der Eintrag im Dialog fehlte.
//
// Das Muster folgt dem Typ-Register (Spec 06), mit einem Unterschied: Ein
// Modul ist vollstaendig Darstellung. Es braucht darum keine UI-freie Schicht
// in data-interface; das Register lebt hier, und Apps haengen ihre Flaechen
// an die Ids.

import type { ComponentType } from "react"
import {
  Calendar,
  Columns3,
  List,
  Map as MapIcon,
  Newspaper,
  Share2,
  Waves,
  type LucideIcon,
} from "lucide-react"

/** Wie ein Modul den Content-Bereich fuellt (Spec 01, "Content-Bereich"). */
export type ModuleFill = "container" | "bleed"

/**
 * Props, die jede Modul-Flaeche entgegennimmt. Das Outlet reicht alle durch;
 * ein Modul nimmt, was es braucht. Bewusst ein gemeinsamer Vertrag statt
 * Sonderfaellen im Dispatch — sonst waere der Dispatch wieder eine Liste,
 * die weiss, welches Modul was bekommt.
 */
export interface ModuleViewProps {
  /** Aktiver Space; leer im Aggregat. */
  groupId: string
  /** Ob dieses Modul gerade sichtbar ist — relevant fuer `keepMounted`. */
  active: boolean
  /** Alle sichtbaren Spaces — fuer Module, die spaceuebergreifend zeigen. */
  groups?: readonly unknown[]
  /** Sichtbarer Bereich fuer Fokus-Scrolling (siehe selection-focus.ts). */
  selectionFocusVisibleArea?: unknown
}

export interface ModuleEntry {
  /** Stabile Identitaet: URL-Segment und Schluessel in `Group.data.modules`. */
  id: string
  label: string
  icon: LucideIcon | ComponentType<{ className?: string }>
  /** Bekommt ein neu angelegter Space dieses Modul? */
  enabledByDefault?: boolean
  /** Standard: "container". */
  fill?: ModuleFill
  /** Container-Breite; nur bei fill "container" wirksam. */
  maxWidth?: string
  /**
   * Flaeche im Baum halten statt beim Modulwechsel abzubauen. Fuer Module,
   * deren Aufbau teuer ist — die Karte braucht WebGL-Kontext, Worker und
   * einen entfernten Style, zusammen rund eine Sekunde pro Mount.
   */
  keepMounted?: boolean
  /** Die Flaeche selbst. Kommt von der App, nicht vom Toolkit. */
  view?: ComponentType<ModuleViewProps>
}

/** Additive Ergaenzung eines VORHANDENEN Eintrags (Spec 01, Regel 2). */
export interface ModuleFragment extends Partial<Omit<ModuleEntry, "id">> {
  id: string
}

/** Die Module, die RLS selbst mitliefert. Reihenfolge = Tab-Reihenfolge. */
export const CORE_MODULES: readonly ModuleEntry[] = Object.freeze([
  { id: "feed", label: "Feed", icon: Newspaper, enabledByDefault: true, maxWidth: "max-w-3xl" },
  { id: "kanban", label: "Kanban", icon: Columns3, enabledByDefault: true, maxWidth: "max-w-5xl" },
  { id: "calendar", label: "Kalender", icon: Calendar, enabledByDefault: true, maxWidth: "max-w-5xl" },
  { id: "map", label: "Karte", icon: MapIcon, enabledByDefault: true, fill: "bleed", keepMounted: true },
  // Opt-in — spec: docs/spec/modules/resonance.md
  { id: "resonance", label: "Resonanz", icon: Waves, maxWidth: "max-w-3xl" },
  { id: "collection", label: "Liste", icon: List, fill: "bleed" },
  { id: "graph", label: "Graph", icon: Share2, fill: "bleed" },
])

interface Layer {
  name: string
  definitions: ModuleEntry[]
  extensions: ModuleFragment[]
}

const layers = new Map<string, Layer>()

function coreLayer(): Layer {
  return { name: "core", definitions: [...CORE_MODULES], extensions: [] }
}

/** Nur fuer Tests. */
export function resetModuleRegistryForTests(): void {
  layers.clear()
  layers.set("core", coreLayer())
}
layers.set("core", coreLayer())

/**
 * Fuehrt neue Module ein. Eine bereits vergebene Id ist ein Konflikt und wird
 * abgelehnt — es gibt kein Shadowing, still oder ausdruecklich (Spec 01,
 * Regel 2). Dieselbe Schicht erneut zu registrieren ersetzt sie (Vite-HMR).
 */
export function registerModules(layerName: string, definitions: readonly ModuleEntry[]): void {
  if (layerName === "core") throw new Error("[rls] Die Core-Schicht ist nicht überschreibbar.")
  const others = [...layers.entries()].filter(([name]) => name !== layerName)
  for (const entry of definitions) {
    for (const [name, layer] of others) {
      if (layer.definitions.some((d) => d.id === entry.id)) {
        throw new Error(
          `[rls] Modul "${entry.id}" ist schon in der Schicht "${name}" definiert. ` +
            `Ein vorhandenes Modul wird ergaenzt (extendModules), nicht neu definiert.`,
        )
      }
    }
  }
  const existing = layers.get(layerName)
  layers.set(layerName, {
    name: layerName,
    definitions: [...definitions],
    extensions: existing?.extensions ?? [],
  })
}

/**
 * Ergaenzt vorhandene Module additiv — so haengt eine App ihre `view` an eine
 * Core-Id. Ein skalares Feld, das die Basis bereits setzt, ist ein Konflikt.
 */
export function extendModules(layerName: string, fragments: readonly ModuleFragment[]): void {
  const base = new Map(allDefinitions().map((d) => [d.id, d]))
  for (const f of fragments) {
    const b = base.get(f.id)
    if (!b) {
      throw new Error(
        `[rls] Modul "${f.id}" ist unbekannt — ein Fragment kann nur ergaenzen, was es gibt.`,
      )
    }
    for (const key of ["label", "icon", "fill", "maxWidth"] as const) {
      if (f[key] !== undefined && b[key] !== undefined && f[key] !== b[key]) {
        throw new Error(
          `[rls] Modul "${f.id}": "${key}" ist in der Basis gesetzt und darf nicht ueberschrieben werden.`,
        )
      }
    }
  }
  const existing = layers.get(layerName)
  layers.set(layerName, {
    name: layerName,
    definitions: existing?.definitions ?? [],
    extensions: [...fragments],
  })
}

function allDefinitions(): ModuleEntry[] {
  const out: ModuleEntry[] = []
  for (const layer of layers.values()) out.push(...layer.definitions)
  return out
}

/** Alle Module, Core zuerst, danach in Registrierungsreihenfolge. */
export function getModules(): ModuleEntry[] {
  const merged = new Map<string, ModuleEntry>()
  for (const d of allDefinitions()) merged.set(d.id, { ...d })
  for (const layer of layers.values()) {
    for (const f of layer.extensions) {
      const base = merged.get(f.id)
      if (!base) continue
      merged.set(f.id, { ...base, ...stripUndefined(f) })
    }
  }
  return [...merged.values()]
}

function stripUndefined(f: ModuleFragment): Partial<ModuleEntry> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(f)) if (v !== undefined && k !== "id") out[k] = v
  return out as Partial<ModuleEntry>
}

export function getModule(id: string): ModuleEntry | undefined {
  return getModules().find((m) => m.id === id)
}

/** Alle bekannten Ids. Jede Flaeche, die Module aufzaehlt, leitet hieraus ab. */
export function moduleIds(): string[] {
  return getModules().map((m) => m.id)
}

/** Was ein neu angelegter Space fuehrt. */
export function defaultModuleIds(): string[] {
  return getModules()
    .filter((m) => m.enabledByDefault)
    .map((m) => m.id)
}

/**
 * Die Teilmenge einer gespeicherten `data.modules`-Liste, die diese App
 * darstellen kann — Reihenfolge bleibt erhalten, die Eingabe unveraendert.
 *
 * Eine unbekannte Id ist KEIN Fehler: Sie stammt aus einer anderen
 * App-Version. Sie bleibt gespeichert und wird nur nicht gezeigt. Wer
 * Garantien zaehlt ("mindestens ein Modul bleibt aktiv"), MUSS diese Liste
 * zaehlen und nicht die rohe — sonst erfuellt eine Legacy-Id die Bedingung
 * und der Space endet ohne nutzbaren Tab (rls#249).
 */
export function displayableModules(stored: readonly string[]): string[] {
  const known = new Set(moduleIds())
  return stored.filter((id) => known.has(id))
}
