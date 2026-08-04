"use client"

// Darstellungs-Register — the toolkit half of the canonical type register.
//
// Spec: docs/spec/06-schema-composition.md → "Typ-Register".
//
// Entries attach DISPLAY concerns (label, icon, badge, composer widgets, and
// the preview/detail/footer slot contents for the shared ItemPreview shell)
// to type ids owned by the type manifest in `data-interface`.
//
// The register is BOUND to the manifest: registering presentation for an id
// the manifest does not know throws — this layer cannot introduce types
// (spec rules 1 and 6). A manifest entry without presentation resolves to the
// generic fallback: visible and neutral, never broken (rule 5).
//
// Layers contribute like the manifest (spec "Erweiterung und Merge"):
// *definitions* present a type for the first time, *extensions* additively
// fill fields the base left unset — scalar fields only where the base has
// none, `relationWidgets` united by key. Conflicts throw; no override in
// v0.1. Re-registering the SAME layer replaces it wholesale (Vite HMR
// re-executes registering modules on edit; throwing would break dev).
//
// SCOPE: this registry implements the Core → App composition. The SPACE
// layer of the spec is deliberately NOT offered yet — the registry is a
// module-global, so a space layer would leak across spaces instead of being
// scoped to one. Space layers need a scope-bound registry (context/instance)
// and a dynamic composer path; tracked in rls#212. The layer/extension
// machinery below is written so that cut can build on it.

import type { ComponentType, ReactNode } from "react"
import { createElement } from "react"
import {
  Calendar,
  CheckSquare,
  MapPin,
  Shapes,
  User as UserIcon,
} from "lucide-react"
import {
  composeTypeManifest,
  CORE_TYPE_LAYER,
  isTask,
  relationAffordanceKey,
  type ComposedTypeManifest,
  type Item,
  type User,
} from "@real-life-stack/data-interface"

import { useMembers } from "../../hooks/use-groups"
import { useCurrentUser } from "../../hooks/use-auth"
import { ItemAssignees } from "./item-assignees"
import { ItemMetaRow } from "./item-meta-row"
import { ItemProfileMeta, ItemProjectMeta, ItemResourceMeta } from "./item-type-meta"

/** Every slot receives the item — nothing else. Data resolution (members,
 *  votes, …) happens inside the slot component via hooks, so a slot works on
 *  every surface without surface-specific plumbing. */
export interface ItemSlotProps {
  item: Item
}

export interface TypeBadgeStyle {
  icon: ComponentType<{ className?: string }>
  className: string
}

/** Presents a type for the first time (spec: Typdefinition, Darstellungsseite). */
export interface TypePresentationEntry {
  /** Must match a manifest id — this layer never introduces types. */
  id: string
  /** Display name; the manifest deliberately carries none (SRP). */
  label: string
  /** Badge styling. Absent = deliberately no badge (e.g. plain posts). */
  badge?: TypeBadgeStyle
  /** Widget set the composer opens with (ContentTypeConfig.defaultWidgets). */
  composerWidgets?: readonly string[]
  /** Composer widget per declared edge, keyed by `relationAffordanceKey`. */
  relationWidgets?: Readonly<Record<string, string>>
  /** Compact slot for cards and rows (metaAdornment). */
  preview?: ComponentType<ItemSlotProps>
  /** Panel slot (metaAdornment); defaults to `preview`, then ItemMetaRow. */
  detail?: ComponentType<ItemSlotProps>
  /** Type-own footer, rendered IN ADDITION to surface footers. */
  footer?: ComponentType<ItemSlotProps>
}

/** Additively fills fields an existing presentation left unset
 *  (spec: Erweiterungsfragment, Darstellungsseite). */
export interface TypePresentationFragment {
  /** Must address an id already presented by an earlier layer. */
  id: string
  badge?: TypeBadgeStyle
  composerWidgets?: readonly string[]
  /** United by key; an existing key is a conflict. */
  relationWidgets?: Readonly<Record<string, string>>
  preview?: ComponentType<ItemSlotProps>
  detail?: ComponentType<ItemSlotProps>
  footer?: ComponentType<ItemSlotProps>
}

export interface TypePresentationLayer {
  definitions?: readonly TypePresentationEntry[]
  extensions?: readonly TypePresentationFragment[]
}

/** What surfaces consume: entry with every fallback already applied. */
export interface ResolvedTypePresentation {
  id: string
  label: string
  badge?: TypeBadgeStyle
  composerWidgets?: readonly string[]
  relationWidgets?: Readonly<Record<string, string>>
  preview?: ComponentType<ItemSlotProps>
  detail: ComponentType<ItemSlotProps>
  footer?: ComponentType<ItemSlotProps>
  /** True when rendering generically: the type is unknown to the manifest OR
   *  has no presentation yet (spec rule 5 — visible, neutral, never broken). */
  generic: boolean
}

// ---------------------------------------------------------------------------
// Core slot components

/** Assignees are a TYPE rule (a task has assignees, wherever it is shown).
 *  `useMembers(null)` asks for the union of all known users, so an assignee
 *  resolves even when they are not a member of the surface's current space —
 *  including the signed-in user in their personal space. */
function TaskAssigneesFooter({ item }: ItemSlotProps) {
  const { data: members } = useMembers(null)
  const { data: currentUser } = useCurrentUser()
  if (!isTask(item)) return null
  const users = (item.relations ?? [])
    .filter((relation) => relation.predicate === "assignedTo")
    .map((relation) => {
      const id = relation.target.replace(/^global:/, "")
      return members.find((m) => m.id === id) ?? (currentUser?.id === id ? currentUser : undefined)
    })
    .filter((user): user is User => !!user)
  if (users.length === 0) return null
  return <ItemAssignees users={users} />
}

function EventPreview({ item }: ItemSlotProps) {
  return <ItemMetaRow item={item} />
}

const GENERIC_DETAIL: ComponentType<ItemSlotProps> = function GenericDetail({ item }) {
  return <ItemMetaRow item={item} />
}

/** The generic fallback badge style (spec rule 5). */
export const GENERIC_BADGE: TypeBadgeStyle = {
  icon: Shapes,
  className: "bg-muted text-muted-foreground border-border",
}

// ---------------------------------------------------------------------------
// Registry state

/** The seven core types RLS ships (spec 06, "Core-Typ"). Labels and badge
 *  styles are verbatim from the previous ItemTypeBadge DEFAULT_CONFIG; the
 *  preview slots are the previous getItemPreviewAdornments bodies. */
const CORE_PRESENTATION: readonly TypePresentationEntry[] = [
  { id: "post", label: "Post", composerWidgets: ["text"] },
  {
    id: "event",
    label: "Event",
    badge: { icon: Calendar, className: "bg-blue-50 text-blue-700 border-blue-200" },
    composerWidgets: ["title", "text", "date", "location"],
    relationWidgets: { [relationAffordanceKey({ predicate: "invited", itemRole: "from" })]: "people" },
    preview: EventPreview,
  },
  {
    id: "place",
    label: "Ort",
    badge: { icon: MapPin, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    composerWidgets: ["title", "text", "location"],
  },
  {
    id: "task",
    label: "Task",
    badge: { icon: CheckSquare, className: "bg-amber-50 text-amber-700 border-amber-200" },
    composerWidgets: ["title", "text", "status", "people", "tags"],
    relationWidgets: { [relationAffordanceKey({ predicate: "assignedTo", itemRole: "from" })]: "people" },
    footer: TaskAssigneesFooter,
  },
  {
    id: "person",
    label: "Profil",
    badge: { icon: UserIcon, className: "bg-violet-50 text-violet-700 border-violet-200" },
    preview: ItemProfileMeta,
  },
  { id: "project", label: "Projekt", preview: ItemProjectMeta },
  { id: "resource", label: "Ressource", preview: ItemResourceMeta },
]

/** Toolkit default: core manifest only. Apps composing more layers hand the
 *  result in via {@link setTypeManifest} BEFORE registering presentation. */
const CORE_ONLY_MANIFEST = composeTypeManifest([CORE_TYPE_LAYER])

let manifest: ComposedTypeManifest = CORE_ONLY_MANIFEST
const layers = new Map<string, TypePresentationLayer>([
  ["core", { definitions: CORE_PRESENTATION }],
])
/** Composed view, invalidated on every registration. */
let composedCache: Map<string, TypePresentationEntry> | null = null

/**
 * Bind the register to the app's composed manifest (the authoritative type
 * identity, spec rule 1). Call once at startup, before app/space layers
 * register presentation. Existing layers are re-validated against the new
 * manifest so a narrower manifest cannot leave orphans behind.
 */
export function setTypeManifest(next: ComposedTypeManifest): void {
  for (const [name, layer] of layers) {
    for (const entry of layer.definitions ?? []) {
      if (!next.has(entry.id)) {
        throw new Error(
          `Typ-Register: Manifest kennt "${entry.id}" nicht, Layer "${name}" präsentiert es aber — das Darstellungs-Register führt keine Typen ein (Spec 06, Regel 1/6).`,
        )
      }
      assertRelationWidgetKeys(next, entry.id, entry.relationWidgets, name)
    }
  }
  manifest = next
}

/** Every relationWidgets key MUST name an edge the manifest declares for the
 *  type — the UI cannot offer a widget for an affordance that has no
 *  authoritative identity (spec: Verhältnis zu Relations, Regel 2/3). */
function assertRelationWidgetKeys(
  source: ComposedTypeManifest,
  typeId: string,
  widgets: Readonly<Record<string, string>> | undefined,
  layerName: string,
): void {
  if (!widgets) return
  const declared = new Set((source.get(typeId)?.relations ?? []).map(relationAffordanceKey))
  for (const key of Object.keys(widgets)) {
    if (!declared.has(key)) {
      throw new Error(
        `Typ-Register [${layerName}]: relationWidgets["${key}"] an "${typeId}" hat keine Manifest-Kante — Widgets bedienen nur deklarierte Affordances (Spec 06, Verhältnis zu Relations).`,
      )
    }
  }
}

/** Test seam: core-only manifest, core-only presentation. Deliberately NOT
 *  exported via the package barrel — tests import this module directly. */
export function resetTypePresentationForTests(): void {
  manifest = CORE_ONLY_MANIFEST
  for (const key of [...layers.keys()]) if (key !== "core") layers.delete(key)
  composedCache = null
}

/**
 * Register a presentation layer (the app; space layers are not supported yet
 * — see the SCOPE note above and rls#212) at startup.
 *
 * - *Definitions* present a manifest-known type for the first time. An id the
 *   manifest does not know throws (no type introduction, spec rules 1/6); an
 *   id already presented by ANOTHER layer throws (no override in v0.1).
 * - *Extensions* additively fill fields of an already-presented type: scalar
 *   fields only where the base left them unset, `relationWidgets` united by
 *   key. Collisions throw.
 * - Re-registering the SAME layer name replaces that layer wholesale — a
 *   layer updating itself (Vite HMR), not an override between layers.
 *
 * A plain entry array is shorthand for `{ definitions }`.
 */
export function registerTypePresentation(
  layerName: string,
  layer: TypePresentationLayer | readonly TypePresentationEntry[],
): void {
  const normalized: TypePresentationLayer = Array.isArray(layer)
    ? { definitions: layer as readonly TypePresentationEntry[] }
    : (layer as TypePresentationLayer)

  const ownedElsewhere = new Map<string, string>()
  for (const [name, existing] of layers) {
    if (name === layerName) continue
    for (const e of existing.definitions ?? []) ownedElsewhere.set(e.id, name)
  }

  for (const entry of normalized.definitions ?? []) {
    if (!manifest.has(entry.id)) {
      throw new Error(
        `Typ-Register [${layerName}]: Manifest kennt "${entry.id}" nicht — das Darstellungs-Register führt keine Typen ein (Spec 06, Regel 1/6). Erst setTypeManifest() mit der App-Komposition aufrufen.`,
      )
    }
    const owner = ownedElsewhere.get(entry.id)
    if (owner) {
      throw new Error(
        `Typ-Register [${layerName}]: Darstellung für "${entry.id}" ist bereits in Layer "${owner}" vergeben — kein Override in v0.1; zum Ergänzen einzelner Felder Extensions verwenden (Spec 06, Erweiterung und Merge).`,
      )
    }
    assertRelationWidgetKeys(manifest, entry.id, entry.relationWidgets, layerName)
  }
  for (const frag of normalized.extensions ?? []) {
    assertRelationWidgetKeys(manifest, frag.id, frag.relationWidgets, layerName)
  }

  const previous = layers.get(layerName)
  layers.set(layerName, normalized)
  composedCache = null
  try {
    composePresentation() // fail fast: extension conflicts surface at registration
  } catch (err) {
    if (previous) layers.set(layerName, previous)
    else layers.delete(layerName)
    composedCache = null
    throw err
  }
}

const SCALAR_SLOTS = ["badge", "composerWidgets", "preview", "detail", "footer"] as const

function composePresentation(): Map<string, TypePresentationEntry> {
  if (composedCache) return composedCache
  const composed = new Map<string, TypePresentationEntry>()
  // Pass 1: definitions. Deterministic — ids are unique across layers by the
  // registration checks, so order cannot change the outcome.
  for (const [, layer] of layers) {
    for (const def of layer.definitions ?? []) {
      composed.set(def.id, { ...def, relationWidgets: { ...(def.relationWidgets ?? {}) } })
    }
  }
  // Pass 2: extensions — additive only (spec: Erweiterungsfragment).
  for (const [name, layer] of layers) {
    for (const frag of layer.extensions ?? []) {
      const base = composed.get(frag.id)
      if (!base) {
        throw new Error(
          `Typ-Register [${name}]: Fragment adressiert "${frag.id}", das keine Darstellung hat — Fragmente erweitern vorhandene Einträge (Spec 06, Erweiterung und Merge).`,
        )
      }
      for (const field of SCALAR_SLOTS) {
        const incoming = frag[field]
        if (incoming === undefined) continue
        if (base[field] !== undefined) {
          throw new Error(
            `Typ-Register [${name}]: Fragment setzt "${field}" an "${frag.id}", das die Basis bereits setzt — Skalare sind nur setzbar, wo die Basis schweigt (Spec 06).`,
          )
        }
        ;(base as unknown as Record<string, unknown>)[field] = incoming
      }
      for (const [key, widget] of Object.entries(frag.relationWidgets ?? {})) {
        const widgets = base.relationWidgets as Record<string, string>
        if (key in widgets) {
          throw new Error(
            `Typ-Register [${name}]: relationWidgets["${key}"] an "${frag.id}" ist bereits vergeben (Spec 06, Erweiterung und Merge).`,
          )
        }
        widgets[key] = widget
      }
    }
  }
  composedCache = composed
  return composed
}

/**
 * Resolve the presentation for a type. Generic (spec rule 5) when the type is
 * unknown to the manifest OR has a manifest entry without presentation —
 * visible with title, meta row and neutral badge, never invisible or broken.
 */
export function resolveTypePresentation(typeId: string): ResolvedTypePresentation {
  const entry = composePresentation().get(typeId)
  if (!entry || !manifest.has(typeId)) {
    return { id: typeId, label: typeId, detail: GENERIC_DETAIL, generic: true }
  }
  return {
    ...entry,
    detail: entry.detail ?? entry.preview ?? GENERIC_DETAIL,
    generic: false,
  }
}

/** Render a type's footer slot for an item, or null. Convenience for
 *  surfaces that compose footers (reactions, comment counts) around it. */
export function renderTypeFooter(item: Item): ReactNode {
  const Footer = resolveTypePresentation(item.type).footer
  return Footer ? createElement(Footer, { item }) : null
}
