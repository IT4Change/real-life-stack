import { useEffect, useRef, useState } from "react"
import { isAuthenticatable, type User } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

/**
 * Fallback author resolution: some ids are not in the current member list
 * (e.g. a membership entry that has not synced yet) although the connector
 * CAN resolve them — WoT cascades own profile → verified contacts →
 * discovery. Never show a raw DID when a name is one lookup away.
 */
export function useResolvedUsers(ids: readonly string[]): ReadonlyMap<string, User> {
  const connector = useConnector()
  const [resolved, setResolved] = useState<ReadonlyMap<string, User>>(new Map())
  const pending = useRef(new Set<string>())

  useEffect(() => {
    if (!isAuthenticatable(connector)) return
    let cancelled = false
    for (const id of ids) {
      if (resolved.has(id) || pending.current.has(id)) continue
      pending.current.add(id)
      void connector.getUser(id).then((user) => {
        pending.current.delete(id)
        if (cancelled || !user || !user.displayName || user.displayName === id) return
        setResolved((current) => {
          const next = new Map(current)
          next.set(id, user)
          return next
        })
      }).catch(() => pending.current.delete(id))
    }
    return () => { cancelled = true }
  }, [connector, ids, resolved])

  return resolved
}
