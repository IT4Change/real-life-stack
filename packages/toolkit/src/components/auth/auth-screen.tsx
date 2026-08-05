import * as React from "react"
import type { Authenticatable } from "@real-life-stack/data-interface"
import { Button } from "../primitives/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../primitives/card"
import { Input } from "../primitives/input"
import { Label } from "../primitives/label"
import { cn } from "@/lib/utils"

export interface AuthScreenProps {
  /** Connector mit Authenticatable-Capability — der Screen rendert genau die
      Methoden, die getAuthMethods() anbietet (email, email-signup, anonymous). */
  connector: Authenticatable
  onAuthenticated: () => void
  /** Überschrift, Default "Anmelden". */
  title?: string
  className?: string
}

/**
 * Generischer Login-/Registrierungs-Screen über die Authenticatable-
 * Capability (Spec 02). Bewusst NICHT connector-spezifisch: welcher Flow
 * angeboten wird, entscheidet getAuthMethods() — der WoT-Connector behält
 * seinen eigenen DIDAuthScreen (Seed-Onboarding), Backend-Connectoren wie
 * Supabase bekommen E-Mail-Login/-Registrierung plus anonymen Schnellstart.
 */
export function AuthScreen({ connector, onAuthenticated, title = "Anmelden", className }: AuthScreenProps) {
  const methods = React.useMemo(() => new Map(connector.getAuthMethods().map((m) => [m.method, m])), [connector])
  const hasEmail = methods.has("email")
  const hasSignup = methods.has("email-signup")
  const anonymous = methods.get("anonymous")

  const [mode, setMode] = React.useState<"login" | "signup">(hasEmail ? "login" : "signup")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [displayName, setDisplayName] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const run = async (method: string, credentials: unknown) => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await connector.authenticate(method, credentials)
      onAuthenticated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Anmeldung fehlgeschlagen. Bitte erneut versuchen.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) return
    if (mode === "signup") {
      void run("email-signup", {
        email: email.trim(),
        password,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      })
    } else {
      void run("email", { email: email.trim(), password })
    }
  }

  const showForm = hasEmail || hasSignup

  return (
    <div className={cn("flex min-h-full items-center justify-center p-4", className)}>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === "signup" ? "Registrieren" : title}</CardTitle>
          {mode === "signup" ? (
            <CardDescription>Neues Konto mit E-Mail und Passwort anlegen.</CardDescription>
          ) : (
            <CardDescription>Mit deinem Konto fortfahren.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-display-name">Anzeigename (optional)</Label>
                  <Input
                    id="auth-display-name"
                    name="displayName"
                    autoComplete="nickname"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    disabled={submitting}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="auth-email">E-Mail</Label>
                <Input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-password">Passwort</Label>
                <Input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={mode === "signup" ? 6 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting}
                />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting || !email.trim() || !password}>
                {mode === "signup" ? "Konto anlegen" : "Anmelden"}
              </Button>
            </form>
          )}
          {!showForm && error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          {showForm && hasEmail && hasSignup && (
            <p className="text-center text-sm text-muted-foreground">
              {mode === "signup" ? (
                <>Schon ein Konto?{" "}
                  <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => { setMode("login"); setError(null) }} disabled={submitting}>
                    Anmelden
                  </button>
                </>
              ) : (
                <>Noch kein Konto?{" "}
                  <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => { setMode("signup"); setError(null) }} disabled={submitting}>
                    Registrieren
                  </button>
                </>
              )}
            </p>
          )}

          {anonymous && (
            <>
              {showForm && (
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">oder</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={submitting}
                onClick={() => void run("anonymous", {})}
              >
                {anonymous.label}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
