import type { Item } from "@real-life-stack/data-interface"

import rawDetailAvatarUrls from "./avatar-detail-urls.json" with { type: "json" }
import { resolveNetworkAvatarSources } from "../lib/avatar-sources"

const detailAvatarUrls = rawDetailAvatarUrls as Record<string, string>

// Graph thumbnails stay embedded; the detail view requests these sharp sources
// only after the user selects a known seed person.
export function dwebCampDetailAvatarUrl(item: Item): string | null {
  if (item.type !== "person" || item.createdBy !== "seed:dwebcamp-2026") return null

  const displayName = item.data.displayName
  if (typeof displayName !== "string") return null

  const source = detailAvatarUrls[displayName]
  if (!source) return null

  const detailUrl = resolveNetworkAvatarSources(source).detailUrl
  return detailUrl.startsWith("https://") ? detailUrl : null
}
