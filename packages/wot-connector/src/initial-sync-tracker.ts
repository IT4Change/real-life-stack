import {
  createObservable,
  type InitialSyncState,
  type Observable,
  type ReactiveObservable,
} from "@real-life-stack/data-interface"

/**
 * Erstsync-Zustand dieses Geräts, abgeleitet aus dem Catch-up-Zustand des
 * Adapters (web-of-trust#343).
 *
 * **Vorher stand hier eine Zustandsmaschine mit drei Zeitfenstern.** Die App
 * hatte keinen Zugang zum Catch-up-Zustand und musste ihn aus mitgelesenen
 * Wire-Rahmen plus Ruhepausen erraten — mit allen Folgeproblemen, die das mit
 * sich brachte: Reihenfolge asynchroner Auswertungen, Lebenszyklus über
 * Re-Logins, Fristen, die offline ablaufen. Nichts davon war ein
 * Anwendungsproblem, und nichts davon ist noch hier.
 *
 * Übrig bleibt eine Übersetzung: `CatchUpOverview.syncing` sagt, ob noch etwas
 * aussteht; die Gruppenzahlen kommen aus der Mitgliedschaftsliste und dienen
 * nur der Anzeige („3 von 12"). Keine Timer, keine Heuristik, keine Vermutung.
 */
export class InitialSyncTracker {
  private readonly obs: ReactiveObservable<InitialSyncState> =
    createObservable<InitialSyncState>({ active: false, loadedGroups: 0, expectedGroups: null })

  /**
   * Erstsync ERWARTET: dieses Gerät hat noch keine Gruppen und meldet sich
   * nicht gerade frisch erzeugt an. Ohne diese Erwartung ist ein laufender
   * Catch-up normaler Betrieb und keine Erstbefüllung.
   */
  private expecting = false
  private stopped = false
  /** Läuft laut Adapter gerade ein Catch-up, dem etwas fehlt? */
  private outstanding = false
  private loadedGroups = 0
  private expectedGroups: number | null = null

  observe(): Observable<InitialSyncState> {
    return this.obs
  }

  /** Eine neue Runtime beginnt (Bootstrap, vor dem ersten Sync-Start). */
  prepare(): void {
    this.stopped = false
    this.expecting = false
    this.outstanding = false
    this.loadedGroups = 0
    this.expectedGroups = null
    this.publish()
  }

  /**
   * Nach abgeschlossenem Login aufrufen.
   *
   * @param expectRemoteData `false` für eine gerade erzeugte Identität — dort
   *   ist „keine Gruppe" die Wahrheit und keine Wartesituation.
   * @param localGroups Gruppen, die schon lokal vorliegen. Sind welche da, hat
   *   die Oberfläche etwas zu zeigen; der Nachlauf ist dann normaler Sync.
   */
  begin({ expectRemoteData, localGroups }: { expectRemoteData: boolean; localGroups: number }): void {
    this.stopped = false
    this.loadedGroups = localGroups
    this.expecting = expectRemoteData && localGroups === 0
    this.publish()
  }

  /** Der Adapter meldet, ob für irgendein Dokument noch etwas aussteht. */
  setOutstanding(outstanding: boolean): void {
    if (this.stopped || outstanding === this.outstanding) return
    this.outstanding = outstanding
    // Erstbefüllung abgeschlossen: nichts steht mehr aus UND es sind Gruppen
    // da. Ab hier ist ein Catch-up normaler Betrieb — eine Einladung morgen
    // soll nicht wieder als „Erstsync" erscheinen. Ohne Gruppen bleibt die
    // Erwartung bestehen: eine Ruhepause ist kein Beleg für Vollständigkeit.
    if (!outstanding && this.loadedGroups > 0) this.expecting = false
    this.publish()
  }

  /**
   * Stand der Gruppenliste — reine Anzeige. `expected` kommt aus der
   * Mitgliedschaftsliste des persönlichen Dokuments, `null` solange die noch
   * nichts hergibt.
   */
  setGroupCounts({ loaded, expected }: { loaded: number; expected: number | null }): void {
    if (this.stopped) return
    if (loaded === this.loadedGroups && expected === this.expectedGroups) return
    this.loadedGroups = loaded
    this.expectedGroups = expected
    this.publish()
  }

  /** Abmelden / Teardown: Anzeige aus, Zustand eingefroren. */
  end(): void {
    this.stopped = true
    this.expecting = false
    this.outstanding = false
    this.publish()
  }

  private publish(): void {
    const active = this.expecting && this.outstanding
    const current = this.obs.current
    if (
      current.active === active &&
      current.loadedGroups === this.loadedGroups &&
      current.expectedGroups === this.expectedGroups
    ) return
    this.obs.set({ active, loadedGroups: this.loadedGroups, expectedGroups: this.expectedGroups })
  }
}
