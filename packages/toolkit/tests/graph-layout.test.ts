import { describe, expect, it } from "vitest"

import {
  approachOpacity,
  createLayoutNodes,
  fitCamera,
  focusCamera,
  interpolateCamera,
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

  it("focuses a node in the visible area above a bottom inset", () => {
    const node = { x: 40, y: 80 }
    const viewportHeight = 800
    const bottomInset = 440
    const camera = focusCamera(node, { x: 0, y: 0, zoom: 0.4 }, viewportHeight, bottomInset)
    const screenY = (node.y - camera.y) * camera.zoom + viewportHeight / 2

    expect(camera.zoom).toBe(0.9)
    expect(camera.x).toBe(node.x)
    expect(screenY).toBeCloseTo((viewportHeight - bottomInset) / 2)
  })

  it("preserves a closer zoom and clamps the inset to the viewport", () => {
    const node = { x: 20, y: 30 }
    const camera = focusCamera(node, { x: 0, y: 0, zoom: 1.4 }, 600, 900)
    const screenY = (node.y - camera.y) * camera.zoom + 300

    expect(camera.zoom).toBe(1.4)
    expect(screenY).toBeCloseTo(0)
  })

  it("interpolates camera focus without jumping to the destination", () => {
    const from = { x: 0, y: 20, zoom: 0.4 }
    const to = { x: 100, y: 220, zoom: 0.9 }

    expect(interpolateCamera(from, to, 0)).toEqual(from)
    expect(interpolateCamera(from, to, 0.25)).toEqual({ x: 15.625, y: 51.25, zoom: 0.478125 })
    expect(interpolateCamera(from, to, 1)).toEqual(to)
  })

  it("softly approaches focus opacity in both directions", () => {
    const dimmed = approachOpacity(1, 0.18, 16)
    const restored = approachOpacity(0.18, 1, 16)

    expect(dimmed).toBeGreaterThan(0.18)
    expect(dimmed).toBeLessThan(1)
    expect(restored).toBeGreaterThan(0.18)
    expect(restored).toBeLessThan(1)
  })
})
