import { deriveContext, type Item, type Relation } from "@real-life-stack/data-interface"

import rawGraph from "./graph.json" with { type: "json" }

export const DWEB_CAMP_SEED_CREATED_AT = "2026-07-16T00:00:00.000Z"
export const DWEB_CAMP_SEED_CREATOR = "seed:dwebcamp-2026"

export interface DwebCampSession {
  code: string
  title: string
  urls: string[]
}

export interface DwebCampProjectLinks {
  website: string | null
  repo: string | null
  confidence: "high" | "medium" | "low"
}

export interface DwebCampGraphData {
  sessions: DwebCampSession[]
  persons: string[]
  projects: string[]
  clusters: string[]
  speaks: [person: string, sessionCode: string][]
  features: [sessionCode: string, project: string][]
  in_cluster: [sessionCode: string, cluster: string][]
  works_on: [person: string, project: string, sessionCode: string][]
  links: Record<string, DwebCampProjectLinks>
  avatars: Record<string, string>
}

export const dwebCampGraph = rawGraph as unknown as DwebCampGraphData

type SeedItemType = "event" | "person" | "project"

export function slugSeedValue(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  if (!slug) {
    throw new Error(`Cannot derive a seed id from ${JSON.stringify(value)}`)
  }

  return slug
}

export function dwebCampItemId(type: SeedItemType, value: string): string {
  return `${type}-${slugSeedValue(value)}`
}

function indexIds(type: SeedItemType, values: readonly string[]): Map<string, string> {
  const ids = new Map<string, string>()
  const seenIds = new Set<string>()

  for (const value of values) {
    const id = dwebCampItemId(type, value)
    if (ids.has(value)) {
      throw new Error(`Duplicate ${type} source value: ${value}`)
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate ${type} seed id: ${id}`)
    }
    ids.set(value, id)
    seenIds.add(id)
  }

  return ids
}

function requireId(ids: ReadonlyMap<string, string>, value: string, kind: string): string {
  const id = ids.get(value)
  if (!id) {
    throw new Error(`Unknown ${kind}: ${value}`)
  }
  return id
}

function addRelation(
  relationsBySource: Map<string, Relation[]>,
  source: string,
  relation: Relation,
): void {
  const relations = relationsBySource.get(source)
  if (relations) {
    relations.push(relation)
  } else {
    relationsBySource.set(source, [relation])
  }
}

function baseItem(
  id: string,
  type: SeedItemType,
  data: Record<string, unknown>,
  relations?: Relation[],
  tags?: string[],
): Item {
  return {
    id,
    "@context": deriveContext(type, data),
    type,
    createdAt: DWEB_CAMP_SEED_CREATED_AT,
    createdBy: DWEB_CAMP_SEED_CREATOR,
    data,
    ...(relations?.length ? { relations } : {}),
    ...(tags?.length ? { tags } : {}),
  }
}

export function buildDwebCampSeedItems(graph: DwebCampGraphData = dwebCampGraph): Item[] {
  const eventIds = indexIds("event", graph.sessions.map(({ code }) => code))
  const personIds = indexIds("person", graph.persons)
  const projectIds = indexIds("project", graph.projects)
  const clusterIds = new Set(graph.clusters)

  const relationsBySource = new Map<string, Relation[]>()
  const tagsByEvent = new Map<string, string[]>()

  for (const [person, sessionCode] of graph.speaks) {
    const personId = requireId(personIds, person, "person")
    const eventId = requireId(eventIds, sessionCode, "session")
    addRelation(relationsBySource, personId, {
      predicate: "attends",
      target: `item:${eventId}`,
      meta: { tense: "has-been", role: "speaker" },
    })
  }

  for (const [sessionCode, project] of graph.features) {
    const eventId = requireId(eventIds, sessionCode, "session")
    const projectId = requireId(projectIds, project, "project")
    addRelation(relationsBySource, eventId, {
      predicate: "connectedWith",
      target: `item:${projectId}`,
    })
  }

  for (const [person, project, sessionCode] of graph.works_on) {
    const personId = requireId(personIds, person, "person")
    const projectId = requireId(projectIds, project, "project")
    requireId(eventIds, sessionCode, "session")
    addRelation(relationsBySource, personId, {
      predicate: "partOf",
      target: `item:${projectId}`,
      meta: { context: sessionCode },
    })
  }

  for (const [sessionCode, cluster] of graph.in_cluster) {
    const eventId = requireId(eventIds, sessionCode, "session")
    if (!clusterIds.has(cluster)) {
      throw new Error(`Unknown cluster: ${cluster}`)
    }
    const tags = tagsByEvent.get(eventId)
    if (tags) {
      if (!tags.includes(cluster)) tags.push(cluster)
    } else {
      tagsByEvent.set(eventId, [cluster])
    }
  }

  const events = graph.sessions.map(({ code, title, urls }) => {
    const id = requireId(eventIds, code, "session")
    return baseItem(
      id,
      "event",
      { title, urls: [...urls] },
      relationsBySource.get(id),
      tagsByEvent.get(id),
    )
  })

  const persons = graph.persons.map((displayName) => {
    const id = requireId(personIds, displayName, "person")
    const avatarUrl = graph.avatars[displayName]
    return baseItem(
      id,
      "person",
      { displayName, ...(avatarUrl ? { avatarUrl } : {}) },
      relationsBySource.get(id),
    )
  })

  const projects = graph.projects.map((title) => {
    const id = requireId(projectIds, title, "project")
    const links = graph.links[title]
    if (!links) {
      throw new Error(`Missing project links: ${title}`)
    }
    return baseItem(id, "project", {
      title,
      ...(links.website ? { website: links.website } : {}),
      ...(links.repo ? { repo: links.repo } : {}),
    })
  })

  return [...events, ...persons, ...projects]
}

export const dwebCampSeedItems = buildDwebCampSeedItems()
