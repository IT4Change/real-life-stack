// App layer of the type register (spec 06).
//
// The reference app contributes exactly one type: `statement` (Resonance
// module). Per spec it is NOT a core type — RLS ships seven — so its manifest
// definition and presentation entry live here, not in the packages.
//
// Import this module once, before first render (main.tsx). Registration is
// idempotent-hostile by design: a second registration throws, which catches
// accidental double-imports early.

import {
  composeTypeManifest,
  CORE_TYPE_LAYER,
  VOCAB_STATEMENT,
  type TypeManifestLayer,
} from "@real-life-stack/data-interface"
import {
  registerTypePresentation,
  VoteBar,
  type ItemSlotProps,
} from "@real-life-stack/toolkit"
import { MessageSquareQuote } from "lucide-react"

/** A statement's votes are a TYPE rule: the vote bar belongs to the item,
 *  whichever surface shows it (spec 06, rule 3 — no type branching in
 *  modules). `itemRole: "to"`: votes are INCOMING records, the slot queries
 *  records pointing at this item. */
function StatementVotesFooter({ item }: ItemSlotProps) {
  return <VoteBar statementId={item.id} className="w-full" />
}

const APP_TYPE_LAYER: TypeManifestLayer = {
  name: "app",
  definitions: [
    {
      id: "statement",
      vocabularies: [VOCAB_STATEMENT],
      relations: [{ predicate: "votesOn", itemRole: "to", otherKind: "person" }],
    },
  ],
}

/** The app's composed manifest — core plus the app layer. */
export const TYPE_MANIFEST = composeTypeManifest([CORE_TYPE_LAYER, APP_TYPE_LAYER])

registerTypePresentation("app", [
  {
    id: "statement",
    label: "Aussage",
    badge: { icon: MessageSquareQuote, className: "bg-sky-50 text-sky-700 border-sky-200" },
    composerWidgets: ["title", "text", "tags"],
    footer: StatementVotesFooter,
  },
])
