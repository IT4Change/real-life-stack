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

/** Eine Kompositionsschicht: Core, App oder Space. */
export interface ModuleLayer {
  /** Fuer Konfliktmeldungen ("app", "space:garten", …). */
  name: string
  definitions?: readonly ModuleEntry[]
  extensions?: readonly ModuleFragment[]
}

/** Das fertig zusammengesetzte, unveraenderliche Register. */
export type ModuleRegistry = readonly ModuleEntry[]

/** Die Core-Schicht. */
export const CORE_MODULE_LAYER: ModuleLayer = Object.freeze({
  name: "core",
  definitions: CORE_MODULES,
})

const SCALARS = ["label", "icon", "enabledByDefault", "fill", "maxWidth", "keepMounted", "view"] as const

/**
 * Setzt Schichten in der Reihenfolge Core → App → Space zusammen und friert
 * das Ergebnis ein.
 *
 * Bewusst eine Funktion statt globaler Mutation: Wer waehrend des Imports
 * registriert und woanders beim Import liest, bekommt je nach
 * Importreihenfolge ein anderes Register — und merkt es nicht. Hier wird
 * einmal komponiert, einmal gesetzt, danach ist es unveraenderlich.
 *
 * Konflikte werden abgelehnt, nicht aufgeloest: Es gibt kein Shadowing,
 * still oder ausdruecklich (Spec 01, Regel 2).
 */
export function composeModules(layers: readonly ModuleLayer[]): ModuleRegistry {
  const order: string[] = []
  const byId = new Map<string, ModuleEntry>()
  /** Wer hat welches skalare Feld gesetzt — fuer die Konfliktmeldung. */
  const owner = new Map<string, Map<string, string>>()

  for (const layer of layers) {
    for (const def of layer.definitions ?? []) {
      if (byId.has(def.id)) {
        throw new Error(
          `[rls] Modul "${def.id}": Schicht "${layer.name}" definiert es erneut. ` +
            `Ein vorhandenes Modul wird ergaenzt (extensions), nicht neu definiert.`,
        )
      }
      byId.set(def.id, { ...def })
      order.push(def.id)
      const fields = new Map<string, string>()
      for (const k of SCALARS) if (def[k] !== undefined) fields.set(k, layer.name)
      owner.set(def.id, fields)
    }
  }

  for (const layer of layers) {
    for (const frag of layer.extensions ?? []) {
      const base = byId.get(frag.id)
      if (!base) {
        throw new Error(
          `[rls] Modul "${frag.id}": Schicht "${layer.name}" will es ergaenzen, ` +
            `aber kein Eintrag fuehrt diese Id ein.`,
        )
      }
      const fields = owner.get(frag.id)!
      for (const k of SCALARS) {
        const value = frag[k]
        if (value === undefined) continue
        const held = fields.get(k)
        if (held !== undefined) {
          throw new Error(
            `[rls] Modul "${frag.id}": "${k}" ist bereits von "${held}" gesetzt, ` +
              `Schicht "${layer.name}" wuerde es ueberschreiben.`,
          )
        }
        ;(base as unknown as Record<string, unknown>)[k] = value
        fields.set(k, layer.name)
      }
    }
  }

  return Object.freeze(order.map((id) => Object.freeze(byId.get(id)!)))
}

// Das aktive Register. Vor `setModuleRegistry` gilt allein die Core-Schicht,
// damit Toolkit-Flaechen (Storybook, Tests) ohne App-Bootstrap funktionieren.
let active: ModuleRegistry = composeModules([CORE_MODULE_LAYER])

/**
 * Bindet das komponierte Register. Einmal, vor dem ersten Render — danach
 * aendert sich nichts mehr, und keine Fläche muss sich fragen, ob sie zu
 * frueh gelesen hat.
 */
export function setModuleRegistry(registry: ModuleRegistry): void {
  active = registry
}

/** Nur fuer Tests. */
export function resetModuleRegistryForTests(): void {
  active = composeModules([CORE_MODULE_LAYER])
}

/**
 * Alle Module. IMMER aufrufen, nie das Ergebnis auf Modulebene festhalten:
 * `const IDS = moduleIds()` neben dem Import ist ein Schnappschuss, der eine
 * spaeter gebundene App-Schicht nicht mehr sieht.
 */
export function getModules(): ModuleRegistry {
  return active
}

export function getModule(id: string): ModuleEntry | undefined {
  return active.find((m) => m.id === id)
}

/** Alle bekannten Ids. Jede Flaeche, die Module aufzaehlt, leitet hieraus ab. */
export function moduleIds(): string[] {
  return active.map((m) => m.id)
}

/** Was ein neu angelegter Space fuehrt. */
export function defaultModuleIds(): string[] {
  return active.filter((m) => m.enabledByDefault).map((m) => m.id)
}

/** Kennt das Register diese Id? */
export function isKnownModule(id: string): boolean {
  return active.some((m) => m.id === id)
}

/**
 * Die Teilmenge einer gespeicherten `data.modules`-Liste, die diese App
 * darstellen kann — Reihenfolge bleibt erhalten, die Eingabe unveraendert.
 *
 * Eine unbekannte Id ist KEIN Fehler: Sie stammt aus einer anderen
 * App-Version. Sie bleibt gespeichert und wird nur nicht gezeigt. Wer
 * Garantien zaehlt ("mindestens ein Modul bleibt aktiv") oder ein Modul
 * AUSWAEHLT (Routing, Default-Tab), MUSS diese Liste nehmen und nicht die
 * rohe — sonst landet der Nutzer auf einem Modul, das diese App nicht
 * darstellen kann (rls#249).
 */
export function displayableModules(stored: readonly string[]): string[] {
  return stored.filter((id) => isKnownModule(id))
}
