"use client"

// Darstellungs-Register — the toolkit half of the canonical type register.
//
// Spec: docs/spec/06-schema-composition.md → "Typ-Register".
//
// Entries attach DISPLAY concerns (label, icon, badge, composer widgets, and
// the preview/detail/footer slot contents for the shared ItemPreview shell)
// to type ids owned by the type manifest in `data-interface`. This layer
// MUST NOT introduce types — an id without a manifest entry is a registration
// error at the app layer, and an item whose type has no entry here falls back
// to the generic presentation (spec rule 5: visible and generic, never broken).
//
// Registration is layered like the manifest (core → app → space) and happens
// once at app startup. A second entry for the same id is a conflict and
// throws — no override in v0.1, silent or otherwise.

import type { ComponentType, ReactNode } from "react"
import { createElement } from "react"
import {
  Calendar,
  CheckSquare,
  MapPin,
  Shapes,
  User as UserIcon,
} from "lucide-react"
import { isTask, type Item, type User } from "@real-life-stack/data-interface"

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

/** One presentation entry per type id (spec: Darstellungs-Register). */
export interface TypePresentationEntry {
  /** Must match a manifest id — this layer never introduces types. */
  id: string
  /** Display name; the manifest deliberately carries none (SRP). */
  label: string
  /** Badge styling. Absent = no badge for this type (e.g. plain posts),
   *  matching the previous ItemTypeBadge behaviour. */
  badge?: TypeBadgeStyle
  /** Widget set the composer opens with (ContentTypeConfig.defaultWidgets). */
  composerWidgets?: readonly string[]
  /** Composer widget per declared edge, keyed `"${predicate} ${itemRole}"` —
   *  same key as the manifest's relation affordances. */
  relationWidgets?: Readonly<Record<string, string>>
  /** Compact slot for cards and rows (metaAdornment). */
  preview?: ComponentType<ItemSlotProps>
  /** Panel slot (metaAdornment); defaults to `preview`, then ItemMetaRow. */
  detail?: ComponentType<ItemSlotProps>
  /** Type-own footer, rendered IN ADDITION to surface footers (reactions,
   *  comment counts). Task → assignees, statement → vote bar. */
  footer?: ComponentType<ItemSlotProps>
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
  /** True when this is the generic fallback (unknown/unregistered type). */
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
// Registry

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
    relationWidgets: { "invited from": "people" },
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
    relationWidgets: { "assignedTo from": "people" },
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

const layers = new Map<string, readonly TypePresentationEntry[]>([["core", CORE_PRESENTATION]])

/**
 * Register a presentation layer (app or space) at startup. Layered like the
 * manifest; an id already presented by ANOTHER layer is a conflict and throws
 * (no override in v0.1).
 *
 * Re-registering the SAME layer name replaces that layer wholesale. That is
 * not an override between layers but a layer updating itself — required for
 * Vite HMR, which re-executes the registering module on edit; throwing here
 * would break every dev session that touches the registration file.
 */
export function registerTypePresentation(
  layerName: string,
  entries: readonly TypePresentationEntry[],
): void {
  const taken = new Map<string, string>()
  for (const [name, layerEntries] of layers) {
    if (name === layerName) continue
    for (const e of layerEntries) taken.set(e.id, name)
  }
  for (const entry of entries) {
    const owner = taken.get(entry.id)
    if (owner) {
      throw new Error(
        `Typ-Register [${layerName}]: Darstellung für "${entry.id}" ist bereits in Layer "${owner}" vergeben — kein Override in v0.1 (Spec 06, Erweiterung und Merge).`,
      )
    }
  }
  layers.set(layerName, entries)
}

/** Test seam: drop every non-core layer. */
export function resetTypePresentationForTests(): void {
  for (const key of [...layers.keys()]) if (key !== "core") layers.delete(key)
}

function findEntry(typeId: string): TypePresentationEntry | undefined {
  for (const entries of layers.values()) {
    const hit = entries.find((e) => e.id === typeId)
    if (hit) return hit
  }
  return undefined
}

/**
 * Resolve the presentation for a type, generic fallback included (spec rule
 * 5: an item with an unknown type is never invisible or broken — it renders
 * title, description and a neutral badge on every surface).
 */
export function resolveTypePresentation(typeId: string): ResolvedTypePresentation {
  const entry = findEntry(typeId)
  if (!entry) {
    return { id: typeId, label: typeId, badge: undefined, detail: GENERIC_DETAIL, generic: true }
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
