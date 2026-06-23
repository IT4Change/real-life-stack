"use client"

import { useState } from "react"
import { MoreVertical, Pencil, Share2, Trash2 } from "lucide-react"
import type { Item } from "@real-life-stack/data-interface"
import { isWritable } from "@real-life-stack/data-interface"
import { Button } from "../primitives/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../primitives/dropdown-menu"
import { useConnector } from "../../hooks/connector-context"
import { useItemPermissions } from "../../hooks/use-item-permissions"
import { DeleteConfirmDialog } from "./delete-confirm-dialog"
import { visibleDetailActions } from "./detail-actions"

export interface ItemDetailActionsProps {
  item: Item
  /** Enter edit mode. Adds a „Bearbeiten" entry to the ⋮ menu when the user may
   *  edit. Omit while edit-in-panel isn't wired for a module yet. */
  onEdit?: () => void
  /** Called after the item was deleted — e.g. to close the panel / clear the URL
   *  focus. The deletion itself is performed here (via the connector). */
  onDeleted?: () => void
  /** Share/copy a link to the item. */
  onShare?: () => void
  /** Item title for the delete prompt. */
  title?: string
}

/**
 * Detail-header actions in a single ⋮ menu (Bearbeiten / Teilen / Löschen), all
 * gated by `useItemPermissions(item)` — actions the user can't perform are
 * hidden, not disabled. Delete runs behind a confirm dialog and is enforced
 * backend-side (this gating is UX only).
 */
export function ItemDetailActions({ item, onEdit, onDeleted, onShare, title }: ItemDetailActionsProps) {
  const connector = useConnector()
  const perms = useItemPermissions(item)
  const visible = visibleDetailActions(perms, !!onEdit, !!onShare)
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (!visible.edit && !visible.delete && !visible.share) return null

  return (
    <div className="flex items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Aktionen">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {visible.edit && (
            <DropdownMenuItem onClick={onEdit} className="gap-2">
              <Pencil className="h-4 w-4" />
              Bearbeiten
            </DropdownMenuItem>
          )}
          {visible.share && (
            <DropdownMenuItem onClick={onShare} className="gap-2">
              <Share2 className="h-4 w-4" />
              Teilen
            </DropdownMenuItem>
          )}
          {visible.delete && (
            <DropdownMenuItem
              onClick={() => setConfirmOpen(true)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Löschen
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {visible.delete && (
        <DeleteConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={title}
          onConfirm={async () => {
            // canDelete already gated the UI; re-check writability defensively.
            // Signal onDeleted (e.g. close the panel) ONLY after a real delete —
            // otherwise a not-writable connector would close the detail/URL while
            // the item still exists.
            if (!isWritable(connector)) return
            await connector.deleteItem(item.id)
            onDeleted?.()
          }}
        />
      )}
    </div>
  )
}
