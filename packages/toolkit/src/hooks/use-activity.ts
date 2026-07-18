import { useEffect, useMemo, useReducer, startTransition } from "react"
import { hasActivityLog } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

/** Reads the optional space activity projection without making it a shell requirement. */
export function useActivity(limit?: number) {
  const connector = useConnector()
  const observable = useMemo(
    () => hasActivityLog(connector) ? connector.observeActivity(limit === undefined ? undefined : { limit }) : null,
    [connector, limit],
  )
  const [, rerender] = useReducer((value: number) => value + 1, 0)
  useEffect(() => observable?.subscribe(() => startTransition(rerender)), [observable])
  return { data: observable?.current ?? [], supported: observable !== null }
}
