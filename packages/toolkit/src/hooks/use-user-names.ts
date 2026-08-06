import { useCallback, useEffect, useMemo, useReducer, useState } from "react"
import type { User } from "@real-life-stack/data-interface"
import { hasGroups, isAuthenticatable } from "@real-life-stack/data-interface"
import { useOptionalConnector } from "./connector-context"

/**
 * Resolves user ids to display names — defensively.
 *
 * Widely used surfaces (reaction pills, small hints) want to NAME a user id
 * without taking on a hard dependency: `useMembers` throws on connectors
 * without groups, and `ItemPreview` and friends must keep rendering without
 * any provider at all (tests, SSR). So every source here is capability-gated
 * and the resolver degrades to the raw id.
 *
 * Sources are the member union (`observeMembers(null)`) plus the signed-in
 * user — who is not a member of their own personal space and would otherwise
 * stay nameless. The current user resolves to "Du": in a list of reactors,
 * reading your own name is odd.
 */
export function useUserNameResolver(): (userId: string) => string {
  const connector = useOptionalConnector()
  const supportsGroups = connector !== null && hasGroups(connector)

  const membersObservable = useMemo(
    () => (connector && supportsGroups ? connector.observeMembers(null) : null),
    [connector, supportsGroups],
  )
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!membersObservable) return
    rerender()
    return membersObservable.subscribe(() => rerender())
  }, [membersObservable])

  const [currentUser, setCurrentUser] = useState<User | null>(null)
  useEffect(() => {
    if (!connector || !isAuthenticatable(connector)) return
    const observable = connector.observeCurrentUser()
    setCurrentUser(observable.current ?? null)
    return observable.subscribe((user) => setCurrentUser(user ?? null))
  }, [connector])

  const members = membersObservable?.current ?? []
  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of members) map.set(member.id, member.displayName ?? member.id)
    return map
    // `members` is a fresh array per emission; length+ids are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members.map((member) => `${member.id}:${member.displayName ?? ""}`).join("|")])

  return useCallback(
    (userId: string) => {
      if (currentUser && userId === currentUser.id) return "Du"
      return nameById.get(userId) ?? userId
    },
    [nameById, currentUser],
  )
}
