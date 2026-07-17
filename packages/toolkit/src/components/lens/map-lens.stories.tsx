import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Item } from "@real-life-stack/data-interface"

import { MapLibreMapAdapter } from "../map/adapters/maplibre"
import { MapLens } from "./map-lens"
import "maplibre-gl/dist/maplibre-gl.css"

const items: Item[] = [
  {
    id: "place-p2p-portal",
    type: "place",
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "seed:dwebcamp-2026",
    data: {
      title: "P2P Portal",
      locationName: "P2P Portal",
      position: { type: "Point", coordinates: [12.406579, 52.117986] },
    },
  },
  {
    id: "place-idea-stage",
    type: "place",
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "seed:dwebcamp-2026",
    data: {
      title: "Idea Stage",
      locationName: "Idea Stage",
      position: { type: "Point", coordinates: [12.406772, 52.118675] },
    },
  },
  {
    id: "relation-hidden",
    type: "relation",
    createdAt: "2026-07-16T00:00:00.000Z",
    createdBy: "seed:dwebcamp-2026",
    data: {
      title: "Nicht als Marker",
      position: { type: "Point", coordinates: [12.405, 52.117] },
    },
  },
]

function MapLensStory() {
  return (
    <div className="h-[34rem] bg-background p-4">
      <MapLens
        items={items}
        createAdapter={() => new MapLibreMapAdapter()}
        initialView={{ center: [12.4066, 52.1183], zoom: 16 }}
      />
    </div>
  )
}

const meta: Meta<typeof MapLensStory> = {
  title: "RLS/Module Components/Lenses/MapLens",
  component: MapLensStory,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
}

export default meta
type Story = StoryObj<typeof MapLensStory>

export const Default: Story = {}
