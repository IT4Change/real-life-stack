"use client"

import { createElement, type ReactNode } from "react"
import { isProfileItem, isProject, isResource, type Item } from "@real-life-stack/data-interface"
import { BadgeCheck, Globe, Wrench } from "lucide-react"

import { cn } from "../../lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "../primitives/avatar"
import { ItemTypeBadge } from "./item-type-badge"
import { resolveTypePresentation } from "./type-presentation"

/**
 * Type-specific preview adornments for items whose useful metadata is not
 * part of ItemPreview's generic title/description body. They are deliberately
 * small and presentational so list, grid, board, and feed callers can share
 * them without recreating card markup.
 */
export interface ItemTypeMetaProps {
  item: Item
  className?: string
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!)
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?"
}

/** Avatar and display name for a canonical `person` item. */
export function ItemProfileMeta({ item, className }: ItemTypeMetaProps) {
  if (!isProfileItem(item)) return null

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={item.data.avatarUrl} alt={item.data.displayName} />
        <AvatarFallback className="bg-primary/10 text-xs text-primary">
          {initials(item.data.displayName)}
        </AvatarFallback>
      </Avatar>
      <span className="font-medium text-foreground">{item.data.displayName}</span>
    </div>
  )
}

/** Website and repository hints for a canonical `project` item. */
export function ItemProjectMeta({ item, className }: ItemTypeMetaProps) {
  if (!isProject(item) || (!item.data.website && !item.data.repo)) return null

  return (
    <div className={cn("space-y-1", className)}>
      {item.data.website && (
        <span className="flex items-center gap-1 truncate">
          <Globe className="size-3 shrink-0" />
          Website: {item.data.website}
        </span>
      )}
      {item.data.repo && (
        <span className="flex items-center gap-1 truncate">
          <Globe className="size-3 shrink-0" />
          Repo: {item.data.repo}
        </span>
      )}
    </div>
  )
}

/** Kind and availability hints for a canonical `resource` item. */
export function ItemResourceMeta({ item, className }: ItemTypeMetaProps) {
  if (!isResource(item) || (!item.data.kind && !item.data.availability)) return null

  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-1", className)}>
      {item.data.kind && (
        <span className="inline-flex items-center gap-1">
          <Wrench className="size-3" />
          {item.data.kind}
        </span>
      )}
      {item.data.availability && (
        <span className="inline-flex items-center gap-1">
          <BadgeCheck className="size-3" />
          {item.data.availability}
        </span>
      )}
    </div>
  )
}

export interface ItemPreviewAdornments {
  headerAdornment?: ReactNode
  metaAdornment?: ReactNode
}

/**
 * Resolve the type-aware slots for the generic ItemPreview surface.
 *
 * Since the type register (spec 06) this is a thin lookup: the per-type
 * preview slot comes from the Darstellungs-Register, and an unregistered
 * type keeps its visible cue through the neutral fallback badge. The
 * function stays exported because list/grid lenses and the detail host all
 * consume it — ONE resolution path for every surface.
 */
export function getItemPreviewAdornments(item: Item): ItemPreviewAdornments {
  const resolved = resolveTypePresentation(item.type)
  if (resolved.preview) {
    return { metaAdornment: createElement(resolved.preview, { item }) }
  }
  if (resolved.generic) {
    return { headerAdornment: <ItemTypeBadge type={item.type} fallback /> }
  }
  return {}
}
