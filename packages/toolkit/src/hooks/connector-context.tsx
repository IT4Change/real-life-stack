import { createContext, useContext, type ReactNode } from "react"
import type { DataInterface } from "@real-life-stack/data-interface"

const ConnectorContext = createContext<DataInterface | null>(null)

export interface ConnectorProviderProps {
  connector: DataInterface
  children: ReactNode
}

export function ConnectorProvider({ connector, children }: ConnectorProviderProps) {
  // The connector is expected to be already initialized by the caller.
  // Do NOT call init() or dispose() here — the parent component manages the lifecycle.
  return <ConnectorContext value={connector}>{children}</ConnectorContext>
}

/**
 * The connector if one is provided, otherwise `null`. For components that
 * MAY enrich themselves from live data but must keep rendering without a
 * provider — `ItemPreview` is deliberately usable in tests, SSR and
 * storybook-style contexts without connector wiring.
 */
export function useOptionalConnector(): DataInterface | null {
  return useContext(ConnectorContext)
}

export function useConnector(): DataInterface {
  const connector = useContext(ConnectorContext)
  if (!connector) {
    throw new Error("useConnector must be used within a ConnectorProvider")
  }
  return connector
}
