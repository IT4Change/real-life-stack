import { useState, useEffect } from "react"
import { cleanMnemonicInput } from "../mnemonic-format.js"
import {
  PassphraseConfirm,
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
import { generateRandomPassphrase } from "../random-passphrase.js"

interface RecoveryFlowProps {
  connector: WotConnector
  onComplete: () => void
  onBack: () => void
}

export function RecoveryFlow({ connector, onComplete, onBack }: RecoveryFlowProps) {
  const [step, setStep] = useState<"mnemonic" | "passphrase">("mnemonic")
  const [mnemonic, setMnemonic] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)

  useEffect(() => {
    BiometricService.isAvailable().then(setBiometricAvailable)
  }, [])

  // Normalisiert alle Einfüge-Formate (nummerierte Zeilen/Inline, plain) —
  // Parität mit der WoT-App, deren Copy nummerierte Zeilen liefert.
  const cleanedMnemonic = cleanMnemonicInput(mnemonic)
  const words = cleanedMnemonic ? cleanedMnemonic.split(" ") : []
  const mnemonicValid = words.length === 12 && words.every((w) => w.length > 0)

  // Biometric recovery path: generates random passphrase, stores via biometrics.
  // Order matters: enroll FIRST so a cancelled/failed biometric prompt leaves no
  // recovered identity behind a random passphrase the user never saw. Only once
  // the keystore holds the passphrase do we recover with it; if that step fails
  // we roll the keystore entry back so no orphan key is stranded.
  const handleBiometricRecover = async () => {
    if (!mnemonicValid) return
    setLoading(true)
    setError("")
    const randomPassphrase = generateRandomPassphrase()
    try {
      await BiometricService.enroll(randomPassphrase)
    } catch {
      // Prompt cancelled / enrollment failed — nothing persisted yet.
      setLoading(false)
      setStep("passphrase")
      return
    }
    try {
      await connector.authenticate("mnemonic", {
        mnemonic: words.join(" "),
        passphrase: randomPassphrase,
      } as any)
      onComplete()
    } catch {
      // Recovery failed after enrollment. authenticate("mnemonic") is not atomic —
      // it stores the seed before later steps (bootstrap, auth-state) that can
      // still throw — so roll back BOTH the keystore entry AND any already-stored
      // identity, else a partial failure strands an identity behind the unseen
      // random passphrase.
      // deleteStoredIdentity() FIRST and on its own — it must run even if the
      // best-effort logout() teardown below rejects partway. Then logout() to
      // tear down any partial adapter/auth state so a retry starts clean.
      await BiometricService.unenroll().catch(() => {})
      await connector.deleteStoredIdentity().catch(() => {})
      await connector.logout().catch(() => {})
      // Surface the failure on the password step instead of silently falling
      // back (the enroll-cancel case above stays silent — that's a deliberate
      // user choice; this branch is a real recovery failure).
      setError("Biometrie-Einrichtung fehlgeschlagen. Bitte mit Passwort fortfahren.")
      setLoading(false)
      setStep("passphrase")
    }
  }

  const handleRecover = async () => {
    if (!mnemonicValid || passphrase.length < 8 || passphrase !== confirm) return
    setLoading(true)
    setError("")
    try {
      await connector.authenticate("mnemonic", {
        mnemonic: words.join(" "),
        passphrase,
      } as any)
      // Also enroll biometric if available (optional, silent on failure)
      if (biometricAvailable) {
        try {
          await BiometricService.enroll(passphrase)
        } catch { /* biometric enrollment optional */ }
      }
      onComplete()
    } catch (err: any) {
      setError(err.message ?? "Wiederherstellung fehlgeschlagen")
    } finally {
      setLoading(false)
    }
  }

  if (step === "mnemonic") {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10">
            <Key className="size-7 text-primary" />
          </div>
          <CardTitle>Identity wiederherstellen</CardTitle>
          <CardDescription>
            Gib deinen 12-Wörter Recovery Seed ein.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={mnemonic}
            onChange={(e) => {
              setMnemonic(e.target.value)
              setError("")
            }}
            placeholder="Wort 1  Wort 2  Wort 3 …"
            rows={3}
            autoFocus
            className="flex w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          {mnemonic.length > 0 && !mnemonicValid && (
            <p className="text-sm text-muted-foreground">
              {words.length}/12 Wörter
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {biometricAvailable ? (
            <>
              <Button
                className="w-full flex items-center gap-2"
                onClick={handleBiometricRecover}
                disabled={!mnemonicValid || loading}
              >
                <Fingerprint className="size-5" />
                {loading ? "Stellt wieder her…" : "Mit Biometrie wiederherstellen"}
              </Button>
              <button
                type="button"
                onClick={() => setStep("passphrase")}
                disabled={!mnemonicValid}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                Stattdessen Passwort verwenden
              </button>
            </>
          ) : (
            <Button
              className="w-full"
              onClick={() => setStep("passphrase")}
              disabled={!mnemonicValid}
            >
              Weiter
            </Button>
          )}
          <div className="text-center">
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Zurück
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Neues Passwort setzen</CardTitle>
        <CardDescription>
          Wähle ein Passwort, um deine wiederhergestellte Identity zu schützen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); handleRecover() }} className="space-y-4">
          <PassphraseConfirm
            passphrase={passphrase}
            confirm={confirm}
            onPassphraseChange={setPassphrase}
            onConfirmChange={setConfirm}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || passphrase.length < 8 || passphrase !== confirm}
          >
            {loading ? "Stelle wieder her…" : "Identity wiederherstellen"}
          </Button>
        </form>
        <div className="text-center">
          <button
            type="button"
            onClick={() => setStep("mnemonic")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Zurück zum Seed
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
