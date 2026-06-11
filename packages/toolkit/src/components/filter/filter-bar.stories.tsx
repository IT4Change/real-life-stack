import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Calendar, CheckSquare, MapPin, User } from "lucide-react"
import { FilterBar } from "./filter-bar"
import { FilterSection, FilterToggle, FilterMultiSelect } from "./filter-building-blocks"
import { emptyFilterBarValue, type FilterBarValue, type FilterTypeOption } from "./types"

const TAGS = ["garten", "permakultur", "workshop", "infrastruktur", "planung"]

const TYPES: FilterTypeOption[] = [
  { id: "event", label: "Event", icon: Calendar },
  { id: "task", label: "Task", icon: CheckSquare },
  { id: "place", label: "Ort", icon: MapPin },
  { id: "person", label: "Profil", icon: User },
]

const meta: Meta<typeof FilterBar> = {
  title: "Module Components / FilterBar",
  component: FilterBar,
  decorators: [
    (Story) => (
      <div className="max-w-3xl mx-auto p-6 bg-background space-y-4">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof FilterBar>

function Wrapper({ initial = emptyFilterBarValue, extraDrawer, extraChips, trailing }: {
  initial?: FilterBarValue
  extraDrawer?: (value: FilterBarValue, setValue: (v: FilterBarValue) => void) => React.ReactNode
  extraChips?: React.ReactNode
  trailing?: React.ReactNode
}) {
  const [value, setValue] = useState<FilterBarValue>(initial)
  return (
    <>
      <FilterBar
        value={value}
        onChange={setValue}
        availableTags={TAGS}
        availableTypes={TYPES}
        drawerExtra={extraDrawer?.(value, setValue)}
        chipsExtra={extraChips}
        trailingActions={trailing}
      />
      <pre className="mt-4 rounded bg-muted/40 p-3 text-xs text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </>
  )
}

export const Default: Story = {
  render: () => <Wrapper />,
}

export const PreSelected: Story = {
  name: "With pre-selected tags and types",
  render: () => <Wrapper initial={{ tags: ["garten"], types: ["event"] }} />,
}

export const KanbanShape: Story = {
  name: "Module extras — Kanban-style (toggle in drawer)",
  render: () => {
    function KanbanExtras({ value, setValue }: { value: FilterBarValue; setValue: (v: FilterBarValue) => void }) {
      void value
      void setValue
      // The Kanban-extras live in caller-state; here we just demo the UI.
      const [myItemsOnly, setMyItemsOnly] = useState(false)
      return (
        <FilterSection label="Schnellfilter">
          <FilterToggle
            label="Nur meine Aufgaben"
            value={myItemsOnly}
            onChange={setMyItemsOnly}
          />
        </FilterSection>
      )
    }
    return (
      <Wrapper
        extraDrawer={(value, setValue) => (
          <KanbanExtras value={value} setValue={setValue} />
        )}
      />
    )
  },
}

export const CalendarShape: Story = {
  name: "Module extras — Calendar location filter",
  render: () => {
    function LocationExtras() {
      const [loc, setLoc] = useState<string[]>([])
      return (
        <FilterSection label="Ort">
          <FilterMultiSelect
            options={[
              { id: "with", label: "Mit Ort" },
              { id: "without", label: "Ohne Ort" },
            ]}
            value={loc}
            onChange={setLoc}
          />
        </FilterSection>
      )
    }
    return <Wrapper extraDrawer={() => <LocationExtras />} />
  },
}

export const NoAvailableTags: Story = {
  name: "Empty state — no tags in current items",
  render: () => {
    const [value, setValue] = useState<FilterBarValue>(emptyFilterBarValue)
    return (
      <FilterBar
        value={value}
        onChange={setValue}
        availableTags={[]}
        availableTypes={TYPES}
      />
    )
  },
}
