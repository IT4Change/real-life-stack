import type { Meta, StoryObj } from '@storybook/react-vite'
import React from 'react'
import { ActionCard } from './action-card'
import { Plus, Users, Calendar, Settings, MessageSquare } from 'lucide-react'

const meta: Meta<typeof ActionCard> = {
  title: 'Content/ActionCard',
  component: ActionCard,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary'],
    },
  },
}

export default meta
type Story = StoryObj<typeof ActionCard>

export const Primary: Story = {
  args: {
    icon: Plus,
    label: 'Neues Event',
    description: 'Event erstellen und teilen',
    variant: 'primary',
  },
}

export const Secondary: Story = {
  args: {
    icon: Users,
    label: 'Mitglieder einladen',
    description: 'Neue Mitglieder hinzufügen',
    variant: 'secondary',
  },
}

export const WithoutDescription: Story = {
  args: {
    icon: Settings,
    label: 'Einstellungen',
    variant: 'secondary',
  },
}

export const QuickActions: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3 max-w-md">
      <ActionCard
        icon={Plus}
        label="Neues Event"
        variant="primary"
      />
      <ActionCard
        icon={Users}
        label="Einladen"
        variant="secondary"
      />
      <ActionCard
        icon={MessageSquare}
        label="Nachricht"
        variant="secondary"
      />
      <ActionCard
        icon={Calendar}
        label="Kalender"
        variant="secondary"
      />
    </div>
  ),
}
