import { describe, expect, it } from "vitest"

import {
  createLayoutNodes,
  fitCamera,
  stepForceLayout,
  trimEdge,
} from "../src/components/graph/force-layout"
import type { GraphEdge, GraphNode } from "../src/components/graph/types"

const nodes: GraphNode[] = [
  { id: "person-ada", label: "Ada", type: "person" },
  { id: "project-open", label: "Open Project", type: "project" },
  { id: "event-session", label: "Session", type: "event" },
]

const edges: GraphEdge[] = [
  { id: "edge-1", sourceId: "person-ada", targetId: "project-open", predicate: "partOf" },
  { id: "edge-2", sourceId: "person-ada", targetId: "event-session", predicate: "attends" },
]

describe("graph force layout", () => {
  it("creates deterministic positions without mutating the input nodes", () => {
    const original = structuredClone(nodes)
    const first = createLayoutNodes(nodes, edges)
    const second = createLayoutNodes(nodes, edges)

    expect(first).toEqual(second)
    expect(nodes).toEqual(original)
    expect(first.find((node) => node.id === "person-ada")?.degree).toBe(2)
  })

  it("advances and cools a finite layout", () => {
    const layout = createLayoutNodes(nodes, edges)
    const nextAlpha = stepForceLayout(layout, edges, 1)

    expect(nextAlpha).toBeLessThan(1)
    for (const node of layout) {
      expect(Number.isFinite(node.x)).toBe(true)
      expect(Number.isFinite(node.y)).toBe(true)
    }
  })

  it("runs the complete reference cooling cycle without non-finite positions", () => {
    const layout = createLayoutNodes(nodes, edges)
    let alpha = 1
    let steps = 0

    while (alpha > 0.004 && steps < 700) {
      alpha = stepForceLayout(layout, edges, alpha)
      steps += 1
    }

    expect(steps).toBeGreaterThan(500)
    expect(steps).toBeLessThan(700)
    expect(alpha).toBeLessThanOrEqual(0.004)
    expect(layout.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true)
  })

  it("fits all nodes and trims edges outside node boundaries", () => {
    const layout = createLayoutNodes(nodes, edges)
    const camera = fitCamera(layout, 1000, 600)
    const trimmed = trimEdge(layout[0], layout[1], camera.zoom)

    expect(camera.zoom).toBeGreaterThanOrEqual(0.08)
    expect(camera.zoom).toBeLessThanOrEqual(1.6)
    expect(trimmed).not.toBeNull()
    expect(trimmed!.x1).not.toBe(layout[0].x)
    expect(trimmed!.x2).not.toBe(layout[1].x)
  })

  it("returns a stable default camera for an empty graph", () => {
    expect(fitCamera([], 1000, 600)).toEqual({ x: 0, y: 0, zoom: 1 })
  })
})
