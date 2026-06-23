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
  /** Enter edit mode. Surfaces a prominent "Bearbeiten" button when the user may
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
 * Detail-header actions: a prominent "Bearbeiten" button plus a ⋮ menu
 * (Teilen / Löschen). All gated by `useItemPermissions(item)` — actions the user
 * can't perform are hidden, not disabled. Delete runs behind a confirm dialog
 * and is enforced backend-side (this gating is UX only).
 */
export function ItemDetailActions({ item, onEdit, onDeleted, onShare, title }: ItemDetailActionsProps) {
  const connector = useConnector()
  const perms = useItemPermissions(item)
  const visible = visibleDetailActions(perms, !!onEdit, !!onShare)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const hasMenu = visible.delete || visible.share
  if (!visible.edit && !hasMenu) return null

  return (
    <div className="flex items-center justify-end gap-1">
      {visible.edit && (
        <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" />
          Bearbeiten
        </Button>
      )}
      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Weitere Aktionen">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
      )}
      {visible.delete && (
        <DeleteConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={title}
          onConfirm={async () => {
            // canDelete already gated the UI; re-check writability defensively.
            if (isWritable(connector)) await connector.deleteItem(item.id)
            onDeleted?.()
          }}
        />
      )}
    </div>
  )
}
