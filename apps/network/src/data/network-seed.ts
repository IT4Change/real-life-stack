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

type SeedItemType = "event" | "person" | "project" | "place" | "resource" | "task"

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

interface DwebCampScheduleSession {
  code: string
  start: string
  end: string
  venue: string
}

interface DwebCampVenue {
  name: string
  position: {
    type: "Point"
    coordinates: [number, number]
  }
}

interface DwebCampSchedule {
  sessions: DwebCampScheduleSession[]
  venues: DwebCampVenue[]
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

function indexScheduleSessions(schedule: DwebCampSchedule): Map<string, DwebCampScheduleSession> {
  const sessions = new Map<string, DwebCampScheduleSession>()

  for (const session of schedule.sessions) {
    if (sessions.has(session.code)) {
      throw new Error(`Duplicate schedule session: ${session.code}`)
    }
    sessions.set(session.code, session)
  }

  return sessions
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

export function buildDwebCampDomainItems(
  graph: DwebCampGraphData = dwebCampGraph,
  schedule: DwebCampSchedule = dwebCampSchedule,
): Item[] {
  const eventIds = indexIds("event", graph.sessions.map(({ code }) => code))
  const personIds = indexIds("person", graph.persons)
  const projectIds = indexIds("project", graph.projects)
  const clusterIds = new Set(graph.clusters)
  const scheduleSessions = indexScheduleSessions(schedule)

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
    const session = scheduleSessions.get(code)
    if (!session) throw new Error(`Missing schedule session: ${code}`)
    return baseItem(
      id,
      "event",
      { title, urls: [...urls], start: session.start, end: session.end },
      tagsByEvent.get(id),
    )
  })

  for (const code of scheduleSessions.keys()) {
    if (!eventIds.has(code)) throw new Error(`Schedule session has no graph event: ${code}`)
  }

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

export function buildDwebCampPlaceItems(
  schedule: DwebCampSchedule = dwebCampSchedule,
): Item[] {
  const placeIds = indexIds("place", schedule.venues.map(({ name }) => name))

  return schedule.venues.map(({ name, position }) => (
    baseItem(requireId(placeIds, name, "venue"), "place", {
      title: name,
      locationName: name,
      position,
    })
  ))
}

interface SeedRelation {
  predicate: NetworkRelationPredicate
  from: string
  to: string
  fields?: Record<string, unknown>
}

function buildDwebCampSeedRelations(
  graph: DwebCampGraphData,
  schedule: DwebCampSchedule,
): SeedRelation[] {
  const eventIds = indexIds("event", graph.sessions.map(({ code }) => code))
  const personIds = indexIds("person", graph.persons)
  const projectIds = indexIds("project", graph.projects)
  const placeIds = indexIds("place", schedule.venues.map(({ name }) => name))
  const scheduleSessions = indexScheduleSessions(schedule)

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

  const takesPlaceAt = schedule.sessions.map(({ code, venue }): SeedRelation => ({
    predicate: "takesPlaceAt",
    from: `item:${requireId(eventIds, code, "session")}`,
    to: `item:${requireId(placeIds, venue, "venue")}`,
  }))

  for (const code of scheduleSessions.keys()) {
    if (!eventIds.has(code)) throw new Error(`Schedule session has no graph event: ${code}`)
  }

  return [...attends, ...connectedWith, ...partOf, ...takesPlaceAt]
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
  const domainItems = buildDwebCampDomainItems(graph, dwebCampSchedule)
  const placeItems = buildDwebCampPlaceItems(dwebCampSchedule)
  const resourceItems = buildDwebCampResourceItems()
  const taskItems = buildDwebCampTaskItems()
  const relationItems = await Promise.all(
    buildDwebCampSeedRelations(graph, dwebCampSchedule).map(buildRelationItem),
  )
  return [...domainItems, ...placeItems, ...resourceItems, ...taskItems, ...relationItems]
}

export const dwebCampDomainItems = buildDwebCampDomainItems()
