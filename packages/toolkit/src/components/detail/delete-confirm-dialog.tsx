"use client"

import { useState } from "react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../primitives/dialog"
import { Button } from "../primitives/button"

export interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Title/name of the item, shown in the prompt. Omitted → generic copy. */
  title?: string
  /** Performs the deletion. The dialog shows a busy state until it resolves,
   *  then closes itself. */
  onConfirm: () => void | Promise<void>
}

/** Confirm-before-delete dialog for an item. UX affordance only — the actual
 *  permission to delete is gated upstream (see `ItemDetailActions`). */
export function DeleteConfirmDialog({ open, onOpenChange, title, onConfirm }: DeleteConfirmDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Löschen?</DialogTitle>
          <DialogDescription>
            {title ? `„${title}" wird gelöscht. ` : "Dieses Element wird gelöscht. "}
            Das kann nicht rückgängig gemacht werden.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isDeleting}>
              Abbrechen
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleConfirm} disabled={isDeleting}>
            {isDeleting ? "Lösche…" : "Löschen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
