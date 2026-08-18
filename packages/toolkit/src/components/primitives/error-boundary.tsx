import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"

import { Button } from "./button"
import { cn } from "@/lib/utils"

export interface ErrorFallbackProps {
  error: Error
  /** Verwirft den Fehler und rendert den Bereich erneut. */
  reset: () => void
}

export interface ErrorBoundaryProps {
  children: ReactNode
  /**
   * Was der Bereich heisst, wenn er ausfällt („Die Kontaktliste"). Steht in der
   * Meldung und macht sichtbar, WAS ausgefallen ist statt nur DASS.
   */
  label?: string
  /** Eigene Darstellung statt der eingebauten. */
  fallback?: (props: ErrorFallbackProps) => ReactNode
  /** Für Protokollierung; darf selbst nicht werfen. */
  onError?: (error: Error, info: ErrorInfo) => void
  /**
   * Wechselt einer dieser Werte, verwirft die Grenze den Fehler von selbst.
   * Gedacht für den Bezug, an dem der Bereich hängt (Space-Id, Item-Id): nach
   * einem Wechsel ist der alte Fehler keine Aussage über den neuen Inhalt.
   */
  resetKeys?: unknown[]
  className?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

function sameKeys(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((value, i) => Object.is(value, b[i]))
}

/**
 * Fängt Render-Fehler eines Bereichs ab, statt die ganze Anwendung zu verlieren.
 *
 * **Warum das eine Querschnitts-Komponente ist:** ein Fehler beim Rendern
 * reisst in React standardmässig den kompletten Baum ab — eine einzelne kaputte
 * Zeile macht die Anwendung weiss, und der Nutzer verliert auch alles, was
 * daneben funktioniert hätte. Wo die Grenze gezogen wird, entscheidet, wie viel
 * stehen bleibt. Deshalb gehört sie um die Bereiche, die für sich ausfallen
 * können (Dialoge, Listen, Modul-Flächen), und zusätzlich einmal um die Wurzel
 * als Auffangnetz.
 *
 * **Was sie NICHT kann:** Fehler ausserhalb des Renderns — Ereignisbehandlung,
 * Zeitgeber, abgelehnte Promises, Server-Rendering. React ruft die Grenze dort
 * nicht auf. Das ist eine Eigenschaft von React, keine Lücke, die man hier
 * schliessen könnte; solche Pfade brauchen ihr eigenes `catch`.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    // Nur beim WECHSEL zurücksetzen, nicht bei jedem Render: sonst rendert die
    // Grenze den fehlerhaften Bereich sofort erneut, wirft erneut, und die
    // Anwendung dreht sich in einer Schleife statt die Meldung zu zeigen.
    if (this.state.error && !sameKeys(prev.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Die Grenze ist die letzte Instanz — wirft die Protokollierung selbst,
    // gäbe es niemanden mehr, der das auffängt.
    try {
      this.props.onError?.(error, info)
    } catch {
      /* bewusst verschluckt */
    }
    console.error(`[ErrorBoundary] ${this.props.label ?? "Bereich"} konnte nicht dargestellt werden`, error)
  }

  private reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback({ error, reset: this.reset })

    return (
      <div
        role="alert"
        className={cn(
          "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
          this.props.className,
        )}
      >
        <AlertTriangle className="h-10 w-10 text-muted-foreground/50" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          {this.props.label ?? "Dieser Bereich"} konnte nicht angezeigt werden
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Der Rest der App funktioniert weiter. Du kannst es erneut versuchen.
        </p>
        {/* Die technische Meldung bleibt lesbar — sie ist das Einzige, was ein
            Fehlerbericht später brauchbar macht. */}
        <p className="max-w-sm break-words font-mono text-xs text-muted-foreground/70">{error.message}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={this.reset}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Erneut versuchen
        </Button>
      </div>
    )
  }
}
