// Typ-Manifest — the UI-free half of the canonical type register.
//
// Spec: docs/spec/06-schema-composition.md → "Typ-Register".
//
// One entry per `type`, single source of type IDENTITY. The toolkit's
// presentation register attaches display concerns (label, icon, slots) to
// these ids and MUST NOT introduce types of its own. `KnownItemType` in
// item-types.ts derives its core members from this manifest instead of
// maintaining a parallel list.
//
// Composition follows the spec's "Erweiterung und Merge" rules: layers are
// composed Core → App → Space; a layer contributes either *definitions*
// (new ids) or *extension fragments* (additive changes to existing ids).
// Conflicts throw — there is no override in v0.1, silent or otherwise.

import {
  VOCAB_BASE,
  VOCAB_STATEMENT,
  VOCAB_EVENT,
  VOCAB_PERSON,
  VOCAB_PLACE,
  VOCAB_PROJECT,
  VOCAB_RESOURCE,
  VOCAB_TASK,
} from "./vocab"

/** Which role THIS item plays on an edge. `either` is for symmetric
 *  predicates only (08 canonicalizes their endpoints — there is no direction). */
export type RelationRole = "from" | "to" | "either"

/**
 * A relation affordance: an edge this type can enter, keyed by
 * (`predicate`, `itemRole`). Both roles of the same predicate may coexist on
 * one type (a task blocks and is blocked); `either` excludes `from`/`to` for
 * the same predicate. This is a Composer/UI affordance, NOT a validity
 * whitelist — predicates stay open (spec 04).
 */
export interface RelationAffordance {
  predicate: string
  itemRole: RelationRole
  /** What sits at the other endpoint (`person`, `place`, `item`, …). Binds the
   *  persisted target form: `person` → `global:`, item-like → `item:`/`space:`. */
  otherKind: string
}

/** One type in the manifest. UI-free by contract — display lives in toolkit. */
export interface TypeManifestEntry {
  /** Stable type identity; doubles as the localization key. */
  id: string
  /** Vocabularies the composer sets when creating an item of this type.
   *  `base/v1` is always implied and need not be listed. */
  vocabularies: readonly string[]
  /** Edges this type can enter, keyed by (predicate, itemRole). */
  relations?: readonly RelationAffordance[]
}

/** Additive change to an EXISTING type (spec: Erweiterungsfragment). */
export interface TypeManifestFragment {
  /** Must address an id introduced by an earlier layer — unknown id = conflict. */
  id: string
  /** United as a set; re-adding an existing vocabulary is a no-op. */
  vocabularies?: readonly string[]
  /** United keyed by (predicate, itemRole); an existing key = conflict. */
  relations?: readonly RelationAffordance[]
}

/** One composition layer (Core, App, or Space). */
export interface TypeManifestLayer {
  /** For conflict messages ("app", "space:garden", …). */
  name: string
  definitions?: readonly TypeManifestEntry[]
  extensions?: readonly TypeManifestFragment[]
}

/**
 * Canonical key of a relation affordance — THE key format, used by the
 * manifest, the presentation register's `relationWidgets`, and every
 * consumer deriving from them. Exported so the format exists exactly once.
 */
export const relationAffordanceKey = (
  r: Pick<RelationAffordance, "predicate" | "itemRole">,
): string => `${r.predicate} ${r.itemRole}`

const relationKey = relationAffordanceKey

/**
 * Add affordances onto a keyed map, enforcing the spec's key and symmetry
 * rules. Order-independent by construction: outcome depends only on the set
 * of (key → value) pairs, and any duplicate or contradictory pair throws.
 */
function addRelations(
  target: Map<string, RelationAffordance>,
  incoming: readonly RelationAffordance[],
  typeId: string,
  layer: string,
): void {
  for (const rel of incoming) {
    const key = relationKey(rel)
    if (target.has(key)) {
      throw new Error(
        `Typ-Manifest [${layer}]: Kante (${rel.predicate}, ${rel.itemRole}) ist an "${typeId}" bereits vergeben — Umdefinieren ist ein Konflikt (Spec 06, Erweiterung und Merge).`,
      )
    }
    // `either` and directed roles are mutually exclusive per predicate: the
    // manifest must match the predicate's symmetry declaration (08, rule 3).
    const clash =
      rel.itemRole === "either"
        ? ["from", "to"].some((role) => target.has(relationKey({ predicate: rel.predicate, itemRole: role as RelationRole })))
        : target.has(relationKey({ predicate: rel.predicate, itemRole: "either" }))
    if (clash) {
      throw new Error(
        `Typ-Manifest [${layer}]: "${rel.predicate}" an "${typeId}" mischt "either" mit gerichteten Rollen — die Symmetrie eines Prädikats ist eindeutig (Spec 06/08).`,
      )
    }
    target.set(key, rel)
  }
}

/** A composed, immutable view of the manifest. */
export interface ComposedTypeManifest {
  /** All type ids, in layer/definition order (deterministic). */
  ids: readonly string[]
  get(id: string): TypeManifestEntry | undefined
  has(id: string): boolean
}

/**
 * Compose manifest layers (Core → App → Space) into one deterministic view.
 *
 * Spec rules enforced here:
 * - a definition with an already-taken id is a conflict,
 * - a fragment addressing an unknown id is a conflict,
 * - relation keys (predicate, itemRole) are add-only; vocabularies unite as a set,
 * - no override in v0.1: conflicts throw, they are never resolved silently.
 */
export function composeTypeManifest(
  layers: readonly TypeManifestLayer[],
): ComposedTypeManifest {
  const entries = new Map<string, { vocabularies: Set<string>; relations: Map<string, RelationAffordance> }>()
  const order: string[] = []

  for (const layer of layers) {
    for (const def of layer.definitions ?? []) {
      if (entries.has(def.id)) {
        throw new Error(
          `Typ-Manifest [${layer.name}]: Typ-Id "${def.id}" ist bereits vergeben — eine Typdefinition führt eine NEUE Id ein; Erweiterungen sind Fragmente (Spec 06, Erweiterung und Merge).`,
        )
      }
      const relations = new Map<string, RelationAffordance>()
      addRelations(relations, def.relations ?? [], def.id, layer.name)
      entries.set(def.id, { vocabularies: new Set(def.vocabularies), relations })
      order.push(def.id)
    }
    for (const frag of layer.extensions ?? []) {
      const base = entries.get(frag.id)
      if (!base) {
        throw new Error(
          `Typ-Manifest [${layer.name}]: Fragment adressiert unbekannte Typ-Id "${frag.id}" — Fragmente erweitern vorhandene Typen (Spec 06, Erweiterung und Merge).`,
        )
      }
      for (const vocab of frag.vocabularies ?? []) base.vocabularies.add(vocab)
      addRelations(base.relations, frag.relations ?? [], frag.id, layer.name)
    }
  }

  const frozen = new Map<string, TypeManifestEntry>()
  for (const id of order) {
    const e = entries.get(id)!
    frozen.set(id, {
      id,
      vocabularies: [...e.vocabularies],
      relations: [...e.relations.values()],
    })
  }
  return {
    ids: order,
    get: (id) => frozen.get(id),
    has: (id) => frozen.has(id),
  }
}

/**
 * The Core layer: the seven core types RLS ships (spec 06, "Core-Typ").
 * System types (`relation`, `reaction`, `comment`) have no entry by design —
 * they never render as standalone cards. `statement` is registered by the
 * app layer (Resonance module), not here.
 *
 * `base/v1` is implied for every type and not listed.
 */
export const CORE_TYPE_MANIFEST = [
  { id: "post", vocabularies: [] },
  {
    id: "event",
    vocabularies: [VOCAB_EVENT],
    // Declared ahead of the composer widget (see content-types.ts history):
    // attendees link via `invited`, never `assignedTo`.
    relations: [{ predicate: "invited", itemRole: "from", otherKind: "person" }],
  },
  { id: "place", vocabularies: [VOCAB_PLACE] },
  {
    id: "task",
    vocabularies: [VOCAB_TASK],
    relations: [{ predicate: "assignedTo", itemRole: "from", otherKind: "person" }],
  },
  { id: "person", vocabularies: [VOCAB_PERSON] },
  { id: "project", vocabularies: [VOCAB_PROJECT] },
  { id: "resource", vocabularies: [VOCAB_RESOURCE] },
] as const satisfies readonly TypeManifestEntry[]

/**
 * `statement` ships its DATA types (StatementItem, votes) from this package,
 * so its manifest entry lives here too — as an exported definition the APP
 * layer registers, not as a core type (spec 06 lists seven core types).
 * Single source: KnownItemType derives the literal from this entry.
 */
export const STATEMENT_TYPE_DEFINITION = {
  id: "statement",
  vocabularies: [VOCAB_STATEMENT],
  relations: [{ predicate: "votesOn", itemRole: "to", otherKind: "person" }],
} as const satisfies TypeManifestEntry

/** Core type ids, derived from the manifest — never maintained as a list. */
export type CoreItemTypeId = (typeof CORE_TYPE_MANIFEST)[number]["id"]

/** The core layer, ready for {@link composeTypeManifest}. */
export const CORE_TYPE_LAYER: TypeManifestLayer = {
  name: "core",
  definitions: CORE_TYPE_MANIFEST,
}

// Referenced so the "always implied" contract above stays type-checked against
// the canonical constant instead of a comment.
void VOCAB_BASE
