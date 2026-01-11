import type { Meta, StoryObj } from '@storybook/react-vite'
import React from 'react'
import { Navbar, NavbarStart, NavbarCenter, NavbarEnd } from './navbar'
import { Button } from '../ui/button'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { ChevronDown, Menu } from 'lucide-react'

const meta: Meta<typeof Navbar> = {
  title: 'Layout/Navbar',
  component: Navbar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof Navbar>

export const Default: Story = {
  render: () => (
    <Navbar>
      <NavbarStart>
        <Button variant="ghost" className="gap-2">
          <span className="font-semibold">Workspace</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </NavbarStart>
      <NavbarCenter>
        <div className="hidden md:flex gap-1">
          <Button variant="ghost" size="sm">Feed</Button>
          <Button variant="ghost" size="sm">Karte</Button>
          <Button variant="ghost" size="sm">Kalender</Button>
        </div>
      </NavbarCenter>
      <NavbarEnd>
        <Avatar className="h-8 w-8">
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      </NavbarEnd>
    </Navbar>
  ),
}

export const WithMenuButton: Story = {
  render: () => (
    <Navbar>
      <NavbarStart>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-semibold">My App</span>
      </NavbarStart>
      <NavbarEnd>
        <Button variant="outline" size="sm">Login</Button>
        <Button size="sm">Sign up</Button>
      </NavbarEnd>
    </Navbar>
  ),
}

export const Simple: Story = {
  render: () => (
    <Navbar>
      <NavbarStart>
        <span className="font-bold text-lg">Logo</span>
      </NavbarStart>
      <NavbarEnd>
        <Button variant="ghost" size="sm">About</Button>
        <Button variant="ghost" size="sm">Contact</Button>
        <Button size="sm">Get Started</Button>
      </NavbarEnd>
    </Navbar>
  ),
}
