"use client"

import { UserPlus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/primitives/dialog"
import { Button } from "@/components/primitives/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/primitives/avatar"

export interface IncomingContactRequestDialogProps {
  open: boolean
  fromName?: string
  fromAvatar?: string
  /** Bestätigt die Anfrage (activateContact) und schließt. */
  onConfirm: () => void
  /** Später entscheiden — die Anfrage bleibt im Kontakte-Dialog sichtbar. */
  onDismiss: () => void
}

function getInitials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2)
}

/**
 * Sichtbare Zustellung einer Kontaktanfrage (Anfrage-Connectoren) — das
 * Gegenstück zum WoT-IncomingVerificationDialog: der Empfänger bekommt
 * einen Dialog statt einer still wachsenden Kontaktliste.
 */
export function IncomingContactRequestDialog({
  open,
  fromName,
  fromAvatar,
  onConfirm,
  onDismiss,
}: IncomingContactRequestDialogProps) {
  const displayName = fromName ?? "Jemand"
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDismiss() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Neue Kontaktanfrage
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <Avatar className="h-11 w-11">
            <AvatarImage src={fromAvatar} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {fromName ? getInitials(fromName) : "?"}
            </AvatarFallback>
          </Avatar>
          <p className="text-sm">
            <span className="font-medium">{displayName}</span> möchte dich als Kontakt hinzufügen.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Später
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Bestätigen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
