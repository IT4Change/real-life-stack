import { useCallback, useMemo, useState } from "react"
import {
  MapView as ToolkitMapView,
  useCurrentUser,
  useGroups,
  useIsCompact,
  useItem,
  useDraftItem,
  useItemGroupColorResolver,
  useItems,
  useMembers,
  useModulePanel,
  usePersonalGroupId,
  ReactionBar,
} from "@real-life-stack/toolkit"
import { isWritable } from "@real-life-stack/data-interface"
import { MapLibreMapAdapter } from "@real-life-stack/toolkit/maplibre"
import { useCreate, useRegisterCreate, type CreateConfig } from "../create-host"
import { mapComposerSubmission, withGroupOptions } from "../composer-mapping"
import { MAP_CREATE_TYPES } from "../content-types"
import { useConnector } from "@real-life-stack/toolkit"
import { useItemFocus } from "../hooks/use-item-focus"
import { useRegisterDetail, type DetailConfig } from "../detail-host"
import { useItemDetailEdit } from "../hooks/use-item-detail-edit"

const AWAITING_VIEWPORT_FILTER = { hasField: ["__rls_awaiting_viewport__"] }

/** App boundary only: bbox data, URL focus and the shell's composer/detail hosts. */
export function MapView({ groupId, active = true }: { groupId: string; active?: boolean }) {
  const [bbox, setBbox] = useStateBounds()
  const { data: items, isLoading } = useItems(bbox ? { hasField: ["position"], bbox } : AWAITING_VIEWPORT_FILTER)
  const { itemId: focusedId, focusItem } = useItemFocus()
  const { data: focusedItem } = useItem(active ? (focusedId ?? "") : "")
  const panel = useModulePanel()
  const compact = useIsCompact()
  const draftItem = useDraftItem()
  const connector = useConnector()
  const { data: members } = useMembers(groupId === "__overview__" ? null : groupId)
  const { data: currentUser } = useCurrentUser()
  const { data: groups } = useGroups()
  const personalGroupId = usePersonalGroupId()
  const resolveGroupColor = useItemGroupColorResolver(groupId === "__overview__" ? undefined : groupId)
  const editConfig = useItemDetailEdit(members)
  const { startCreate } = useCreate()
  const isOverview = groupId === "__overview__"
  const createConfig = useMemo<CreateConfig>(() => ({
    contentTypes: withGroupOptions(MAP_CREATE_TYPES, groups, isOverview ? undefined : groupId, personalGroupId),
    mapper: mapComposerSubmission, composerProps: editConfig.composerProps, shell: "sheet",
  }), [editConfig.composerProps, groupId, groups, isOverview, personalGroupId])
  useRegisterCreate("map", createConfig)
  const detailConfig = useMemo<DetailConfig>(() => ({
    groupId,
    ...editConfig, renderCommentReactions: (id) => <ReactionBar itemId={id} />, onShare: () => void navigator.clipboard?.writeText(window.location.href), backdrop: false,
  }), [currentUser, editConfig, groupId, isOverview, members])
  useRegisterDetail("map", detailConfig)
  const createAdapter = useCallback(() => new MapLibreMapAdapter(), [])
  const onCreate = useCallback(() => startCreate("place"), [startCreate])
  return <ToolkitMapView items={items} itemsLoading={isLoading} inventoryKey={groupId} focusedItem={focusedItem}
    createAdapter={createAdapter} initialView={{ center: [13.4, 52.5], zoom: 6 }} viewportMode="bbox-module"
    onViewportBoundsChange={setBbox} active={active} activeItemId={panel.current?.itemId} isCompact={compact}
    draftItem={draftItem}
    onItemClick={(item) => focusItem(item.id)} allowCreate={isWritable(connector)} onCreate={isWritable(connector) ? onCreate : undefined}
    clustering={{}} resolveGroupColor={resolveGroupColor} />
}

function useStateBounds(): [[number, number, number, number] | undefined, (bounds: [number, number, number, number]) => void] {
  const [bounds, setBounds] = useState<[number, number, number, number] | undefined>()
  return [bounds, setBounds]
}
