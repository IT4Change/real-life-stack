import { useRef, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Button } from "@/components/primitives/button"
import { Plus } from "lucide-react"
import { ReactionPicker } from "./reaction-picker"

interface PickerDemoProps {
  style?: React.CSSProperties
  label?: string
}

function PickerDemo({ style, label = "Add Reaction" }: PickerDemoProps) {
  const [open, setOpen] = useState(false)
  const [lastSelected, setLastSelected] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  return (
    <div style={style}>
      <Button
        ref={buttonRef}
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Plus className="h-4 w-4" />
        {label}
      </Button>

      {open && (
        <ReactionPicker
          anchorRef={buttonRef}
          onSelect={(emoji) => setLastSelected(emoji)}
          onClose={() => setOpen(false)}
        />
      )}

      {lastSelected && (
        <p className="text-sm text-muted-foreground mt-2">
          Selected: <span className="text-2xl">{lastSelected}</span>
        </p>
      )}
    </div>
  )
}

const meta: Meta = {
  title: "RLS/Module Components/Reactions/ReactionPicker",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
}

export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <div className="p-8">
      <PickerDemo />
    </div>
  ),
}

export const OpensUpward: Story = {
  name: "Opens upward (bottom edge)",
  render: () => (
    <div className="p-8" style={{ position: "fixed", bottom: 16, left: 16 }}>
      <PickerDemo label="Near bottom" />
    </div>
  ),
}

export const OpensLeft: Story = {
  name: "Flips left (right edge)",
  render: () => (
    <div className="p-8" style={{ position: "fixed", top: 16, right: 16 }}>
      <PickerDemo label="Near right" />
    </div>
  ),
}

export const OpensUpwardLeft: Story = {
  name: "Flips both (bottom-right corner)",
  render: () => (
    <div className="p-8" style={{ position: "fixed", bottom: 16, right: 16 }}>
      <PickerDemo label="Bottom-right" />
    </div>
  ),
}

export const AllCorners: Story = {
  name: "All four corners",
  render: () => (
    <>
      <div style={{ position: "fixed", top: 16, left: 16 }}>
        <PickerDemo label="Top-left" />
      </div>
      <div style={{ position: "fixed", top: 16, right: 16 }}>
        <PickerDemo label="Top-right" />
      </div>
      <div style={{ position: "fixed", bottom: 16, left: 16 }}>
        <PickerDemo label="Bottom-left" />
      </div>
      <div style={{ position: "fixed", bottom: 16, right: 16 }}>
        <PickerDemo label="Bottom-right" />
      </div>
    </>
  ),
}
