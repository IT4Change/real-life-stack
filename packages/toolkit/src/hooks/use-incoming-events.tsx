import { useEffect, useState, useCallback, useMemo, useRef, createContext, useContext, type ReactNode } from "react"
import type { IncomingEvent, IncomingVerificationEvent, IncomingSpaceInviteEvent, MutualVerificationEvent,
  IncomingContactRequestEvent,
  ContactConfirmedEvent,
  AuthState,
  DataInterface,
} from "@real-life-stack/data-interface"
import { hasEventListener, isAuthenticatable } from "@real-life-stack/data-interface"
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
  contactConfirmed: ContactConfirmedEvent | null
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

  // Queued dialogs are a view of THIS session AND this connector: a logout,
  // an account switch (#251 re-review) or a connector switch (#253) must drop
  // them — an invite meant for A has no business popping up for B. Within a
  // connector the IDENTITY is the trigger, not the auth status: a token
  // refresh keeps the queue.
  const previousConnector = useRef<DataInterface | null>(null)
  useEffect(() => {
    // Connector swapped without a remount (Toolkit hosts without
    // key={connectorId}): the previous instance's queue is void.
    if (previousConnector.current && previousConnector.current !== connector) setQueue([])
    previousConnector.current = connector
    if (!isAuthenticatable(connector)) return
    const observable = connector.getAuthState()
    const identityOf = (state: AuthState) => state.status === "authenticated" ? state.user.id : null
    let lastIdentity = identityOf(observable.current)
    return observable.subscribe((state) => {
      const identity = identityOf(state)
      if (identity === lastIdentity) return
      lastIdentity = identity
      setQueue([])
    })
  }, [connector])

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
  const contactConfirmed = useMemo(
    () => current?.event.type === "contact-confirmed" ? current.event : null,
    [current],
  )

  const value = useMemo(() => ({
    current,
    dismiss,
    incomingVerification,
    spaceInvite,
    mutualVerification,
    contactRequest,
    contactConfirmed,
  }), [current, dismiss, incomingVerification, spaceInvite, mutualVerification, contactRequest, contactConfirmed])

  return (
    <IncomingEventsContext.Provider value={value}>
      {children}
    </IncomingEventsContext.Provider>
  )
}
