import { useState, useEffect, useCallback } from "react"
import {
  MnemonicGrid,
  MnemonicVerify,
  PassphraseConfirm,
  StepProgress,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Label,
  Separator,
} from "@real-life-stack/toolkit"
import { Key, Shield, Sparkles, Check, AlertTriangle, User as UserIcon, Fingerprint } from "lucide-react"
import type { WotConnector } from "../wot-connector.js"
import { BiometricService } from "../biometric-service.js"
import { generateRandomPassphrase } from "../random-passphrase.js"

type OnboardingStep = "welcome" | "seed" | "verify" | "profile" | "password" | "complete"

const STEP_LABELS = ["Start", "Seed", "Prüfen", "Profil", "Passwort"]
const STEP_INDEX: Record<OnboardingStep, number> = {
  welcome: 0,
  seed: 1,
  verify: 2,
  profile: 3,
  password: 4,
  complete: 4,
}

interface OnboardingFlowProps {
  connector: WotConnector
  onComplete: () => void
  onSwitchToRecovery: () => void
}

export function OnboardingFlow({ connector, onComplete, onSwitchToRecovery }: OnboardingFlowProps) {
  const [step, setStepRaw] = useState<OnboardingStep>("welcome")
  const [mnemonic, setMnemonic] = useState<string[]>([])
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [checklistItems, setChecklistItems] = useState([
    { id: "written", checked: false },
    { id: "safe", checked: false },
    { id: "understand", checked: false },
  ])
  const [biometricAvailable, setBiometricAvailable] = useState(false)

  // --- Browser history navigation ---
  const goToStep = useCallback((newStep: OnboardingStep) => {
    setStepRaw(newStep)
    setError("")
    history.pushState({ onboardingStep: newStep }, "")
  }, [])

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.onboardingStep) {
        setStepRaw(e.state.onboardingStep)
        setError("")
      } else {
        setStepRaw("welcome")
      }
    }
    history.replaceState({ onboardingStep: "welcome" }, "")
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  // Check biometric availability on mount
  useEffect(() => {
    BiometricService.isAvailable().then(setBiometricAvailable)
  }, [])

  // --- Actions ---
  const handleGenerate = async () => {
    setLoading(true)
    setError("")
    try {
      const user = await connector.authenticate("generate", {}) as any
      if (user._mnemonic) {
        setMnemonic(user._mnemonic.split(" "))
        goToStep("seed")
      }
    } catch (err: any) {
      setError(err.message ?? "Fehler beim Generieren")
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(mnemonic.join(" "))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleChecklist = (id: string) => {
    setChecklistItems((items) =>
      items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))
    )
  }

  const allChecked = checklistItems.every((item) => item.checked)

  // Biometric protect path: generates random passphrase, stores via biometrics.
  // Order matters: enroll FIRST so a cancelled/failed biometric prompt leaves no
  // stored identity behind a random passphrase the user never saw. Only once the
  // keystore holds the passphrase do we create the identity with it; if that step
  // fails we roll the keystore entry back so no orphan key is stranded.
  const handleBiometricProtect = async () => {
    setLoading(true)
    setError("")
    const randomPassphrase = generateRandomPassphrase()
    try {
      await BiometricService.enroll(randomPassphrase)
    } catch {
      // Prompt cancelled / enrollment failed — nothing persisted yet.
      setLoading(false)
      goToStep("password")
      return
    }
    try {
      await connector.authenticate("create", {
        mnemonic: mnemonic.join(" "),
        passphrase: randomPassphrase,
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      })
      goToStep("complete")
      setTimeout(onComplete, 2000)
    } catch {
      // Identity creation failed after enrollment — roll back the keystore entry.
      await BiometricService.unenroll().catch(() => {})
      setLoading(false)
      goToStep("password")
    }
  }

  const handleFinalize = async () => {
    if (passphrase.length < 8) {
      setError("Mindestens 8 Zeichen")
      return
    }
    if (passphrase !== confirm) {
      setError("Passwörter stimmen nicht überein")
      return
    }
    setLoading(true)
    setError("")
    try {
      await connector.authenticate("create", {
        mnemonic: mnemonic.join(" "),
        passphrase,
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      })
      // Also enroll biometric if available (optional, silent on failure)
      if (biometricAvailable) {
        try {
          await BiometricService.enroll(passphrase)
        } catch { /* biometric enrollment optional */ }
      }
      goToStep("complete")
      setTimeout(onComplete, 2000)
    } catch (err: any) {
      setError(err.message ?? "Fehler beim Schützen der Identity")
    } finally {
      setLoading(false)
    }
  }

  // --- Step: Welcome ---
  if (step === "welcome") {
    return (
      <div className="space-y-6">
        <StepProgress steps={STEP_LABELS} currentStep={0} />
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="size-7 text-primary" />
            </div>
            <CardTitle>Willkommen!</CardTitle>
            <CardDescription>
              Erstelle deine dezentrale digitale Identity. Sie gehört nur dir — kein Server, kein Anbieter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2 font-medium text-blue-900 dark:text-blue-300">
                <Shield className="size-4" />
                <span>Was wird passieren:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-400 ml-1">
                <li>Du erhältst 12 geheime Wörter (dein „Seed")</li>
                <li>Du schreibst sie auf und bestätigst das</li>
                <li>Du füllst dein Profil aus</li>
                <li>Du setzt ein Passwort zum Schutz</li>
              </ol>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  <strong>Wichtig:</strong> Die 12 Wörter sind dein einziger Weg, die Identity wiederherzustellen. Halte Stift und Papier bereit.
                </p>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={handleGenerate} disabled={loading}>
              {loading ? "Generiere Identity…" : "Identity generieren"}
            </Button>
            <div className="text-center">
              <button
                type="button"
                onClick={onSwitchToRecovery}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Ich habe bereits einen Seed
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // --- Step: Show Seed ---
  if (step === "seed") {
    return (
      <div className="space-y-6">
        <StepProgress steps={STEP_LABELS} currentStep={1} />
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="size-7 text-amber-500" />
            </div>
            <CardTitle>Dein Recovery Seed</CardTitle>
            <CardDescription>
              Schreibe diese 12 Wörter in der richtigen Reihenfolge auf und bewahre sie sicher auf.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MnemonicGrid words={mnemonic} copyable />

            {/* Security Checklist */}
            <Separator />
            <div className="space-y-1">
              {[
                { id: "written", label: "Ich habe alle 12 Wörter aufgeschrieben" },
                { id: "safe", label: "Ich habe sie an einem sicheren Ort verwahrt" },
                { id: "understand", label: "Ich verstehe, dass sie nicht wiederhergestellt werden können" },
              ].map(({ id, label }) => {
                const item = checklistItems.find((c) => c.id === id)!
                return (
                  <label
                    key={id}
                    className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleChecklist(id)}
                      className="size-4 rounded border-muted-foreground/40 accent-green-600 shrink-0"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                )
              })}
            </div>

            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">
                <strong>Letzte Warnung:</strong> Wenn du die Wörter verlierst, gibt es keine Möglichkeit, deine Identity wiederherzustellen.
              </p>
            </div>

            <Button className="w-full" onClick={() => goToStep("verify")} disabled={!allChecked}>
              Weiter zur Verifizierung
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // --- Step: Verify Seed ---
  if (step === "verify") {
    return (
      <div className="space-y-6">
        <StepProgress steps={STEP_LABELS} currentStep={2} />
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Seed bestätigen</CardTitle>
            <CardDescription>
              Gib die folgenden Wörter ein, um sicherzustellen, dass du sie korrekt notiert hast.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MnemonicVerify words={mnemonic} onVerified={() => goToStep("profile")} />
            <button
              type="button"
              onClick={() => history.back()}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Zurück zum Seed
            </button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // --- Step: Profile ---
  if (step === "profile") {
    return (
      <div className="space-y-6">
        <StepProgress steps={STEP_LABELS} currentStep={3} />
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10">
              <UserIcon className="size-7 text-primary" />
            </div>
            <CardTitle>Dein Profil</CardTitle>
            <CardDescription>
              Wie möchtest du dich anderen gegenüber zeigen?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="onboarding-name">Name</Label>
              <Input
                id="onboarding-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Dein Name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    goToStep("password")
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboarding-bio">Über mich</Label>
              <Input
                id="onboarding-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Ein kurzer Satz über dich (optional)"
              />
            </div>
            {biometricAvailable ? (
              <>
                <Button
                  className="w-full flex items-center gap-2"
                  onClick={handleBiometricProtect}
                  disabled={loading}
                >
                  <Fingerprint className="size-5" />
                  {loading ? "Richte ein…" : "Mit Biometrie schützen"}
                </Button>
                <button
                  type="button"
                  onClick={() => goToStep("password")}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Stattdessen Passwort verwenden
                </button>
              </>
            ) : (
              <>
                <Button className="w-full" onClick={() => goToStep("password")}>
                  Weiter
                </Button>
                <button
                  type="button"
                  onClick={() => goToStep("password")}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Überspringen
                </button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // --- Step: Password ---
  if (step === "password") {
    return (
      <div className="space-y-6">
        <StepProgress steps={STEP_LABELS} currentStep={4} />
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-green-500/10">
              <Key className="size-7 text-green-500" />
            </div>
            <CardTitle>Schütze deine Identity</CardTitle>
            <CardDescription>
              Wähle ein starkes Passwort, um deine Identity auf diesem Gerät zu schützen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); handleFinalize() }} className="space-y-4">
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Tipp:</strong> Das Passwort ist nicht dein Seed. Es schützt deine Identity lokal auf diesem Gerät.
                </p>
              </div>
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
                {loading ? "Wird gesichert…" : "Passwort setzen"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // --- Step: Complete ---
  return (
    <div className="space-y-6">
      <StepProgress steps={STEP_LABELS} currentStep={4} />
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-green-500/10">
            <Check className="size-7 text-green-500" />
          </div>
          <CardTitle>Geschafft!</CardTitle>
          <CardDescription>
            Deine Identity wurde erfolgreich erstellt und geschützt.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="animate-pulse text-sm text-muted-foreground">
            Du wirst zur App weitergeleitet…
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
