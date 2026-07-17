import {
  isEvent,
  isProfileItem,
  isProject,
  isResource,
  type Item,
} from "@real-life-stack/data-interface"

import { Avatar, AvatarFallback, AvatarImage } from "../primitives/avatar"
import { cn } from "../../lib/utils"
import { lensItems } from "./list-view"

export interface GridViewProps {
  items: readonly Item[]
  onItemClick?: (item: Item) => void
}

function titleFor(item: Item): string {
  const title = item.data.title
  if (typeof title === "string" && title.trim().length > 0) return title
  const displayName = item.data.displayName
  if (typeof displayName === "string" && displayName.trim().length > 0) return displayName
  return item.id
}

function ProfileCard({ item }: { item: Item }) {
  if (!isProfileItem(item)) return null
  const initials = item.data.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)
  return (
    <>
      <Avatar className="size-12">
        <AvatarImage src={item.data.avatarUrl} alt="" />
        <AvatarFallback>{initials || "?"}</AvatarFallback>
      </Avatar>
      <p className="font-semibold">{item.data.displayName}</p>
      <p className="text-sm text-muted-foreground">Person</p>
    </>
  )
}

function ProjectCard({ item }: { item: Item }) {
  if (!isProject(item)) return null
  return (
    <>
      <p className="font-semibold">{item.data.title}</p>
      <p className="text-sm text-muted-foreground">Projekt</p>
      {item.data.website && <p className="truncate text-xs text-muted-foreground">Website: {item.data.website}</p>}
      {item.data.repo && <p className="truncate text-xs text-muted-foreground">Repo: {item.data.repo}</p>}
    </>
  )
}

function ResourceCard({ item }: { item: Item }) {
  if (!isResource(item)) return null
  return (
    <>
      <p className="font-semibold">{item.data.title}</p>
      <p className="text-sm text-muted-foreground">{item.data.kind || "Ressource"}</p>
      {item.data.availability && <p className="text-xs text-muted-foreground">{item.data.availability}</p>}
    </>
  )
}

function EventCard({ item }: { item: Item }) {
  if (!isEvent(item)) return null
  return (
    <>
      <p className="font-semibold">{item.data.title}</p>
      <p className="text-sm text-muted-foreground">Event</p>
      <p className="text-xs text-muted-foreground">Start: {item.data.start || "ohne Zeit"}</p>
    </>
  )
}

function GridCardContent({ item }: { item: Item }) {
  if (isProfileItem(item)) return <ProfileCard item={item} />
  if (isProject(item)) return <ProjectCard item={item} />
  if (isResource(item)) return <ResourceCard item={item} />
  if (isEvent(item)) return <EventCard item={item} />

  return (
    <>
      <p className="font-semibold">{titleFor(item)}</p>
      <p className="text-sm text-muted-foreground">{item.type}</p>
    </>
  )
}

/** A read-only grid whose cards expose the useful fields of known item types. */
export function GridView({ items, onItemClick }: GridViewProps) {
  const visibleItems = lensItems(items)

  if (visibleItems.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Einträge vorhanden.</p>
  }

  return (
    <section aria-label="Rasteransicht" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {visibleItems.map((item) => {
        const interactive = Boolean(onItemClick)
        return (
          <article
            key={item.id}
            className={cn(
              "flex min-h-36 flex-col gap-2 rounded-xl border bg-card p-4",
              interactive && "cursor-pointer hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={interactive ? () => onItemClick?.(item) : undefined}
            onKeyDown={interactive ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onItemClick?.(item)
              }
            } : undefined}
          >
            <GridCardContent item={item} />
          </article>
        )
      })}
    </section>
  )
}
