import { useEffect, useState } from "react"
import type { InitialSyncState } from "@real-life-stack/data-interface"
import { hasInitialSync } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

const NOT_SYNCING: InitialSyncState = { active: false, knownGroups: 0 }

/**
 * Läuft gerade die Erstbefüllung dieses Geräts?
 *
 * Backends ohne Erstsync-Begriff (Local, Mock, Supabase) melden hier dauerhaft
 * `active: false` — dort gibt es kein Fenster, in dem „keine Gruppen" gelogen
 * wäre. Die Oberfläche braucht deshalb keine Fallunterscheidung nach Connector.
 */
export function useInitialSync(): InitialSyncState {
  const connector = useConnector()
  const observable = hasInitialSync(connector) ? connector.observeInitialSync() : null

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
