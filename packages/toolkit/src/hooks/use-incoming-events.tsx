import { useEffect, useReducer, useCallback, useMemo, createContext, useContext, type ReactNode } from "react"
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
/**
 * Wem gehört die Queue: Connector-INSTANZ + Identität. Beides ist Teil des
 * Zustands, nicht Ergebnis eines Effects — dadurch ist die Isolation eine
 * Invariante und kein Timing-Patch (#251/#253 Review): schon der erste
 * Render unter einem neuen Besitzer sieht garantiert keine fremden Dialoge.
 */
interface QueueOwner {
  connector: DataInterface | null
  identity: string | null
}

interface QueueState {
  owner: QueueOwner
  entries: QueuedNotification[]
}

type QueueAction =
  | { type: "rebind"; owner: QueueOwner }
  | { type: "enqueue"; owner: QueueOwner; notification: QueuedNotification }
  /** dismiss trägt denselben Owner-Vertrag UND die konkrete Notification:
      eine verspätete Aktion darf weder den Dialog eines neuen Besitzers noch
      den NACHFOLGENDEN Dialog desselben Besitzers schlucken. */
  | { type: "dismiss"; owner: QueueOwner; id: string }

const sameOwner = (a: QueueOwner, b: QueueOwner) =>
  a.connector === b.connector && a.identity === b.identity

const EMPTY_ENTRIES: QueuedNotification[] = []

function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "rebind":
      // Besitzerwechsel verwirft die Dialoge des vorherigen Besitzers.
      return sameOwner(state.owner, action.owner) ? state : { owner: action.owner, entries: EMPTY_ENTRIES }
    case "enqueue":
      // Verspätete Events eines alten Besitzers kommen nicht mehr hinein.
      if (!sameOwner(state.owner, action.owner)) return state
      if (state.entries.some((entry) => entry.id === action.notification.id)) return state
      return { ...state, entries: [...state.entries, action.notification] }
    case "dismiss": {
      if (!sameOwner(state.owner, action.owner)) return state
      // Nur den Kopf entfernen, und nur wenn er der gemeinte ist.
      if (state.entries[0]?.id !== action.id) return state
      return { ...state, entries: state.entries.slice(1) }
    }
  }
}

const identityOf = (state: AuthState): string | null =>
  state.status === "authenticated" ? state.user.id : null

/**
 * Provider that listens to connector's incoming events and manages
 * a FIFO notification queue. Only one notification is shown at a time.
 */
export function IncomingEventsProvider({ children }: { children: ReactNode }) {
  const connector = useConnector()
  // Synchron gelesener Besitzer: der Auth-State ist eine Observable, deren
  // aktueller Wert ohne Await verfügbar ist.
  const identity = isAuthenticatable(connector) ? identityOf(connector.getAuthState().current) : null
  const owner: QueueOwner = { connector, identity }

  const [state, dispatch] = useReducer(queueReducer, { owner, entries: EMPTY_ENTRIES })

  // DIE Invariante: Einträge zählen nur, solange der Besitzer noch stimmt.
  // Das gilt schon im ersten Render nach einem Wechsel — vor jedem Effect.
  const entries = sameOwner(state.owner, owner) ? state.entries : EMPTY_ENTRIES

  // Besitzerwechsel im State nachziehen (verwirft die alten Einträge).
  useEffect(() => {
    dispatch({ type: "rebind", owner: { connector, identity } })
  }, [connector, identity])

  const head = entries[0] ?? null
  // An den bei DARSTELLUNG erfassten Owner und Eintrag gebunden.
  const dismiss = useCallback(() => {
    if (!head) return
    dispatch({ type: "dismiss", owner: { connector, identity }, id: head.id })
  }, [connector, identity, head])

  // Auf Auth-Wechsel reagieren, damit `identity` neu gelesen wird (ein
  // Token-Refresh derselben Identität ändert nichts und behält die Queue).
  const [, forceIdentityRead] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!isAuthenticatable(connector)) return
    return connector.getAuthState().subscribe(() => forceIdentityRead())
  }, [connector])

  // Subscribe to connector events
  useEffect(() => {
    if (!hasEventListener(connector)) return
    return connector.onIncomingEvent((event) => {
      const id = `${event.type}-${event.fromId}-${Date.now()}`
      const currentIdentity = isAuthenticatable(connector)
        ? identityOf(connector.getAuthState().current)
        : null
      dispatch({ type: "enqueue", owner: { connector, identity: currentIdentity }, notification: { id, event } })
    })
  }, [connector])

  const current = head

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
