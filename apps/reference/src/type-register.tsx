// App layer of the type register (spec 06).
//
// The reference app contributes exactly one type: `statement` (Resonance
// module). Per spec it is NOT a core type - RLS ships seven - so its
// presentation lives here. Its MANIFEST definition is exported by
// data-interface (STATEMENT_TYPE_DEFINITION), because the statement DATA
// types (StatementItem, votes) ship from there - single source of identity.
//
// Import this module once, before first render (main.tsx). Re-importing is
// harmless: re-registering the same layer replaces it (Vite HMR semantics);
// only ids owned by OTHER layers are conflicts.

import {
  composeTypeManifest,
  CORE_TYPE_LAYER,
  STATEMENT_TYPE_DEFINITION,
  type TypeManifestLayer,
} from "@real-life-stack/data-interface"
import {
  registerTypePresentation,
  setTypeManifest,
  VoteBar,
  type ItemSlotProps,
} from "@real-life-stack/toolkit"
import { MessageSquareQuote } from "lucide-react"

/** A statement's votes are a TYPE rule: the vote bar belongs to the item,
 *  whichever surface shows it (spec 06, rule 3 - no type branching in
 *  modules). `itemRole: "to"`: votes are INCOMING records, the slot queries
 *  records pointing at this item. */
function StatementVotesFooter({ item }: ItemSlotProps) {
  return <VoteBar statementId={item.id} className="w-full" />
}

const APP_TYPE_LAYER: TypeManifestLayer = {
  name: "app",
  definitions: [STATEMENT_TYPE_DEFINITION],
}

/** The app's composed manifest - core plus the app layer. */
export const TYPE_MANIFEST = composeTypeManifest([CORE_TYPE_LAYER, APP_TYPE_LAYER])

// Order matters: the register validates presentation ids against the
// manifest, so the composed manifest must be bound FIRST (spec rule 1).
setTypeManifest(TYPE_MANIFEST)

registerTypePresentation("app", [
  {
    id: "statement",
    label: "Aussage",
    badge: { icon: MessageSquareQuote, className: "bg-sky-50 text-sky-700 border-sky-200" },
    composerWidgets: ["title", "text", "tags"],
    footer: StatementVotesFooter,
  },
])
