import { useCallback, useEffect, useMemo, useState } from "react"
import type { ConfirmationView } from "@real-life-stack/data-interface"
import { hasConfirmations } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

export function useConfirmations() {
  const connector = useConnector()
  const supported = hasConfirmations(connector)
  const [confirmations, setConfirmations] = useState<ConfirmationView[]>([])

  useEffect(() => {
    if (!supported) {
      setConfirmations([])
      return
    }
    const observable = connector.observeConfirmations()
    setConfirmations(observable.current)
    return observable.subscribe(setConfirmations)
  }, [connector, supported])

  const signedAttested = useMemo(
    () => confirmations.filter((c) => c.trustLevel === "signed-attested"),
    [confirmations]
  )

  const serverConfirmed = useMemo(
    () => confirmations.filter((c) => c.trustLevel === "server-confirmed"),
    [confirmations]
  )

  const bySubject = useCallback(
    (subjectId: string) => confirmations.filter((c) => c.subjectId === subjectId),
    [confirmations]
  )

  return {
    supported,
    confirmations,
    signedAttested,
    serverConfirmed,
    bySubject,
  }
}
