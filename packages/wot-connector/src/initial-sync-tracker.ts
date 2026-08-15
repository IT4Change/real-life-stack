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
 * Zwei Quellen, in dieser Reihenfolge:
 *
 * 1. **Die Mitgliedschaftsliste** aus dem persönlichen Dokument
 *    (`PersonalDoc.spaces`) sagt, wie viele Gruppen es überhaupt gibt. Solange
 *    weniger geladen sind, LÄUFT der Erstsync — punkt. Keine Zeitheuristik,
 *    und deshalb kann die Anzeige in dieser Phase auch nicht in einer Ruhepause
 *    verschwinden (etwa während des Schlüsselaustauschs).
 * 2. **Der Nachlauf danach**: Gruppen sind vollständig, aber ihre Inhalte
 *    trudeln noch ein. Dafür gibt es in wot-core kein Fertig-Signal pro Space
 *    (`spaceCatchUpsInFlight` ist adapter-privat), also gilt hier das einzige
 *    beobachtbare Kriterium: es trifft nichts Neues mehr ein (`settleMs`).
 *
 * `maxMs` deckelt beides — eine Anzeige, die nie endet, ist keine Aussage mehr.
 */
export class InitialSyncTracker {
  private readonly settleMs: number
  private readonly maxMs: number
  private readonly obs: ReactiveObservable<InitialSyncState> =
    createObservable<InitialSyncState>({ active: false, loadedGroups: 0, expectedGroups: null })

  /** Erstsync erwartet, unabhängig davon ob die Verbindung gerade steht. */
  private expecting = false
  private relayConnected = true
  private settleTimer: ReturnType<typeof setTimeout> | null = null
  private maxTimer: ReturnType<typeof setTimeout> | null = null
  private loadedGroups = 0
  /** Erwartete Mitgliedschaften laut persönlichem Dokument; null = noch unbekannt. */
  private expectedGroups: number | null = null

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
    this.loadedGroups = localGroups
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

  /**
   * Stand der Gruppenliste. `expected` kommt aus der Mitgliedschaftsliste des
   * persönlichen Dokuments, `null` solange die noch nichts hergibt.
   */
  setGroupCounts({ loaded, expected }: { loaded: number; expected: number | null }): void {
    if (loaded === this.loadedGroups && expected === this.expectedGroups) return
    this.loadedGroups = loaded
    this.expectedGroups = expected
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
      this.settle()
    }, this.settleMs)
  }

  private armMaxTimer(): void {
    this.clearMaxTimer()
    this.maxTimer = setTimeout(() => {
      this.maxTimer = null
      this.finish()
    }, this.maxMs)
  }

  /** Ruhefenster abgelaufen — aber Ruhe heisst nur „fertig", wenn auch alle
   *  erwarteten Gruppen da sind. Sonst weiterwarten (bis zur Obergrenze). */
  private settle(): void {
    if (this.expectedGroups !== null && this.loadedGroups < this.expectedGroups) {
      this.armSettleTimer()
      return
    }
    this.finish()
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
    if (
      current.active === active &&
      current.loadedGroups === this.loadedGroups &&
      current.expectedGroups === this.expectedGroups
    ) return
    this.obs.set({ active, loadedGroups: this.loadedGroups, expectedGroups: this.expectedGroups })
  }
}
