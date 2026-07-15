import type { GraphEdge, GraphNode } from "./types"

export interface LayoutNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  degree: number
}

export interface GraphCamera {
  x: number
  y: number
  zoom: number
}

const RING_RADIUS: Record<string, number> = {
  project: 220,
  event: 520,
  person: 820,
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function unitFromHash(value: string, salt: string): number {
  return hashString(`${salt}:${value}`) / 0xffffffff
}

function radiusFor(type: string, degree: number): number {
  if (type === "project") return 7 + Math.min(9, degree)
  if (type === "person") return 8 + Math.min(8, degree * 1.5)
  if (type === "event") return 4.5
  return 6 + Math.min(6, degree)
}

export function createLayoutNodes(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  previous: ReadonlyMap<string, LayoutNode> = new Map(),
): LayoutNode[] {
  const degree = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (!degree.has(edge.sourceId)) degree.set(edge.sourceId, new Set())
    if (!degree.has(edge.targetId)) degree.set(edge.targetId, new Set())
    degree.get(edge.sourceId)!.add(edge.targetId)
    degree.get(edge.targetId)!.add(edge.sourceId)
  }

  return nodes.map((node) => {
    const nodeDegree = degree.get(node.id)?.size ?? 0
    const existing = previous.get(node.id)
    if (existing) {
      return {
        ...node,
        x: existing.x,
        y: existing.y,
        vx: existing.vx,
        vy: existing.vy,
        radius: radiusFor(node.type, nodeDegree),
        degree: nodeDegree,
      }
    }

    const ring = RING_RADIUS[node.type] ?? 680
    const angle = unitFromHash(node.id, "angle") * Math.PI * 2
    const distance = ring * (0.6 + unitFromHash(node.id, "distance") * 0.8)
    return {
      ...node,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      vx: 0,
      vy: 0,
      radius: radiusFor(node.type, nodeDegree),
      degree: nodeDegree,
    }
  })
}

export function stepForceLayout(
  nodes: LayoutNode[],
  edges: readonly GraphEdge[],
  alpha: number,
): number {
  const byId = new Map(nodes.map((node) => [node.id, node]))

  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = nodes[rightIndex]
      let dx = right.x - left.x
      let dy = right.y - left.y
      let distanceSquared = dx * dx + dy * dy
      if (distanceSquared > 250_000) continue
      if (distanceSquared < 1) {
        const angle = unitFromHash(`${left.id}:${right.id}`, "jitter") * Math.PI * 2
        dx = Math.cos(angle)
        dy = Math.sin(angle)
        distanceSquared = 1
      }
      const distance = Math.sqrt(distanceSquared)
      const force = 1800 / distanceSquared
      const forceX = (dx / distance) * force
      const forceY = (dy / distance) * force
      left.vx -= forceX
      left.vy -= forceY
      right.vx += forceX
      right.vy += forceY
    }
  }

  for (const edge of edges) {
    const source = byId.get(edge.sourceId)
    const target = byId.get(edge.targetId)
    if (!source || !target) continue
    const dx = target.x - source.x
    const dy = target.y - source.y
    const distance = Math.max(1, Math.hypot(dx, dy))
    const force = (distance - 120) * 0.006
    const forceX = (dx / distance) * force
    const forceY = (dy / distance) * force
    source.vx += forceX
    source.vy += forceY
    target.vx -= forceX
    target.vy -= forceY
  }

  for (const node of nodes) {
    node.vx += -node.x * 0.0009
    node.vy += -node.y * 0.0009
    node.vx *= 0.85
    node.vy *= 0.85
    node.x += node.vx * alpha * 2
    node.y += node.vy * alpha * 2
  }

  return Math.max(0, alpha * 0.996 - 0.0004)
}

export function displayRadius(node: Pick<LayoutNode, "radius" | "avatarUrl">, zoom: number): number {
  const scaled = node.radius * Math.max(0.7, Math.min(1.4, zoom + 0.35))
  if (!node.avatarUrl) return scaled
  return Math.max(scaled, 11 * Math.max(0.85, Math.min(3.6, zoom + 0.35)))
}

export function trimEdge(
  source: LayoutNode,
  target: LayoutNode,
  zoom: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const dx = target.x - source.x
  const dy = target.y - source.y
  const distance = Math.hypot(dx, dy)
  const sourceInset = (displayRadius(source, zoom) + 3) / zoom
  const targetInset = (displayRadius(target, zoom) + 3) / zoom
  if (distance <= sourceInset + targetInset + 2 / zoom) return null
  const unitX = dx / distance
  const unitY = dy / distance
  return {
    x1: source.x + unitX * sourceInset,
    y1: source.y + unitY * sourceInset,
    x2: target.x - unitX * targetInset,
    y2: target.y - unitY * targetInset,
  }
}

export function fitCamera(
  nodes: readonly Pick<LayoutNode, "x" | "y">[],
  width: number,
  height: number,
): GraphCamera {
  if (nodes.length === 0 || width <= 0 || height <= 0) return { x: 0, y: 0, zoom: 1 }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    maxX = Math.max(maxX, node.x)
    minY = Math.min(minY, node.y)
    maxY = Math.max(maxY, node.y)
  }
  const boundsWidth = Math.max(120, maxX - minX)
  const boundsHeight = Math.max(120, maxY - minY)
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    zoom: Math.max(0.08, Math.min(1.6, 0.82 * Math.min(width / boundsWidth, height / boundsHeight))),
  }
}
