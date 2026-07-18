import { useCallback, useMemo } from "react"
import {
  CollectionView as ToolkitCollectionView,
  CreateFab,
  ItemMetaRow,
  ItemPreview,
  ItemTypeBadge,
  ReactionBar,
  useCurrentUser,
  useItemGroupColorResolver,
  useItems,
  useMembers,
  useModulePanel,
  type SelectionFocusVisibleArea,
} from "@real-life-stack/toolkit"
import type { User } from "@real-life-stack/data-interface"
import { useItemFocus } from "../hooks/use-item-focus"
import { useItemDetailEdit } from "../hooks/use-item-detail-edit"
import { useCreate, useRegisterCreate, type CreateConfig } from "../create-host"
import { useRegisterDetail, type DetailConfig } from "../detail-host"

/** Thin app boundary: collection data, URL focus, and the shared detail host. */
export function CollectionView({
  groupId,
  selectionFocusVisibleArea,
}: {
  groupId: string
  selectionFocusVisibleArea?: SelectionFocusVisibleArea
}) {
  const { data: items } = useItems()
  const { data: members } = useMembers(groupId === "__overview__" ? null : groupId)
  const { data: currentUser } = useCurrentUser()
  const { itemId: focusedId, focusItem } = useItemFocus()
  const modulePanel = useModulePanel()
  const resolveGroupColor = useItemGroupColorResolver(groupId === "__overview__" ? undefined : groupId)
  const editConfig = useItemDetailEdit(members)

  const detailConfig = useMemo<DetailConfig>(() => ({
    renderRead: (item, actions) => <ItemPreview
      item={item}
      author={members.find((member) => member.id === item.createdBy) ?? (currentUser?.id === item.createdBy ? currentUser : undefined) as User | undefined}
      headerAdornment={<ItemTypeBadge type={item.type} />}
      metaAdornment={<ItemMetaRow item={item} />}
      footerAdornment={item.type !== "task" ? <ReactionBar itemId={item.id} /> : undefined}
      actions={actions}
      activeGlowColor={resolveGroupColor(item)}
    />,
    ...editConfig,
    renderCommentReactions: (id) => <ReactionBar itemId={id} />,
    onShare: () => void navigator.clipboard?.writeText(window.location.href),
  }), [currentUser, editConfig, members, resolveGroupColor])
  useRegisterDetail("collection", detailConfig)

  // The collection shows every item, so create offers the full type registry
  // (the edit half already computes it) — the composer's type picker chooses.
  const { startCreate } = useCreate()
  const createConfig = useMemo<CreateConfig>(
    () => ({
      contentTypes: editConfig.contentTypes,
      mapper: editConfig.mapper,
      composerProps: editConfig.composerProps,
      shell: "sheet",
    }),
    [editConfig],
  )
  useRegisterCreate("collection", createConfig)
  const handleCreateItem = useCallback(() => startCreate(), [startCreate])

  return <>
    <ToolkitCollectionView
      className="h-full"
      items={items}
      activeItemId={modulePanel.current?.itemId ?? focusedId}
      selectionFocusVisibleArea={selectionFocusVisibleArea}
      onItemClick={(item) => focusItem(item.id)}
    />
    <CreateFab onClick={handleCreateItem} label="Eintrag erstellen" />
  </>
}
