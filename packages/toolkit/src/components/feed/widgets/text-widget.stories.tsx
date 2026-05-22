import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { TextWidget } from "./text-widget"

const meta: Meta<typeof TextWidget> = {
  title: "RLS/Module Components/Widgets/TextWidget",
  component: TextWidget,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-xl mx-auto p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TextWidget>

function TextWidgetControlled(props: React.ComponentProps<typeof TextWidget>) {
  const [value, setValue] = useState(props.value)
  return <TextWidget {...props} value={value} onChange={setValue} />
}

export const Default: Story = {
  name: "Default (leer)",
  render: () => (
    <TextWidgetControlled value="" onChange={() => {}} label="Beschreibung" />
  ),
}

export const MitInhalt: Story = {
  name: "Mit Inhalt",
  render: () => (
    <TextWidgetControlled
      value={`# Ueberschrift\n\nEin Absatz mit **fettem** und *kursivem* Text.\n\n## Unterueberschrift\n\n- Punkt eins\n- Punkt zwei\n- Punkt drei\n\n> Ein Zitat als Blockquote`}
      onChange={() => {}}
      label="Beschreibung"
    />
  ),
}

export const MitWidgetToggles: Story = {
  name: "Mit Widget-Toggles",
  render: () => (
    <TextWidgetControlled
      value=""
      onChange={() => {}}
      label="Schreibe etwas..."
      availableWidgets={["media", "date", "location", "people", "tags"]}
      onToggleWidget={(w) => console.log("Toggle widget:", w)}
    />
  ),
}
