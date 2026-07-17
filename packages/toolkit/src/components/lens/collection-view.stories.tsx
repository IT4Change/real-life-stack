import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Item } from "@real-life-stack/data-interface"

import { CollectionView } from "./collection-view"

const items: Item[] = [
  { id: "person-ada", type: "person", createdAt: "2026-07-08T10:00:00.000Z", createdBy: "seed", data: { displayName: "Ada Lovelace" } },
  { id: "project-rls", type: "project", createdAt: "2026-07-08T10:01:00.000Z", createdBy: "seed", data: { title: "Real Life Stack" } },
  { id: "resource-loetstation", type: "resource", createdAt: "2026-07-08T10:02:00.000Z", createdBy: "seed", data: { title: "Lötstation", kind: "tool" } },
]

const meta: Meta<typeof CollectionView> = {
  title: "RLS/Module Components/Lenses/CollectionView",
  component: CollectionView,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "One collection lens with a session-local density toggle; it composes the existing ListView and GridView ItemPreview projections.",
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof CollectionView>

export const List: Story = { args: { items, defaultLayout: "list" } }
export const Grid: Story = { args: { items, defaultLayout: "grid" } }

const thousandItems: Item[] = Array.from({ length: 1000 }, (_, index) => ({
  id: `virtual-item-${index}`,
  type: index % 3 === 0 ? "resource" : "task",
  createdAt: `2026-07-08T10:${String(index % 60).padStart(2, "0")}:00.000Z`,
  createdBy: "seed",
  data: { title: `Virtueller Eintrag ${index + 1}`, ...(index % 3 === 0 ? { kind: "tool" } : { status: "open" }) },
}))

/** Deterministic large fixture proving that both collection densities virtualize. */
export const ThousandItems: Story = {
  args: { items: thousandItems },
  decorators: [(Story) => <div className="h-[36rem]"><Story /></div>],
}
