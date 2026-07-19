import { useState, useEffect } from "react"
import type { WotConnector } from "../wot-connector.js"
import { OnboardingFlow } from "./OnboardingFlow.js"
import { UnlockFlow } from "./UnlockFlow.js"
import { RecoveryFlow } from "./RecoveryFlow.js"

type AuthView = "loading" | "onboarding" | "unlock" | "recovery"

interface DIDAuthScreenProps {
  connector: WotConnector
  onAuthenticated: () => void
}

export function DIDAuthScreen({ connector, onAuthenticated }: DIDAuthScreenProps) {
  const [view, setView] = useState<AuthView>("loading")

  useEffect(() => {
    // Determine initial view based on stored identity
    const authObs = connector.getAuthState()
    const state = authObs.current

    // If already authenticated (auto-unlock succeeded), signal completion
    if (state.status === "authenticated") {
      onAuthenticated()
      return
    }

    // Check if there's a stored identity (= unlock) or not (= onboarding)
    // The connector's init() already ran, so if status is unauthenticated:
    // - If there's a stored identity → unlock view
    // - If not → onboarding view
    // We detect this by checking if "unlock" method would make sense.
    // Since we can't directly check hasStoredIdentity from here,
    // we use a heuristic: subscribe to auth state changes.
    checkStoredIdentity()
  }, [connector])

  async function checkStoredIdentity() {
    try {
      // Try to detect stored identity via a lightweight check
      // WotIdentity exposes hasStoredIdentity — we access it through the connector
      // For now, we check if the connector has already initialized
      const authState = connector.getAuthState().current
      if (authState.status === "authenticated") {
        onAuthenticated()
      } else {
        // Check localStorage marker for previously used DID
        const hasStored = localStorage.getItem("rls-wot-active-did") !== null
        setView(hasStored ? "unlock" : "onboarding")
      }
    } catch {
      setView("onboarding")
    }
  }

  if (view === "loading") {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Laden…</div>
      </div>
    )
  }

  return (
    // The app shell pins html/body/#root to overflow:hidden (each surface owns
    // its scrolling) — the wizard must bring its OWN scroll container, or tall
    // steps (Magic Words!) get clipped without any way to scroll.
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        {view === "onboarding" && (
          <OnboardingFlow
            connector={connector}
            onComplete={onAuthenticated}
            onSwitchToRecovery={() => setView("recovery")}
          />
        )}
        {view === "unlock" && (
          <UnlockFlow
            connector={connector}
            onComplete={onAuthenticated}
            onSwitchToRecovery={() => setView("recovery")}
          />
        )}
        {view === "recovery" && (
          <RecoveryFlow
            connector={connector}
            onComplete={onAuthenticated}
            onBack={() => {
              const hasStored = localStorage.getItem("rls-wot-active-did") !== null
              setView(hasStored ? "unlock" : "onboarding")
            }}
          />
        )}
      </div>
      </div>
    </div>
  )
}
