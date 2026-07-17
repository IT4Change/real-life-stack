import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Item } from "@real-life-stack/data-interface"

import { GridView } from "./grid-view"

const items: Item[] = [
  { id: "person-ada", type: "person", createdAt: "2026-07-08T10:00:00.000Z", createdBy: "seed", data: { displayName: "Ada Lovelace" } },
  { id: "project-rls", type: "project", createdAt: "2026-07-08T10:01:00.000Z", createdBy: "seed", data: { title: "Real Life Stack", website: "https://real-life-stack.org", repo: "https://github.com/real-life-org/real-life-stack" } },
  { id: "resource-loetstation", type: "resource", createdAt: "2026-07-08T10:02:00.000Z", createdBy: "seed", data: { title: "Lötstation", kind: "tool", availability: "frei nutzbar" } },
  { id: "event-opening", type: "event", createdAt: "2026-07-08T10:03:00.000Z", createdBy: "seed", data: { title: "Eröffnung", start: "2026-07-08T19:00:00+02:00" } },
  { id: "initiative-open-workshop", type: "initiative", createdAt: "2026-07-08T10:04:00.000Z", createdBy: "seed", data: { title: "Offene Werkstatt" } },
]

const meta: Meta<typeof GridView> = {
  title: "RLS/Module Components/Lenses/GridView",
  component: GridView,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "Read-only lens composed from comfortable `ItemPreview` cards; type-specific metadata lives in shared preview adornments.",
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof GridView>

export const TypeSpecificAdornments: Story = { args: { items } }
