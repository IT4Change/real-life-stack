"use client"

import { useEffect, useRef, useState } from "react"
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
  /**
   * Lifecycle-Token des dargestellten VORGANGS (die Notification-ID, nicht
   * der Absender): wechselt es, wird der lokale Zustand zurückgesetzt und
   * jede noch laufende Fortsetzung des vorherigen Vorgangs verworfen. Nur
   * so trennt der Dialog auch zwei Vorgänge DESSELBEN Absenders (#254).
   */
  requestKey?: string
  /** Absender-ID (nur informativ; für den Lifecycle zählt requestKey). */
  fromId?: string
  fromName?: string
  fromAvatar?: string
  /** Bestätigt die Anfrage. Wirft der Handler, BLEIBT der Dialog offen und
      zeigt den Fehler — die Anfrage ist retry-fähig. */
  onConfirm: () => void | Promise<void>
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
  requestKey,
  fromId,
  fromName,
  fromAvatar,
  onConfirm,
  onDismiss,
}: IncomingContactRequestDialogProps) {
  const displayName = fromName ?? "Jemand"
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Request-Epoche (#254): die async Fortsetzung einer Bestätigung gehört
   * der Anfrage, für die sie gestartet wurde. Rückt inzwischen die nächste
   * nach, darf sie deren error/confirming nicht mehr setzen.
   */
  const requestEpoch = useRef(0)

  // Nächster Vorgang rückt nach → der Fehler des vorherigen gilt nicht mehr.
  // Token-basiert, damit auch zwei Vorgänge desselben Absenders trennen.
  useEffect(() => {
    requestEpoch.current += 1
    setError(null)
    setConfirming(false)
  }, [requestKey ?? fromId])

  const handleConfirm = async () => {
    if (confirming) return
    const epoch = requestEpoch.current
    setConfirming(true)
    setError(null)
    try {
      await onConfirm()
    } catch (cause) {
      if (epoch !== requestEpoch.current) return
      setError(cause instanceof Error ? cause.message : "Bestätigen fehlgeschlagen. Bitte erneut versuchen.")
    } finally {
      if (epoch === requestEpoch.current) setConfirming(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        // Während des Bestätigens NICHT schließen (Escape/Outside-Click):
        // sonst verschwindet bei einer Ablehnung die zugesagte Retry-Fläche.
        if (!isOpen && !confirming) onDismiss()
      }}
    >
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

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss} disabled={confirming}>
            Später
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={confirming}>
            {confirming ? "Bestätige…" : "Bestätigen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
