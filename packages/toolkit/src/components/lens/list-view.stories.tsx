import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Item } from "@real-life-stack/data-interface"

import { ListView } from "./list-view"

const items: Item[] = [
  { id: "person-ada", type: "person", createdAt: "2026-07-08T10:00:00.000Z", createdBy: "seed", data: { displayName: "Ada Lovelace" } },
  { id: "resource-loetstation", type: "resource", createdAt: "2026-07-08T10:01:00.000Z", createdBy: "seed", data: { title: "Lötstation", kind: "tool", availability: "frei nutzbar" } },
]

const meta: Meta<typeof ListView> = {
  title: "RLS/Module Components/Lenses/ListView",
  component: ListView,
  tags: ["autodocs"],
}

export default meta
type Story = StoryObj<typeof ListView>

export const Default: Story = { args: { items } }
