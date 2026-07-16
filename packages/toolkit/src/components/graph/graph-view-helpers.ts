export interface PointerPosition {
  x: number
  y: number
}

export interface PointerGesture {
  mode: "idle" | "pan" | "drag" | "pinch"
  pointerId: number | null
  nodeId: string | null
  startX: number
  startY: number
  lastX: number
  lastY: number
  moved: boolean
  dragOffsetX: number
  dragOffsetY: number
  pinchDistance: number
  pinchZoom: number
  pinchWorldX: number
  pinchWorldY: number
}

export function initialGesture(): PointerGesture {
  return {
    mode: "idle",
    pointerId: null,
    nodeId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    pinchDistance: 0,
    pinchZoom: 1,
    pinchWorldX: 0,
    pinchWorldY: 0,
  }
}

export function resumePanAfterPinch(pointerId: number, position: PointerPosition): PointerGesture {
  return {
    ...initialGesture(),
    mode: "pan",
    pointerId,
    startX: position.x,
    startY: position.y,
    lastX: position.x,
    lastY: position.y,
    moved: true,
  }
}

export function shouldSelectOnPointerFinish(
  gesture: PointerGesture,
  pointerId: number,
  allowSelection: boolean,
): boolean {
  return allowSelection && gesture.pointerId === pointerId && !gesture.moved
}

export function isSafeImageUrl(value: string): boolean {
  return value.startsWith("data:image/") || value.startsWith("https://")
}

export function selectionAnnouncement(label: string): string {
  return `${label} ausgewählt.`
}
