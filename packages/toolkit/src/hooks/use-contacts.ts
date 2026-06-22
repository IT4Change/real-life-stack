import { useEffect, useReducer, useCallback, useMemo, startTransition } from "react"
import type { ContactInfo } from "@real-life-stack/data-interface"
import { hasContacts } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

const noop = () => Promise.resolve() as any
const EMPTY: ContactInfo[] = []

export function useContacts() {
  const connector = useConnector()
  const supportsContacts = hasContacts(connector)
  const observable = useMemo(
    () => (supportsContacts ? connector.observeContacts() : null),
    [connector, supportsContacts],
  )
  // Re-render trigger; values read fresh from the observable each render so the
  // `markLoaded` notification (which may carry an unchanged value) still updates
  // `isLoading`. `isLoading` reflects the real `loaded` flag, not "list empty".
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!observable) return
    rerender()
    return observable.subscribe(() => startTransition(rerender))
  }, [observable])

  const contacts = observable?.current ?? EMPTY
  const isLoading = observable?.loaded === false

  const activeContacts = useMemo(
    () => contacts.filter((c) => c.status === "active"),
    [contacts]
  )

  const pendingContacts = useMemo(
    () => contacts.filter((c) => c.status === "pending"),
    [contacts]
  )

  const addContact = useCallback(
    supportsContacts
      ? (id: string, name?: string) => connector.addContact(id, name)
      : noop,
    [connector, supportsContacts]
  )

  const activateContact = useCallback(
    supportsContacts
      ? (id: string) => connector.activateContact(id)
      : noop,
    [connector, supportsContacts]
  )

  const updateContactName = useCallback(
    supportsContacts
      ? (id: string, name: string) => connector.updateContactName(id, name)
      : noop,
    [connector, supportsContacts]
  )

  const removeContact = useCallback(
    supportsContacts
      ? (id: string) => connector.removeContact(id)
      : noop,
    [connector, supportsContacts]
  )

  return {
    contacts,
    isLoading,
    activeContacts,
    pendingContacts,
    addContact,
    activateContact,
    updateContactName,
    removeContact,
    supportsContacts,
  }
}
