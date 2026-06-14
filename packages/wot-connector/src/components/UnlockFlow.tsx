import { useState, useEffect, useRef } from "react"
import {
  PassphraseInput,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@real-life-stack/toolkit"
import { Key, Fingerprint } from "lucide-react"
import type { WotConnector } from "../wot-connector.js"
import { BiometricService } from "../biometric-service.js"
import { BiometricOptIn, shouldShowBiometricOptIn } from "./BiometricOptIn.js"

interface UnlockFlowProps {
  connector: WotConnector
  onComplete: () => void
  onSwitchToRecovery: () => void
}

/** Read a Capacitor plugin rejection code (`call.reject(msg, code)`). */
function errorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; message?: unknown }
    return String(e.code ?? e.message ?? "")
  }
  return String(err ?? "")
}

export function UnlockFlow({ connector, onComplete, onSwitchToRecovery }: UnlockFlowProps) {
  const [passphrase, setPassphrase] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Biometric state — all gated by availability, so non-native builds and
  // browsers simply never enter the biometric paths (isAvailable → false).
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioEnrolled, setBioEnrolled] = useState(false)
  const [bioLoading, setBioLoading] = useState(false)
  const [usePassword, setUsePassword] = useState(false)
  const [optInPassphrase, setOptInPassphrase] = useState<string | null>(null)
  const bioAttempted = useRef(false)

  const finishPasswordError = (err: unknown) => {
    const msg = (err as { message?: string })?.message
    setError(msg?.includes("decrypt")
      ? "Falsches Passwort"
      : (msg ?? "Entsperrung fehlgeschlagen"))
  }

  const handleBiometricUnlock = async () => {
    setBioLoading(true)
    setError("")
    try {
      const storedPassphrase = await BiometricService.authenticate()
      await connector.authenticate("unlock", { passphrase: storedPassphrase } as any)
      onComplete()
    } catch (err) {
      const code = errorCode(err)
      if (code.includes("USER_CANCELLED")) {
        // User dismissed the prompt — leave them on the biometric screen
        // with the option to retry or switch to password.
      } else if (code.includes("KEY_INVALIDATED") || code.includes("KEY_NOT_FOUND")) {
        // New fingerprint enrolled / key gone — biometric enrollment is void.
        await BiometricService.unenroll().catch(() => {})
        setBioEnrolled(false)
        setUsePassword(true)
        setError("Biometrie wurde zurückgesetzt. Bitte mit Passwort entsperren.")
      } else {
        setError((err as { message?: string })?.message ?? "Biometrische Entsperrung fehlgeschlagen")
      }
    } finally {
      setBioLoading(false)
    }
  }

  // On mount: probe biometric availability/enrollment and auto-prompt when enrolled.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const available = await BiometricService.isAvailable()
      const enrolled = available ? await BiometricService.isEnrolled() : false
      if (cancelled) return
      setBioAvailable(available)
      setBioEnrolled(enrolled)
      if (enrolled && !bioAttempted.current) {
        bioAttempted.current = true
        handleBiometricUnlock()
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUnlock = async () => {
    if (passphrase.length < 1) return
    setLoading(true)
    setError("")
    try {
      await connector.authenticate("unlock", { passphrase } as any)
      // Offer biometric enrollment after a successful password unlock.
      if (bioAvailable && !bioEnrolled && shouldShowBiometricOptIn()) {
        setOptInPassphrase(passphrase)
        return
      }
      onComplete()
    } catch (err) {
      finishPasswordError(err)
    } finally {
      setLoading(false)
    }
  }

  // Biometric opt-in overlay after a password unlock.
  if (optInPassphrase !== null) {
    return (
      <BiometricOptIn
        passphrase={optInPassphrase}
        onDone={() => { setOptInPassphrase(null); onComplete() }}
      />
    )
  }

  // Biometric-first screen (enrolled and not explicitly switched to password).
  if (bioEnrolled && !usePassword) {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10">
            <Fingerprint className="size-7 text-primary" />
          </div>
          <CardTitle>Willkommen zurück</CardTitle>
          <CardDescription>
            Entsperre deine Identity mit Fingerabdruck oder Gesicht.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button
            className="w-full"
            onClick={handleBiometricUnlock}
            disabled={bioLoading}
          >
            <Fingerprint className="mr-2 size-4" />
            {bioLoading ? "Entsperre…" : "Biometrisch entsperren"}
          </Button>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => { setError(""); setUsePassword(true) }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Stattdessen Passwort verwenden
            </button>
            <button
              type="button"
              onClick={onSwitchToRecovery}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Identity wiederherstellen
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Password unlock screen.
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10">
          <Key className="size-7 text-primary" />
        </div>
        <CardTitle>Willkommen zurück</CardTitle>
        <CardDescription>
          Gib dein Passwort ein, um deine Identity zu entsperren.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); handleUnlock() }}>
          <PassphraseInput
            value={passphrase}
            onChange={setPassphrase}
            label="Passwort"
            placeholder="Passwort eingeben"
            error={error}
            autoFocus
          />
          <Button
            type="submit"
            className="w-full mt-4"
            disabled={loading || passphrase.length < 1}
          >
            {loading ? "Entsperre…" : "Entsperren"}
          </Button>
        </form>
        <div className="flex flex-col items-center gap-2">
          {bioEnrolled && (
            <button
              type="button"
              onClick={() => { setError(""); setUsePassword(false) }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Zurück zur biometrischen Entsperrung
            </button>
          )}
          <button
            type="button"
            onClick={onSwitchToRecovery}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Identity wiederherstellen
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
