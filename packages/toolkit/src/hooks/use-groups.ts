import { useCallback, useEffect, useMemo, useReducer, useState, startTransition } from "react"
import type { Group, User } from "@real-life-stack/data-interface"
import { hasGroups } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

function useGroupConnector() {
  const connector = useConnector()
  if (!hasGroups(connector)) {
    throw new Error("Connector does not support groups")
  }
  return connector
}

export function useGroups() {
  const connector = useGroupConnector()
  const observable = useMemo(() => connector.observeGroups(), [connector])
  // Read fresh each render (no stale snapshot across observable change); the
  // subscription only triggers re-renders. `isLoading` reflects the real
  // `loaded` flag, so "loaded, zero groups" is distinguishable from "still
  // loading" (e.g. the no-access notice for a deep-linked space). Sources
  // without the flag (sync Mock/Local) count as loaded.
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    rerender()
    return observable.subscribe(() => startTransition(rerender))
  }, [observable])

  return { data: observable.current, isLoading: observable.loaded === false }
}

export function useCurrentGroup() {
  const connector = useGroupConnector()
  const observable = useMemo(() => connector.observeCurrentGroup(), [connector])
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    rerender()
    return observable.subscribe(() => startTransition(rerender))
  }, [observable])

  return observable.current
}

export function useCreateGroup() {
  const connector = useGroupConnector()
  return useCallback(
    async (name: string, data?: Record<string, unknown>) => {
      return connector.createGroup(name, data)
    },
    [connector],
  )
}

export function useUpdateGroup() {
  const connector = useGroupConnector()
  return useCallback(
    async (id: string, updates: Partial<Group>) => {
      return connector.updateGroup(id, updates)
    },
    [connector],
  )
}

export function useDeleteGroup() {
  const connector = useGroupConnector()
  return useCallback(
    async (id: string) => {
      return connector.deleteGroup(id)
    },
    [connector],
  )
}

export function useMembers(groupId: string | null) {
  const connector = useGroupConnector()
  const observable = useMemo(() => connector.observeMembers(groupId), [connector, groupId])
  const [data, setData] = useState<User[]>(observable.current)
  const update = useCallback((members: User[]) => startTransition(() => setData(members)), [])

  useEffect(() => {
    setData(observable.current)
    return observable.subscribe(update)
  }, [observable, update])

  return { data, isLoading: data.length === 0 && observable.current.length === 0 }
}

export function useInviteMember() {
  const connector = useGroupConnector()
  return useCallback(
    async (groupId: string, userId: string) => {
      return connector.inviteMember(groupId, userId)
    },
    [connector],
  )
}

export function useRemoveMember() {
  const connector = useGroupConnector()
  return useCallback(
    async (groupId: string, userId: string) => {
      return connector.removeMember(groupId, userId)
    },
    [connector],
  )
}
