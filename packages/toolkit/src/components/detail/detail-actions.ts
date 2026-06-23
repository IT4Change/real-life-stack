import type { ItemPermissions } from "../../hooks/use-item-permissions"

/**
 * Which actions a detail header shows, given the user's permissions and which
 * handlers the caller wired. Pure (no component imports), so it unit-tests
 * cheaply. Edit is a prominent button — only when editable AND an `onEdit` is
 * provided. Delete lives in the ⋮ menu and is owned by `ItemDetailActions`
 * (shown when deletable). Share is offered whenever an `onShare` is provided.
 */
export function visibleDetailActions(
  perms: ItemPermissions,
  hasOnEdit: boolean,
  hasOnShare: boolean,
): { edit: boolean; delete: boolean; share: boolean } {
  return {
    edit: hasOnEdit && perms.canEdit,
    delete: perms.canDelete,
    share: hasOnShare,
  }
}
