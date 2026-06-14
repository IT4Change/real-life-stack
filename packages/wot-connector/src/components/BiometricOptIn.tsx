import { useState } from "react"
import { Button } from "@real-life-stack/toolkit"
import { Fingerprint } from "lucide-react"
import { BiometricService } from "../biometric-service.js"

interface BiometricOptInProps {
  /** The passphrase to store behind the biometric prompt. */
  passphrase: string
  /** Called once the user has decided (enrolled or skipped) — continue unlock. */
  onDone: () => void
}

const BIOMETRIC_DISMISSED_KEY = "rls-wot-biometric-opt-in-dismissed"

/** Whether the user has permanently dismissed the biometric offer. */
export function shouldShowBiometricOptIn(): boolean {
  try {
    return localStorage.getItem(BIOMETRIC_DISMISSED_KEY) !== "true"
  } catch {
    return true
  }
}

/**
 * Offered once after a successful password unlock (when biometrics are
 * available but not yet enrolled). Enrolling stores the passphrase behind
 * a biometric-gated Keystore key; skipping remembers the choice so we
 * don't nag on every unlock.
 */
export function BiometricOptIn({ passphrase, onDone }: BiometricOptInProps) {
  const [isEnrolling, setIsEnrolling] = useState(false)

  const handleEnable = async () => {
    setIsEnrolling(true)
    try {
      await BiometricService.enroll(passphrase)
    } catch {
      // Enrollment failed or was cancelled — fall through and continue unlock.
    } finally {
      setIsEnrolling(false)
      onDone()
    }
  }

  const handleSkip = () => {
    try {
      localStorage.setItem(BIOMETRIC_DISMISSED_KEY, "true")
    } catch {
      // ignore storage failures
    }
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl bg-card p-6 shadow-xl">
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10">
            <Fingerprint className="size-7 text-primary" />
          </div>
          <h3 className="text-lg font-bold text-foreground">
            Schneller entsperren
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Möchtest du deine Identity künftig mit Fingerabdruck oder Gesicht
            entsperren, statt jedes Mal das Passwort einzugeben?
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={handleSkip} disabled={isEnrolling}>
            Nicht jetzt
          </Button>
          <Button className="flex-1" onClick={handleEnable} disabled={isEnrolling}>
            {isEnrolling ? "Richte ein…" : "Aktivieren"}
          </Button>
        </div>
      </div>
    </div>
  )
}
