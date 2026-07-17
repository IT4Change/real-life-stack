import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { BottomNav, type NavItem } from './bottom-nav'
import { Home, Map, Calendar, User, List, Grid2X2, KanbanSquare } from 'lucide-react'

const meta: Meta<typeof BottomNav> = {
  title: 'RLS/App Shell/Layout/BottomNav',
  component: BottomNav,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
}

export default meta
type Story = StoryObj<typeof BottomNav>

const defaultItems: NavItem[] = [
  { id: 'feed', label: 'Feed', icon: Home },
  { id: 'map', label: 'Karte', icon: Map },
  { id: 'calendar', label: 'Kalender', icon: Calendar },
]

const extendedItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'map', label: 'Karte', icon: Map },
  { id: 'calendar', label: 'Kalender', icon: Calendar },
  { id: 'profile', label: 'Profil', icon: User },
]

export const Default: Story = {
  args: {
    items: defaultItems,
    activeItem: 'feed',
  },
}

export const FourItems: Story = {
  args: {
    items: extendedItems,
    activeItem: 'home',
  },
}

export const Overflow: Story = {
  args: {
    items: [
      ...extendedItems,
      { id: 'list', label: 'Liste', icon: List },
      { id: 'grid', label: 'Raster', icon: Grid2X2 },
      { id: 'board', label: 'Board', icon: KanbanSquare },
    ],
    activeItem: 'calendar',
  },
}

export const Interactive: Story = {
  render: function InteractiveNav() {
    const [active, setActive] = useState('feed')
    return (
      <div className="min-h-[200px] relative">
        <p className="p-4 text-sm text-muted-foreground">
          Active: <strong>{active}</strong>
        </p>
        <BottomNav
          items={defaultItems}
          activeItem={active}
          onItemChange={setActive}
        />
      </div>
    )
  },
}
