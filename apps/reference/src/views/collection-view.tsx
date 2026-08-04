import { useCallback, useMemo } from "react"
import {
  CollectionView as ToolkitCollectionView,
  CreateFab,
  ReactionBar,
  useCurrentUser,
  useGroups,
  useItemGroupColorResolver,
  useItems,
  useMembers,
  useModulePanel,
  usePersonalGroupId,
  type SelectionFocusVisibleArea,
} from "@real-life-stack/toolkit"
import { useItemFocus } from "../hooks/use-item-focus"
import { useItemDetailEdit } from "../hooks/use-item-detail-edit"
import { ALL_CONTENT_TYPES } from "../content-types"
import { withGroupOptions } from "../composer-mapping"
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
    ...editConfig,
    renderCommentReactions: (id) => <ReactionBar itemId={id} />,
    onShare: () => void navigator.clipboard?.writeText(window.location.href),
  }), [currentUser, editConfig, members, resolveGroupColor])
  useRegisterDetail("collection", detailConfig)

  // The collection shows every item, so create offers the full type registry —
  // the composer's type picker chooses. Unlike the edit half (which pre-fills
  // the group from the item), create must default the group widget to the
  // CURRENT space; the overview falls back to the personal space.
  const { startCreate } = useCreate()
  const { data: groups } = useGroups()
  const personalGroupId = usePersonalGroupId()
  const createTypes = useMemo(
    () => withGroupOptions(ALL_CONTENT_TYPES, groups, groupId === "__overview__" ? undefined : groupId, personalGroupId),
    [groups, groupId, personalGroupId],
  )
  const createConfig = useMemo<CreateConfig>(
    () => ({
      contentTypes: createTypes,
      mapper: editConfig.mapper,
      composerProps: editConfig.composerProps,
      shell: "sheet",
    }),
    [createTypes, editConfig],
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
