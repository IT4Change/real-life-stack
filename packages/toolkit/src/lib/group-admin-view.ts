import type { User } from "@real-life-stack/data-interface"

/**
 * Resolve which members are admins for the group dialog, backward-compatibly.
 *
 * `User.isAdmin` is an OPTIONAL annotation: connectors that know the space's
 * authoritative admin set (e.g. WotConnector, from `space.admins`/`createdBy`)
 * set it; others (Local/Mock/GraphQL) return members without it. Treating a
 * missing annotation as `false` would wrongly strip the badge and admin controls
 * from those connectors. So:
 *
 *  - If ANY member carries an explicit `isAdmin` annotation, it is authoritative.
 *  - If NO member is annotated (`isAdmin === undefined` for all), fall back to the
 *    historical positional behavior where `members[0]` is treated as the admin.
 */
export function resolveAdminView(
  members: User[],
  currentUserId?: string,
): { annotated: boolean; isAdmin: (member: User) => boolean; currentUserIsAdmin: boolean } {
  const annotated = members.some((m) => m.isAdmin !== undefined)
  const isAdmin = (member: User): boolean =>
    annotated ? member.isAdmin === true : members[0]?.id === member.id
  const currentUserIsAdmin =
    currentUserId !== undefined &&
    members.some((m) => m.id === currentUserId && isAdmin(m))
  return { annotated, isAdmin, currentUserIsAdmin }
}
