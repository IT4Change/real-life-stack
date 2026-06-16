import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { TagChip } from './tag-chip'

const meta: Meta<typeof TagChip> = {
  title: 'RLS/Module Components/Tag/TagChip',
  component: TagChip,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
}

export default meta
type Story = StoryObj<typeof TagChip>

const SAMPLE = ['garten', 'permakultur', 'workshop', 'bauen', 'musik', 'kochen']

export const Static: Story = {
  args: { tag: 'garten' },
}

/** Deterministic palette — same colours the post/preview cards use. */
export const Palette: Story = {
  render: () => (
    <div className="flex flex-wrap gap-1.5">
      {SAMPLE.map((tag) => (
        <TagChip key={tag} tag={tag} />
      ))}
    </div>
  ),
}

/** Filter picker: toggleable, dimmed when unselected, ring when selected. */
export const Picker: Story = {
  render: () => {
    const [selected, setSelected] = useState<string[]>(['garten', 'workshop'])
    return (
      <div className="flex flex-wrap gap-1.5">
        {SAMPLE.map((tag) => (
          <TagChip
            key={tag}
            tag={tag}
            size="md"
            selected={selected.includes(tag)}
            onToggle={() =>
              setSelected((prev) =>
                prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
              )
            }
          />
        ))}
      </div>
    )
  },
}

/** Active filter chips with a remove button. */
export const Removable: Story = {
  render: () => {
    const [tags, setTags] = useState(['garten', 'permakultur', 'workshop'])
    return (
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <TagChip
            key={tag}
            tag={tag}
            size="md"
            onRemove={() => setTags((prev) => prev.filter((t) => t !== tag))}
          />
        ))}
      </div>
    )
  },
}
