import type { Meta, StoryObj } from "@storybook/react-vite"
import { MapLibreMapAdapter } from "./adapters/maplibre"
import { MapView } from "./map-view"

const items = [
  { id: "story-place", type: "place", createdAt: "2026-07-17T00:00:00.000Z", createdBy: "story", data: { title: "Treffpunkt", position: { type: "Point", coordinates: [13.4, 52.5] } } },
  { id: "story-event", type: "event", createdAt: "2026-07-17T00:00:00.000Z", createdBy: "story", data: { title: "Workshop", position: { type: "Point", coordinates: [13.42, 52.51] } } },
]
const meta: Meta<typeof MapView> = { title: "RLS/Space Modules/MapView", component: MapView, decorators: [(Story) => <div style={{ height: 560 }}><Story /></div>] }
export default meta
type Story = StoryObj<typeof MapView>
const base = { items, itemsLoading: false, inventoryKey: "story", createAdapter: () => new MapLibreMapAdapter(), initialView: { center: [13.4, 52.5] as [number, number], zoom: 10 }, activeItemId: "story-place", clustering: {} }
export const BboxModule: Story = { args: { ...base, viewportMode: "bbox-module" } }
export const LensAutoFit: Story = { args: { ...base, viewportMode: "lens-auto-fit" } }
