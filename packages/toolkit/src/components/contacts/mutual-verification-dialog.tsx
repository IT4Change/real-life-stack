"use client"

import { Check } from "lucide-react"
import { Button } from "@/components/primitives/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/primitives/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/primitives/dialog"

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

export interface MutualVerificationDialogProps {
  open: boolean
  peerName?: string
  peerAvatar?: string
  myName?: string
  myAvatar?: string
  onDismiss: () => void
  /** Varianten-Titel — Default ist die WoT-Verifikation. Anfrage-Connectoren
      nutzen dieselbe Komponente mit z.B. "Ihr seid jetzt Kontakte!". */
  title?: string
}

export function MutualVerificationDialog({
  open,
  peerName,
  peerAvatar,
  myName,
  myAvatar,
  onDismiss,
  title = "Gegenseitig verifiziert!",
}: MutualVerificationDialogProps) {
  const name = peerName ?? "Kontakt"

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDismiss() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14">
              <AvatarImage src={myAvatar} alt={myName ?? "Du"} />
              <AvatarFallback className="bg-green-500/10 text-green-600">
                {myName ? getInitials(myName) : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
              <Check className="h-4 w-4 text-green-500" />
            </div>
            <Avatar className="h-14 w-14">
              <AvatarImage src={peerAvatar} alt={name} />
              <AvatarFallback className="bg-green-500/10 text-green-600">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Du und <span className="font-medium text-foreground">{name}</span> habt euch gegenseitig verifiziert.
          </p>
        </div>

        <Button className="w-full" onClick={onDismiss}>
          Fertig
        </Button>
      </DialogContent>
    </Dialog>
  )
}
