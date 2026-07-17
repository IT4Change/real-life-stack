export interface GraphNode {
  id: string
  label: string
  type: string
  avatarUrl?: string
}

export interface GraphEdge {
  id: string
  sourceId: string
  targetId: string
  predicate: string
}

export interface GraphTypeDescriptor {
  id: string
  label: string
  color: string
  darkColor?: string
}

export interface GraphViewHandle {
  fitView: () => void
  focusNode: (nodeId: string, options?: { bottomInset?: number }) => void
}

export interface GraphViewProps {
  nodes: readonly GraphNode[]
  edges: readonly GraphEdge[]
  nodeTypes?: readonly GraphTypeDescriptor[]
  selectedNodeId: string | null
  onSelectedNodeChange: (nodeId: string | null) => void
  /** Centers a selected node above an app-provided vertical obstruction. */
  selectionFocusBottomInset?: number
  fitViewKey?: string | number
  className?: string
  ariaLabel?: string
}
