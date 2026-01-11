import type { Meta, StoryObj } from '@storybook/react-vite'
import React from 'react'
import { StatCard } from './stat-card'
import { Users, Calendar, MessageCircle, Heart, TrendingUp } from 'lucide-react'

const meta: Meta<typeof StatCard> = {
  title: 'Content/StatCard',
  component: StatCard,
  tags: ['autodocs'],
  argTypes: {
    color: {
      control: 'select',
      options: ['blue', 'green', 'orange', 'purple', 'red'],
    },
  },
}

export default meta
type Story = StoryObj<typeof StatCard>

export const Blue: Story = {
  args: {
    icon: Users,
    value: 12,
    label: 'Mitglieder',
    color: 'blue',
  },
}

export const Green: Story = {
  args: {
    icon: Calendar,
    value: 3,
    label: 'Events',
    color: 'green',
  },
}

export const Orange: Story = {
  args: {
    icon: TrendingUp,
    value: '+24%',
    label: 'Wachstum',
    color: 'orange',
  },
}

export const Purple: Story = {
  args: {
    icon: MessageCircle,
    value: 28,
    label: 'Posts',
    color: 'purple',
  },
}

export const Red: Story = {
  args: {
    icon: Heart,
    value: 156,
    label: 'Likes',
    color: 'red',
  },
}

export const Dashboard: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      <StatCard icon={Users} value={12} label="Mitglieder" color="blue" />
      <StatCard icon={Calendar} value={3} label="Events" color="green" />
      <StatCard icon={MessageCircle} value={28} label="Posts" color="purple" />
    </div>
  ),
}
