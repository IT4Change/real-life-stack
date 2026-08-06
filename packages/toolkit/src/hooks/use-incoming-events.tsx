import { useEffect, useState, useCallback, useMemo, createContext, useContext, type ReactNode } from "react"
import type { IncomingEvent, IncomingVerificationEvent, IncomingSpaceInviteEvent, MutualVerificationEvent,
  IncomingContactRequestEvent,
} from "@real-life-stack/data-interface"
import { hasEventListener } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

// --- Notification Queue ---

export interface QueuedNotification {
  id: string
  event: IncomingEvent
}

interface IncomingEventsContextType {
  /** Current (first) notification in queue, or null */
  current: QueuedNotification | null
  /** Dismiss the current notification (pops from queue) */
  dismiss: () => void
  /** Current notification typed helpers */
  incomingVerification: IncomingVerificationEvent | null
  spaceInvite: IncomingSpaceInviteEvent | null
  mutualVerification: MutualVerificationEvent | null
  contactRequest: IncomingContactRequestEvent | null
}

const IncomingEventsContext = createContext<IncomingEventsContextType | null>(null)

export function useIncomingEvents(): IncomingEventsContextType {
  const ctx = useContext(IncomingEventsContext)
  if (!ctx) {
    throw new Error("useIncomingEvents must be used within IncomingEventsProvider")
  }
  return ctx
}

export { IncomingEventsContext }

/**
 * Provider that listens to connector's incoming events and manages
 * a FIFO notification queue. Only one notification is shown at a time.
 */
export function IncomingEventsProvider({ children }: { children: ReactNode }) {
  const connector = useConnector()
  const [queue, setQueue] = useState<QueuedNotification[]>([])

  const enqueue = useCallback((notification: QueuedNotification) => {
    setQueue((prev) => prev.some((n) => n.id === notification.id) ? prev : [...prev, notification])
  }, [])

  const dismiss = useCallback(() => {
    setQueue((prev) => prev.slice(1))
  }, [])

  // Subscribe to connector events
  useEffect(() => {
    if (!hasEventListener(connector)) return

    const unsub = connector.onIncomingEvent((event) => {
      const id = `${event.type}-${event.fromId}-${Date.now()}`
      enqueue({ id, event })
    })
    return unsub
  }, [connector, enqueue])

  const current = queue[0] ?? null

  const incomingVerification = useMemo(
    () => current?.event.type === "incoming-verification" ? current.event : null,
    [current],
  )
  const spaceInvite = useMemo(
    () => current?.event.type === "space-invite" ? current.event : null,
    [current],
  )
  const mutualVerification = useMemo(
    () => current?.event.type === "mutual-verification" ? current.event : null,
    [current],
  )
  const contactRequest = useMemo(
    () => current?.event.type === "contact-request" ? current.event : null,
    [current],
  )

  const value = useMemo(() => ({
    current,
    dismiss,
    incomingVerification,
    spaceInvite,
    mutualVerification,
    contactRequest,
  }), [current, dismiss, incomingVerification, spaceInvite, mutualVerification, contactRequest])

  return (
    <IncomingEventsContext.Provider value={value}>
      {children}
    </IncomingEventsContext.Provider>
  )
}
