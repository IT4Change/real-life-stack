import { useMemo } from "react"
import type { DataInterface, Item } from "@real-life-stack/data-interface"
import { SYSTEM_ITEM_TYPES, hasAuthorization, isWritable } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"
import { useCurrentUser } from "./use-auth"

export interface ItemPermissions {
  canEdit: boolean
  canDelete: boolean
}

const NONE: ItemPermissions = { canEdit: false, canDelete: false }

/**
 * Pure resolver behind {@link useItemPermissions} — exported so it can be unit
 * tested without React. Order: a non-writable connector grants nothing; a
 * connector with an authorization model is the source of truth (UCAN chain /
 * RLS flags); otherwise the default below.
 *
 * **Default: space members may edit each other's content.** Creator-owns was
 * never the technical model — every member holds the space key in WoT, and
 * the Supabase policy `edit item` has always allowed it. The UI merely hid
 * the button, promising a protection that did not exist while withholding an
 * edit that was already permitted.
 *
 * The exception are the three SYSTEM types, which carry a visible statement
 * BY someone: editing a foreign comment puts words in their mouth, editing a
 * reaction or a vote (a relation record) casts a ballot for them. Supabase
 * carves out `relation` for exactly that reason; comment and reaction follow
 * the same logic.
 */
export function resolveItemPermissions(
  connector: DataInterface,
  item: Item | null | undefined,
  currentUserId: string | undefined,
): ItemPermissions {
  if (!item || !isWritable(connector)) return NONE
  if (hasAuthorization(connector)) {
    return {
      canEdit: connector.can("item/edit", item),
      canDelete: connector.can("item/delete", item),
    }
  }
  if (!currentUserId) return NONE
  const mine = item.createdBy === currentUserId
  const speaksForSomeone = (SYSTEM_ITEM_TYPES as readonly string[]).includes(item.type)
  const allowed = mine || !speaksForSomeone
  return { canEdit: allowed, canDelete: allowed }
}

/**
 * Pure resolver behind {@link useCanCreate}. A non-writable connector can't
 * create; a connector with an authorization model decides; otherwise any
 * writable connector may create (space membership is enforced backend-side).
 */
export function resolveCanCreate(
  connector: DataInterface,
  spaceId: string | null | undefined,
  type: string | undefined,
): boolean {
  if (!isWritable(connector)) return false
  if (hasAuthorization(connector)) {
    // The authorization model is the source of truth. Without a space context
    // (loading / no-access / overview) we cannot ask it — fail closed rather
    // than optimistically allow.
    if (!spaceId) return false
    return connector.can("item/create", { space: spaceId, ...(type ? { type } : {}) })
  }
  return true
}

/**
 * Whether the current user may edit / delete a given item — drives the detail
 * action menu (⋮). UI affordance only; the backend/protocol enforces. See
 * `AuthorizationCapable` in data-interface and the concept doc
 * `docs/concepts/item-edit-delete-2026-06.md`.
 */
export function useItemPermissions(item: Item | null | undefined): ItemPermissions {
  const connector = useConnector()
  const { data: currentUser } = useCurrentUser()
  return useMemo(
    () => resolveItemPermissions(connector, item, currentUser?.id),
    [connector, item, currentUser?.id],
  )
}

/** Whether the current user may create an item in a space (optionally typed). */
export function useCanCreate(spaceId: string | null | undefined, type?: string): boolean {
  const connector = useConnector()
  return useMemo(() => resolveCanCreate(connector, spaceId, type), [connector, spaceId, type])
}
