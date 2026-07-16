"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"

import { cn } from "../../lib/utils"
import {
  approachOpacity,
  createLayoutNodes,
  displayRadius,
  fitCamera,
  focusCamera,
  interpolateCamera,
  stepForceLayout,
  trimEdge,
  type GraphCamera,
  type LayoutNode,
} from "./force-layout"
import {
  initialGesture,
  isSafeImageUrl,
  resumePanAfterPinch,
  selectionAnnouncement,
  shouldSelectOnPointerFinish,
  type PointerGesture,
} from "./graph-view-helpers"
import type { GraphEdge, GraphTypeDescriptor, GraphViewHandle, GraphViewProps } from "./types"

const DEFAULT_NODE_TYPES: readonly GraphTypeDescriptor[] = [
  { id: "person", label: "Person", color: "#2a78d6", darkColor: "#3987e5" },
  { id: "project", label: "Projekt", color: "#1baf7a", darkColor: "#199e70" },
  { id: "event", label: "Session", color: "#eda100", darkColor: "#c98500" },
]
const FOCUS_TRANSITION_MS = 280

interface Viewport {
  width: number
  height: number
  dpr: number
}

interface FocusTarget {
  nodeId: string
  bottomInset: number
  startedAt: number
  startCamera: GraphCamera
  settled: boolean
}

interface DrawOptions {
  advanceSimulation?: boolean
  advanceTransitions?: boolean
}

function truncateLabel(value: string): string {
  return value.length > 34 ? `${value.slice(0, 31)}...` : value
}

function worldToScreen(node: Pick<LayoutNode, "x" | "y">, camera: GraphCamera, viewport: Viewport) {
  return {
    x: (node.x - camera.x) * camera.zoom + viewport.width / 2,
    y: (node.y - camera.y) * camera.zoom + viewport.height / 2,
  }
}

function screenToWorld(x: number, y: number, camera: GraphCamera, viewport: Viewport) {
  return {
    x: (x - viewport.width / 2) / camera.zoom + camera.x,
    y: (y - viewport.height / 2) / camera.zoom + camera.y,
  }
}

export const GraphView = forwardRef<GraphViewHandle, GraphViewProps>(function GraphView(
  {
    nodes,
    edges,
    nodeTypes = DEFAULT_NODE_TYPES,
    selectedNodeId,
    onSelectedNodeChange,
    fitViewKey,
    className,
    ariaLabel = "Interaktiver Netzwerkgraph",
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const instructionsId = useId()
  const [announcement, setAnnouncement] = useState("")
  const layoutRef = useRef<LayoutNode[]>([])
  const edgeRef = useRef<readonly GraphEdge[]>([])
  const selectedRef = useRef<string | null>(selectedNodeId)
  const hoverRef = useRef<string | null>(null)
  const viewportRef = useRef<Viewport>({ width: 1, height: 1, dpr: 1 })
  const cameraRef = useRef<GraphCamera>({ x: 0, y: 0, zoom: 0.42 })
  const alphaRef = useRef(1)
  const frameRef = useRef<number | null>(null)
  const autoFitFrameRef = useRef(0)
  const autoFitPassRef = useRef(0)
  const fitOnSettleRef = useRef(false)
  const initializedRef = useRef(false)
  const imagesRef = useRef(new Map<string, HTMLImageElement | null>())
  const nodeOpacityRef = useRef(new Map<string, number>())
  const edgeOpacityRef = useRef(new Map<string, number>())
  const transitionFrameTimeRef = useRef<number | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const gestureRef = useRef<PointerGesture>(initialGesture())
  const focusTargetRef = useRef<FocusTarget | null>(null)
  const prefersReducedMotionRef = useRef(
    typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
  const drawRef = useRef<(options?: DrawOptions) => void>(() => undefined)

  const typeDescriptors = useMemo(
    () => new Map(nodeTypes.map((descriptor) => [descriptor.id, descriptor])),
    [nodeTypes],
  )

  const validEdges = useMemo(() => {
    const nodeIds = new Set(nodes.map((node) => node.id))
    return edges.filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
  }, [nodes, edges])

  const scheduleDraw = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      drawRef.current()
    })
  }, [])

  const fitView = useCallback(() => {
    focusTargetRef.current = null
    cameraRef.current = fitCamera(layoutRef.current, viewportRef.current.width, viewportRef.current.height)
    scheduleDraw()
  }, [scheduleDraw])

  const focusNode = useCallback((nodeId: string, options?: { bottomInset?: number }) => {
    const node = layoutRef.current.find((candidate) => candidate.id === nodeId)
    if (!node) return
    autoFitFrameRef.current = 0
    fitOnSettleRef.current = false
    focusTargetRef.current = {
      nodeId,
      bottomInset: options?.bottomInset ?? 0,
      startedAt: performance.now(),
      startCamera: { ...cameraRef.current },
      settled: false,
    }
    scheduleDraw()
  }, [scheduleDraw])

  useImperativeHandle(ref, () => ({ fitView, focusNode }), [fitView, focusNode])

  useEffect(() => {
    selectedRef.current = selectedNodeId
    if (!selectedNodeId || focusTargetRef.current?.nodeId !== selectedNodeId) {
      focusTargetRef.current = null
    }
    scheduleDraw()
  }, [selectedNodeId, scheduleDraw])

  useEffect(() => {
    const previous = new Map(layoutRef.current.map((node) => [node.id, node]))
    layoutRef.current = createLayoutNodes(nodes, validEdges, previous)
    edgeRef.current = validEdges
    const nodeIds = new Set(nodes.map(({ id }) => id))
    const edgeIds = new Set(validEdges.map(({ id }) => id))
    for (const id of nodeOpacityRef.current.keys()) {
      if (!nodeIds.has(id)) nodeOpacityRef.current.delete(id)
    }
    for (const id of edgeOpacityRef.current.keys()) {
      if (!edgeIds.has(id)) edgeOpacityRef.current.delete(id)
    }
    alphaRef.current = nodes.length > 0 ? 1 : 0
    if (!initializedRef.current) {
      initializedRef.current = true
      autoFitPassRef.current = 0
      autoFitFrameRef.current = 1
      fitOnSettleRef.current = nodes.length > 0
    }
    scheduleDraw()
  }, [nodes, validEdges, scheduleDraw])

  useEffect(() => {
    if (fitViewKey === undefined) return
    autoFitPassRef.current = 0
    autoFitFrameRef.current = 1
    fitOnSettleRef.current = nodes.length > 0
    scheduleDraw()
  }, [fitViewKey, scheduleDraw])

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updatePreference = () => {
      prefersReducedMotionRef.current = query.matches
      scheduleDraw()
    }
    updatePreference()
    query.addEventListener("change", updatePreference)
    return () => query.removeEventListener("change", updatePreference)
  }, [scheduleDraw])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const updateSize = () => {
      const bounds = container.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const width = Math.max(1, Math.round(bounds.width))
      const height = Math.max(1, Math.round(bounds.height))
      viewportRef.current = { width, height, dpr }
      const pixelWidth = Math.round(width * dpr)
      const pixelHeight = Math.round(height * dpr)
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      // Resizing a canvas clears its backing store. Draw synchronously inside
      // the ResizeObserver so CSS panel transitions never paint a blank frame.
      drawRef.current({ advanceSimulation: false, advanceTransitions: false })
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    updateSize()
    return () => observer.disconnect()
  }, [scheduleDraw])

  useEffect(() => () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    for (const image of imagesRef.current.values()) {
      if (image) {
        image.onload = null
        image.onerror = null
      }
    }
    imagesRef.current.clear()
  }, [])

  const getImage = useCallback((node: LayoutNode): HTMLImageElement | null => {
    if (!node.avatarUrl || !isSafeImageUrl(node.avatarUrl)) return null
    const key = `${node.id}:${node.avatarUrl}`
    if (imagesRef.current.has(key)) {
      const cached = imagesRef.current.get(key)
      return cached?.complete && cached.naturalWidth > 0 ? cached : null
    }
    const image = new Image()
    imagesRef.current.set(key, image)
    image.onload = () => {
      imagesRef.current.set(key, image)
      scheduleDraw()
    }
    image.onerror = () => {
      imagesRef.current.set(key, null)
      scheduleDraw()
    }
    image.referrerPolicy = "no-referrer"
    image.src = node.avatarUrl
    return null
  }, [scheduleDraw])

  const adjacency = useMemo(() => {
    const result = new Map<string, Set<string>>()
    for (const edge of validEdges) {
      if (!result.has(edge.sourceId)) result.set(edge.sourceId, new Set())
      if (!result.has(edge.targetId)) result.set(edge.targetId, new Set())
      result.get(edge.sourceId)!.add(edge.targetId)
      result.get(edge.targetId)!.add(edge.sourceId)
    }
    return result
  }, [validEdges])

  const draw = useCallback((options?: DrawOptions) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    const advanceSimulation = options?.advanceSimulation !== false
    const advanceTransitions = options?.advanceTransitions !== false
    const prefersReducedMotion = prefersReducedMotionRef.current
    const viewport = viewportRef.current
    const now = performance.now()
    const elapsed = transitionFrameTimeRef.current === null
      ? 16
      : Math.min(32, Math.max(0, now - transitionFrameTimeRef.current))
    if (advanceTransitions) transitionFrameTimeRef.current = now
    let focusAnimating = false
    const focusTarget = focusTargetRef.current
    if (focusTarget) {
      const node = layoutRef.current.find((candidate) => candidate.id === focusTarget.nodeId)
      if (node) {
        const targetCamera = focusCamera(
          node,
          cameraRef.current,
          viewport.height,
          focusTarget.bottomInset,
        )
        if (focusTarget.settled) {
          cameraRef.current = targetCamera
        } else if (advanceTransitions && prefersReducedMotion) {
          cameraRef.current = targetCamera
          focusTarget.settled = true
        } else if (advanceTransitions) {
          const progress = (now - focusTarget.startedAt) / FOCUS_TRANSITION_MS
          cameraRef.current = interpolateCamera(
            focusTarget.startCamera,
            targetCamera,
            progress,
          )
          if (progress >= 1) {
            focusTarget.settled = true
            cameraRef.current = targetCamera
          } else {
            focusAnimating = true
          }
        }
      } else {
        focusTargetRef.current = null
      }
    }
    const camera = cameraRef.current
    const isDark = Boolean(canvas.closest(".dark"))
    const labelColor = isDark ? "#f4f6fa" : "#263244"
    const labelHalo = isDark ? "rgba(20,24,34,0.9)" : "rgba(255,255,255,0.92)"
    const edgeColor = isDark ? "rgba(157,170,194,0.34)" : "rgba(78,96,123,0.28)"
    const gridColor = isDark ? "rgba(151,167,194,0.12)" : "rgba(66,88,119,0.10)"

    context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0)
    context.clearRect(0, 0, viewport.width, viewport.height)

    const grid = Math.max(24, 48 * camera.zoom)
    const offsetX = ((viewport.width / 2 - camera.x * camera.zoom) % grid + grid) % grid
    const offsetY = ((viewport.height / 2 - camera.y * camera.zoom) % grid + grid) % grid
    context.fillStyle = gridColor
    for (let x = offsetX; x < viewport.width; x += grid) {
      for (let y = offsetY; y < viewport.height; y += grid) {
        context.fillRect(Math.round(x), Math.round(y), 1, 1)
      }
    }

    const byId = new Map(layoutRef.current.map((node) => [node.id, node]))
    const requestedFocusId = selectedRef.current ?? hoverRef.current
    const focusId = requestedFocusId && byId.has(requestedFocusId) ? requestedFocusId : null
    const focusNeighbors = focusId ? adjacency.get(focusId) ?? new Set<string>() : null
    let opacityAnimating = false
    const smoothOpacity = (values: Map<string, number>, id: string, target: number) => {
      const current = values.get(id) ?? 1
      if (!advanceTransitions) return current
      const next = prefersReducedMotion ? target : approachOpacity(current, target, elapsed)
      values.set(id, next)
      if (next !== target) opacityAnimating = true
      return next
    }
    const labelCandidates: Array<{
      node: LayoutNode
      x: number
      y: number
      opacity: number
      priority: number
    }> = []

    context.lineWidth = 1
    for (const edge of edgeRef.current) {
      const source = byId.get(edge.sourceId)
      const target = byId.get(edge.targetId)
      if (!source || !target) continue
      const trimmed = trimEdge(source, target, camera.zoom)
      if (!trimmed) continue
      const from = worldToScreen({ x: trimmed.x1, y: trimmed.y1 }, camera, viewport)
      const to = worldToScreen({ x: trimmed.x2, y: trimmed.y2 }, camera, viewport)
      const active = !focusId || edge.sourceId === focusId || edge.targetId === focusId
      context.globalAlpha = smoothOpacity(edgeOpacityRef.current, edge.id, active ? 1 : 0.25)
      context.strokeStyle = edgeColor
      context.beginPath()
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
      context.stroke()
    }

    for (const node of layoutRef.current) {
      const screen = worldToScreen(node, camera, viewport)
      const radius = displayRadius(node, camera.zoom)
      const active = !focusId || node.id === focusId || focusNeighbors?.has(node.id) === true
      const opacity = smoothOpacity(nodeOpacityRef.current, node.id, active ? 1 : 0.18)
      if (
        screen.x < -radius - 80 || screen.x > viewport.width + radius + 80 ||
        screen.y < -radius - 40 || screen.y > viewport.height + radius + 40
      ) continue
      const descriptor = typeDescriptors.get(node.type)
      const color = isDark ? descriptor?.darkColor ?? descriptor?.color : descriptor?.color
      const selected = selectedRef.current === node.id
      const hovered = hoverRef.current === node.id
      context.globalAlpha = opacity

      if (selected || hovered) {
        context.beginPath()
        context.arc(screen.x, screen.y, radius + (selected ? 5 : 3), 0, Math.PI * 2)
        context.fillStyle = selected ? "rgba(239,127,34,0.22)" : "rgba(93,119,159,0.16)"
        context.fill()
      }

      const image = getImage(node)
      context.save()
      context.beginPath()
      context.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
      context.clip()
      context.fillStyle = color ?? (isDark ? "#8794aa" : "#63718a")
      context.fillRect(screen.x - radius, screen.y - radius, radius * 2, radius * 2)
      if (image) {
        const size = Math.min(image.naturalWidth, image.naturalHeight)
        const sourceX = (image.naturalWidth - size) / 2
        const sourceY = (image.naturalHeight - size) / 2
        context.drawImage(image, sourceX, sourceY, size, size, screen.x - radius, screen.y - radius, radius * 2, radius * 2)
      } else if (node.label) {
        context.fillStyle = "rgba(255,255,255,0.94)"
        context.font = `600 ${Math.max(8, radius * 0.95)}px Inter, system-ui, sans-serif`
        context.textAlign = "center"
        context.textBaseline = "middle"
        context.fillText(node.label.slice(0, 1).toUpperCase(), screen.x, screen.y + 0.5)
      }
      context.restore()

      context.globalAlpha = opacity
      context.beginPath()
      context.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
      context.strokeStyle = selected ? "#ef7f22" : (isDark ? "rgba(255,255,255,0.66)" : "rgba(255,255,255,0.9)")
      context.lineWidth = selected ? 2.5 : 1.25
      context.stroke()

      const showLabel = selected || hovered || Boolean(focusNeighbors?.has(node.id)) ||
        node.type === "project" && camera.zoom > 0.25 ||
        node.type === "person" && node.degree >= 4 && camera.zoom > 0.55 ||
        camera.zoom > 1.1
      if (!showLabel) continue
      labelCandidates.push({
        node,
        x: screen.x,
        y: screen.y + radius + 13,
        opacity,
        priority: selected
          ? 1000
          : hovered
            ? 900
            : focusNeighbors?.has(node.id)
              ? 800
              : node.type === "project"
                ? 500 + node.degree
                : node.degree,
      })
    }

    context.font = "500 11px Inter, system-ui, sans-serif"
    context.textAlign = "center"
    context.textBaseline = "middle"
    const occupiedLabels: Array<{ left: number; right: number; top: number; bottom: number }> = []
    labelCandidates.sort((left, right) => right.priority - left.priority || left.node.id.localeCompare(right.node.id))
    for (const candidate of labelCandidates) {
      const label = truncateLabel(candidate.node.label)
      const halfWidth = context.measureText(label).width / 2 + 4
      const bounds = {
        left: candidate.x - halfWidth,
        right: candidate.x + halfWidth,
        top: candidate.y - 8,
        bottom: candidate.y + 8,
      }
      const overlaps = occupiedLabels.some((occupied) =>
        bounds.left < occupied.right + 2 && bounds.right > occupied.left - 2 &&
        bounds.top < occupied.bottom + 2 && bounds.bottom > occupied.top - 2,
      )
      if (overlaps && candidate.priority < 900) continue
      occupiedLabels.push(bounds)
      context.globalAlpha = candidate.opacity
      context.lineWidth = 4
      context.strokeStyle = labelHalo
      context.strokeText(label, candidate.x, candidate.y)
      context.fillStyle = labelColor
      context.fillText(label, candidate.x, candidate.y)
    }
    context.globalAlpha = 1

    if (advanceSimulation) {
      const simulationWasActive = alphaRef.current > 0.004
      if (simulationWasActive && gestureRef.current.mode !== "drag") {
        alphaRef.current = stepForceLayout(layoutRef.current, edgeRef.current, alphaRef.current)
      }
      if (autoFitFrameRef.current > 0) {
        autoFitFrameRef.current -= 1
        if (autoFitFrameRef.current === 0) {
          fitView()
          if (autoFitPassRef.current === 0 && layoutRef.current.length > 0) {
            autoFitPassRef.current = 1
            autoFitFrameRef.current = 159
          }
        }
      }
      if (fitOnSettleRef.current && simulationWasActive && alphaRef.current <= 0.004) {
        fitOnSettleRef.current = false
        fitView()
      }

      const focusSettledWithSimulation = focusTargetRef.current?.settled === true &&
        alphaRef.current <= 0.004
      const needsFinalFocusedFrame = focusSettledWithSimulation && simulationWasActive
      if (focusSettledWithSimulation && !simulationWasActive) {
        focusTargetRef.current = null
      }
      if (
        alphaRef.current > 0.004 ||
        autoFitFrameRef.current > 0 ||
        focusAnimating ||
        opacityAnimating ||
        needsFinalFocusedFrame
      ) scheduleDraw()
    }
  }, [adjacency, fitView, getImage, scheduleDraw, typeDescriptors])

  drawRef.current = draw

  // Canvas colors depend on an ancestor's `.dark` class, which can change on a
  // parent render without changing any GraphView prop or draw dependency.
  useEffect(() => {
    scheduleDraw()
  })

  const pickNode = useCallback((x: number, y: number): LayoutNode | null => {
    const viewport = viewportRef.current
    const camera = cameraRef.current
    let closest: LayoutNode | null = null
    let closestDistance = Infinity
    for (const node of layoutRef.current) {
      const screen = worldToScreen(node, camera, viewport)
      const distance = Math.hypot(screen.x - x, screen.y - y)
      const hitRadius = Math.max(14, displayRadius(node, camera.zoom) + 5)
      if (distance <= hitRadius && distance < closestDistance) {
        closest = node
        closestDistance = distance
      }
    }
    return closest
  }, [])

  const pointerPosition = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }, [])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    focusTargetRef.current = null
    const position = pointerPosition(event)
    pointersRef.current.set(event.pointerId, position)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.style.cursor = "grabbing"

    if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()]
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      const world = screenToWorld(midpoint.x, midpoint.y, cameraRef.current, viewportRef.current)
      gestureRef.current = {
        ...initialGesture(),
        mode: "pinch",
        pinchDistance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
        pinchZoom: cameraRef.current.zoom,
        pinchWorldX: world.x,
        pinchWorldY: world.y,
      }
      return
    }

    const node = pickNode(position.x, position.y)
    const world = screenToWorld(position.x, position.y, cameraRef.current, viewportRef.current)
    gestureRef.current = {
      ...initialGesture(),
      mode: node ? "drag" : "pan",
      pointerId: event.pointerId,
      nodeId: node?.id ?? null,
      startX: position.x,
      startY: position.y,
      lastX: position.x,
      lastY: position.y,
      dragOffsetX: node ? world.x - node.x : 0,
      dragOffsetY: node ? world.y - node.y : 0,
    }
  }, [pickNode, pointerPosition])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const position = pointerPosition(event)
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, position)
    const gesture = gestureRef.current

    if (pointersRef.current.size === 2 && gesture.mode === "pinch") {
      const [first, second] = [...pointersRef.current.values()]
      const distance = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y))
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      const zoom = Math.max(0.08, Math.min(4, gesture.pinchZoom * distance / gesture.pinchDistance))
      cameraRef.current = {
        zoom,
        x: gesture.pinchWorldX - (midpoint.x - viewportRef.current.width / 2) / zoom,
        y: gesture.pinchWorldY - (midpoint.y - viewportRef.current.height / 2) / zoom,
      }
      scheduleDraw()
      return
    }

    if (gesture.pointerId === event.pointerId && gesture.mode !== "idle") {
      const dx = position.x - gesture.lastX
      const dy = position.y - gesture.lastY
      gesture.moved ||= Math.hypot(position.x - gesture.startX, position.y - gesture.startY) > 4
      if (gesture.mode === "pan") {
        cameraRef.current.x -= dx / cameraRef.current.zoom
        cameraRef.current.y -= dy / cameraRef.current.zoom
      } else if (gesture.mode === "drag" && gesture.nodeId) {
        const node = layoutRef.current.find((candidate) => candidate.id === gesture.nodeId)
        if (node) {
          const world = screenToWorld(position.x, position.y, cameraRef.current, viewportRef.current)
          node.x = world.x - gesture.dragOffsetX
          node.y = world.y - gesture.dragOffsetY
          node.vx = 0
          node.vy = 0
          alphaRef.current = Math.max(alphaRef.current, 0.12)
        }
      }
      gesture.lastX = position.x
      gesture.lastY = position.y
      scheduleDraw()
      return
    }

    if (event.pointerType === "mouse") {
      const nextHover = pickNode(position.x, position.y)?.id ?? null
      if (nextHover !== hoverRef.current) {
        hoverRef.current = nextHover
        event.currentTarget.style.cursor = nextHover ? "pointer" : "grab"
        scheduleDraw()
      }
    }
  }, [pickNode, pointerPosition, scheduleDraw])

  const finishPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>, allowSelection: boolean) => {
    const gesture = gestureRef.current
    const position = pointerPosition(event)
    pointersRef.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (shouldSelectOnPointerFinish(gesture, event.pointerId, allowSelection)) {
      onSelectedNodeChange(pickNode(position.x, position.y)?.id ?? null)
    }
    if (pointersRef.current.size === 0) {
      gestureRef.current = initialGesture()
      hoverRef.current = null
      event.currentTarget.style.cursor = "grab"
    } else if (pointersRef.current.size === 1) {
      const [remainingId, remainingPosition] = [...pointersRef.current.entries()][0]
      gestureRef.current = resumePanAfterPinch(remainingId, remainingPosition)
    }
    scheduleDraw()
  }, [onSelectedNodeChange, pickNode, pointerPosition, scheduleDraw])

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => finishPointer(event, true),
    [finishPointer],
  )

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => finishPointer(event, false),
    [finishPointer],
  )

  const handleWheel = useCallback((event: WheelEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    event.preventDefault()
    focusTargetRef.current = null
    const bounds = canvas.getBoundingClientRect()
    const position = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const before = screenToWorld(position.x, position.y, cameraRef.current, viewportRef.current)
    cameraRef.current.zoom = Math.max(
      0.08,
      Math.min(4, cameraRef.current.zoom * Math.exp(-event.deltaY * 0.0012)),
    )
    const after = screenToWorld(position.x, position.y, cameraRef.current, viewportRef.current)
    cameraRef.current.x += before.x - after.x
    cameraRef.current.y += before.y - after.y
    scheduleDraw()
  }, [scheduleDraw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener("wheel", handleWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", handleWheel)
  }, [handleWheel])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "Escape") {
      onSelectedNodeChange(null)
      setAnnouncement("Auswahl aufgehoben.")
      return
    }
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0
    if (direction === 0 && event.key !== "Home") return
    event.preventDefault()
    if (nodes.length === 0) return
    const current = nodes.findIndex((node) => node.id === selectedRef.current)
    const nextIndex = event.key === "Home"
      ? 0
      : current < 0
        ? direction > 0 ? 0 : nodes.length - 1
        : (current + direction + nodes.length) % nodes.length
    const next = nodes[nextIndex]
    onSelectedNodeChange(next.id)
    setAnnouncement(selectionAnnouncement(next.label))
    focusNode(next.id)
  }, [focusNode, nodes, onSelectedNodeChange])

  return (
    <div ref={containerRef} className={cn("relative h-full min-h-0 w-full overflow-hidden", className)}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-grab touch-none outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        role="application"
        aria-label={`${ariaLabel}. ${nodes.length} Knoten, ${validEdges.length} Verbindungen.`}
        aria-describedby={instructionsId}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={() => {
          if (gestureRef.current.mode === "idle") {
            hoverRef.current = null
            scheduleDraw()
          }
        }}
        onKeyDown={handleKeyDown}
      />
      <p id={instructionsId} className="sr-only">
        Pfeiltasten wählen Knoten aus. Escape hebt die Auswahl auf.
      </p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">Noch keine Einträge</p>
        </div>
      )}
    </div>
  )
})
