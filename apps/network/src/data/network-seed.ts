import {
  canonicalizeRelationEndpoints,
  deriveContext,
  deriveRelationRecordId,
  type Item,
} from "@real-life-stack/data-interface"

import rawGraph from "./graph.json" with { type: "json" }
import campSchedule from "./camp-schedule.json" with { type: "json" }
import {
  NETWORK_RELATION_STORE_OPTIONS,
  type NetworkRelationPredicate,
} from "./network-relation-predicates"

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

type SeedItemType = "event" | "person" | "project" | "resource" | "task"

interface DwebCampResource {
  title: string
  kind: string
  availability: string
  venue: string | null
}

interface DwebCampTask {
  title: string
  status: string
}

interface DwebCampSchedule {
  resources: DwebCampResource[]
  tasks: DwebCampTask[]
}

const dwebCampSchedule = campSchedule as DwebCampSchedule

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

function baseItem(
  id: string,
  type: SeedItemType,
  data: Record<string, unknown>,
  tags?: string[],
): Item {
  return {
    id,
    "@context": deriveContext(type, data),
    type,
    createdAt: DWEB_CAMP_SEED_CREATED_AT,
    createdBy: DWEB_CAMP_SEED_CREATOR,
    data,
    ...(tags?.length ? { tags } : {}),
  }
}

export function buildDwebCampDomainItems(graph: DwebCampGraphData = dwebCampGraph): Item[] {
  const eventIds = indexIds("event", graph.sessions.map(({ code }) => code))
  const personIds = indexIds("person", graph.persons)
  const projectIds = indexIds("project", graph.projects)
  const clusterIds = new Set(graph.clusters)

  const tagsByEvent = new Map<string, string[]>()

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

export function buildDwebCampResourceItems(
  schedule: DwebCampSchedule = dwebCampSchedule,
): Item[] {
  const resourceIds = indexIds("resource", schedule.resources.map(({ title }) => title))

  return schedule.resources.map(({ title, kind, availability }) => (
    baseItem(requireId(resourceIds, title, "resource"), "resource", {
      title,
      kind,
      availability,
    })
  ))
}

export function buildDwebCampTaskItems(
  schedule: DwebCampSchedule = dwebCampSchedule,
): Item[] {
  const taskIds = indexIds("task", schedule.tasks.map(({ title }) => title))

  return schedule.tasks.map(({ title, status }) => (
    baseItem(requireId(taskIds, title, "task"), "task", { title, status })
  ))
}

interface SeedRelation {
  predicate: NetworkRelationPredicate
  from: string
  to: string
  fields?: Record<string, unknown>
}

function buildDwebCampSeedRelations(graph: DwebCampGraphData): SeedRelation[] {
  const eventIds = indexIds("event", graph.sessions.map(({ code }) => code))
  const personIds = indexIds("person", graph.persons)
  const projectIds = indexIds("project", graph.projects)

  const attends = graph.speaks.map(([person, sessionCode]): SeedRelation => ({
    predicate: "attends",
    from: `item:${requireId(personIds, person, "person")}`,
    to: `item:${requireId(eventIds, sessionCode, "session")}`,
    fields: { tense: "has-been", role: "speaker" },
  }))

  const connectedWith = graph.features.map(([sessionCode, project]): SeedRelation => ({
    predicate: "connectedWith",
    from: `item:${requireId(eventIds, sessionCode, "session")}`,
    to: `item:${requireId(projectIds, project, "project")}`,
  }))

  const partOfByPair = new Map<string, {
    from: string
    to: string
    contexts: Set<string>
  }>()
  for (const [person, project, sessionCode] of graph.works_on) {
    requireId(eventIds, sessionCode, "session")
    const from = `item:${requireId(personIds, person, "person")}`
    const to = `item:${requireId(projectIds, project, "project")}`
    const key = JSON.stringify([from, to])
    const existing = partOfByPair.get(key)
    if (existing) {
      existing.contexts.add(sessionCode)
    } else {
      partOfByPair.set(key, { from, to, contexts: new Set([sessionCode]) })
    }
  }
  const partOf = [...partOfByPair.values()].map(({ from, to, contexts }): SeedRelation => ({
    predicate: "partOf",
    from,
    to,
    fields: { contexts: [...contexts].sort() },
  }))

  return [...attends, ...connectedWith, ...partOf]
}

async function buildRelationItem(relation: SeedRelation): Promise<Item> {
  const { from, to } = canonicalizeRelationEndpoints(
    relation.predicate,
    relation.from,
    relation.to,
    NETWORK_RELATION_STORE_OPTIONS,
  )
  const data = {
    predicate: relation.predicate,
    ...relation.fields,
  }

  return {
    id: await deriveRelationRecordId(
      DWEB_CAMP_SEED_CREATOR,
      relation.predicate,
      from,
      to,
      NETWORK_RELATION_STORE_OPTIONS,
    ),
    "@context": deriveContext("relation", data),
    type: "relation",
    createdAt: DWEB_CAMP_SEED_CREATED_AT,
    createdBy: DWEB_CAMP_SEED_CREATOR,
    data,
    relations: [
      { predicate: "from", target: from },
      { predicate: "to", target: to },
    ],
  }
}

export async function buildDwebCampSeedItems(
  graph: DwebCampGraphData = dwebCampGraph,
): Promise<Item[]> {
  const domainItems = buildDwebCampDomainItems(graph)
  const resourceItems = buildDwebCampResourceItems()
  const taskItems = buildDwebCampTaskItems()
  const relationItems = await Promise.all(buildDwebCampSeedRelations(graph).map(buildRelationItem))
  return [...domainItems, ...resourceItems, ...taskItems, ...relationItems]
}

export const dwebCampDomainItems = buildDwebCampDomainItems()
