import { useEffect, useMemo, useState } from "react"
import type { InitialSyncState } from "@real-life-stack/data-interface"
import { hasInitialSync } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

const NOT_SYNCING: InitialSyncState = { active: false, loadedGroups: 0, expectedGroups: null }

/**
 * Läuft gerade die Erstbefüllung dieses Geräts?
 *
 * Backends ohne Erstsync-Begriff (Local, Mock, Supabase) melden hier dauerhaft
 * `active: false` — dort gibt es kein Fenster, in dem „keine Gruppen" gelogen
 * wäre. Die Oberfläche braucht deshalb keine Fallunterscheidung nach Connector.
 */
export function useInitialSync(): InitialSyncState {
  const connector = useConnector()
  // Über den Connector gemerkt, statt darauf zu vertrauen, dass jede künftige
  // Implementierung dieselbe Instanz zurückgibt: eine neue Instanz je Render
  // würde den Effekt in jedem Durchlauf ab- und neu abonnieren.
  const observable = useMemo(
    () => (hasInitialSync(connector) ? connector.observeInitialSync() : null),
    [connector],
  )

  const [state, setState] = useState<InitialSyncState>(observable?.current ?? NOT_SYNCING)

  useEffect(() => {
    if (!observable) {
      setState(NOT_SYNCING)
      return
    }
    setState(observable.current)
    return observable.subscribe(setState)
  }, [observable])

  return state
}
