import {
  createObservable,
  type InitialSyncState,
  type Observable,
  type ReactiveObservable,
} from "@real-life-stack/data-interface"

export interface InitialSyncTrackerConfig {
  /**
   * Ruhefenster: so lange nichts Neues mehr eintrifft, gilt der Erstsync als
   * beendet. Muss länger sein als der übliche Abstand zwischen zwei Space-
   * Dokumenten, sonst blinkt die Anzeige zwischen zwei Paketen aus.
   */
  settleMs?: number
  /**
   * Obergrenze. Ohne sie hinge die Anzeige an einem Relay, das dauerhaft
   * etwas nachliefert — die Aussage „Erstsync" wäre dann keine mehr.
   */
  maxMs?: number
}

const DEFAULT_SETTLE_MS = 2_500
const DEFAULT_MAX_MS = 60_000

/**
 * Erkennt, ob dieses Gerät gerade seinen ersten Datenbestand empfängt.
 *
 * Es gibt in wot-core kein Ereignis „Catch-up für Space X fertig" — der
 * Adapter hält seinen Catch-up-Zustand privat (`spaceCatchUpsInFlight`). Statt
 * ein Fertig-Signal zu erfinden, misst dieser Tracker das, was tatsächlich
 * beobachtbar ist: **es trifft noch etwas ein**. Der Erstsync gilt als beendet,
 * wenn für `settleMs` nichts Neues mehr kam (oder spätestens nach `maxMs`).
 *
 * Bewusst NICHT als Fortschrittsbalken ausgelegt: die Gesamtzahl der Spaces
 * ist am Anfang unbekannt, „3 von 12" wäre geraten. Veröffentlicht wird
 * deshalb nur, wie viele Gruppen bisher da sind.
 */
export class InitialSyncTracker {
  private readonly settleMs: number
  private readonly maxMs: number
  private readonly obs: ReactiveObservable<InitialSyncState> =
    createObservable<InitialSyncState>({ active: false, knownGroups: 0 })

  /** Erstsync erwartet, unabhängig davon ob die Verbindung gerade steht. */
  private expecting = false
  private relayConnected = true
  private settleTimer: ReturnType<typeof setTimeout> | null = null
  private maxTimer: ReturnType<typeof setTimeout> | null = null
  private knownGroups = 0

  constructor(config: InitialSyncTrackerConfig = {}) {
    this.settleMs = config.settleMs ?? DEFAULT_SETTLE_MS
    this.maxMs = config.maxMs ?? DEFAULT_MAX_MS
  }

  observe(): Observable<InitialSyncState> {
    return this.obs
  }

  /**
   * Nach abgeschlossenem Login aufrufen.
   *
   * @param expectRemoteData `false` für eine gerade erzeugte Identität — dort
   *   ist „keine Gruppe" die Wahrheit und keine Wartesituation.
   * @param localGroups Gruppen, die schon lokal vorliegen. Sind welche da, hat
   *   die Oberfläche etwas zu zeigen; dann ist der Nachlauf normaler Sync und
   *   keine Erstbefüllung.
   */
  begin({ expectRemoteData, localGroups }: { expectRemoteData: boolean; localGroups: number }): void {
    this.knownGroups = localGroups
    if (!expectRemoteData || localGroups > 0) {
      this.expecting = false
      this.publish()
      return
    }
    this.expecting = true
    this.armMaxTimer()
    this.armSettleTimer()
    this.publish()
  }

  /** Es ist etwas eingetroffen (Space-Liste, Remote-Update, PersonalDoc). */
  noteActivity(): void {
    if (!this.expecting) return
    this.armSettleTimer()
  }

  setKnownGroups(count: number): void {
    if (count === this.knownGroups) return
    this.knownGroups = count
    // Eine neu aufgetauchte Gruppe ist Nachschub, kein Ruhezustand.
    this.noteActivity()
    this.publish()
  }

  setRelayConnected(connected: boolean): void {
    if (connected === this.relayConnected) return
    this.relayConnected = connected
    if (this.expecting) {
      // Ohne Verbindung kommt nichts — dann darf die Anzeige auch nichts
      // versprechen. Die Uhr läuft erst weiter, wenn der Relay wieder da ist.
      if (connected) this.armSettleTimer()
      else this.clearSettleTimer()
    }
    this.publish()
  }

  /** Abmelden / Teardown: Anzeige aus, keine Timer zurücklassen. */
  end(): void {
    this.expecting = false
    this.clearSettleTimer()
    this.clearMaxTimer()
    this.publish()
  }

  private armSettleTimer(): void {
    this.clearSettleTimer()
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null
      this.finish()
    }, this.settleMs)
  }

  private armMaxTimer(): void {
    this.clearMaxTimer()
    this.maxTimer = setTimeout(() => {
      this.maxTimer = null
      this.finish()
    }, this.maxMs)
  }

  private finish(): void {
    this.expecting = false
    this.clearSettleTimer()
    this.clearMaxTimer()
    this.publish()
  }

  private clearSettleTimer(): void {
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
  }

  private clearMaxTimer(): void {
    if (this.maxTimer !== null) {
      clearTimeout(this.maxTimer)
      this.maxTimer = null
    }
  }

  private publish(): void {
    const active = this.expecting && this.relayConnected
    const current = this.obs.current
    if (current.active === active && current.knownGroups === this.knownGroups) return
    this.obs.set({ active, knownGroups: this.knownGroups })
  }
}
