import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { GraphView } from "./graph-view"
import type { GraphEdge, GraphNode } from "./types"

const nodes: GraphNode[] = [
  { id: "person-ada", label: "Ada Lovelace", type: "person" },
  { id: "person-grace", label: "Grace Hopper", type: "person" },
  { id: "project-common", label: "Common Knowledge", type: "project" },
  { id: "project-local", label: "Local First", type: "project" },
  { id: "event-trust", label: "Trust without platforms", type: "event" },
  { id: "event-sync", label: "Offline sync patterns", type: "event" },
]

const edges: GraphEdge[] = [
  { id: "edge-1", sourceId: "person-ada", targetId: "event-trust", predicate: "attends" },
  { id: "edge-2", sourceId: "person-grace", targetId: "event-sync", predicate: "attends" },
  { id: "edge-3", sourceId: "event-trust", targetId: "project-common", predicate: "connectedWith" },
  { id: "edge-4", sourceId: "event-sync", targetId: "project-local", predicate: "connectedWith" },
  { id: "edge-5", sourceId: "person-ada", targetId: "project-local", predicate: "partOf" },
]

function ControlledGraph({ initialSelection = null }: { initialSelection?: string | null }) {
  const [selected, setSelected] = useState<string | null>(initialSelection)
  return (
    <div className="h-screen bg-background text-foreground">
      <GraphView
        nodes={nodes}
        edges={edges}
        selectedNodeId={selected}
        onSelectedNodeChange={setSelected}
      />
    </div>
  )
}

const meta: Meta<typeof ControlledGraph> = {
  title: "RLS/Space Modules/Graph/Overview",
  component: ControlledGraph,
  parameters: { layout: "fullscreen" },
}

export default meta
type Story = StoryObj<typeof ControlledGraph>

export const Default: Story = {}

export const Selected: Story = {
  args: { initialSelection: "project-local" },
}

export const Empty: Story = {
  render: () => (
    <div className="h-screen bg-background">
      <GraphView nodes={[]} edges={[]} selectedNodeId={null} onSelectedNodeChange={() => undefined} />
    </div>
  ),
}

const denseNodes: GraphNode[] = Array.from({ length: 312 }, (_, index) => ({
  id: `dense-${index}`,
  label: `${index % 3 === 0 ? "Person" : index % 3 === 1 ? "Projekt" : "Session"} ${index + 1}`,
  type: index % 3 === 0 ? "person" : index % 3 === 1 ? "project" : "event",
}))

const denseEdges: GraphEdge[] = Array.from({ length: 420 }, (_, index) => ({
  id: `dense-edge-${index}`,
  sourceId: denseNodes[index % denseNodes.length].id,
  targetId: denseNodes[(index * 17 + 31) % denseNodes.length].id,
  predicate: "connectedWith",
}))

function DenseGraph() {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <div className="h-screen bg-background">
      <GraphView
        nodes={denseNodes}
        edges={denseEdges}
        selectedNodeId={selected}
        onSelectedNodeChange={setSelected}
      />
    </div>
  )
}

export const Dense: Story = {
  render: () => <DenseGraph />,
}
