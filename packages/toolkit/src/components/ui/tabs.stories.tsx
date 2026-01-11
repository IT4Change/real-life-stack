import type { Meta, StoryObj } from '@storybook/react-vite'
import React from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card'

const meta: Meta<typeof Tabs> = {
  title: 'UI/Tabs',
  component: Tabs,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Tabs>

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Make changes to your account here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Account settings content goes here.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="password">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Change your password here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Password settings content goes here.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
}

export const ThreeTabs: Story = {
  render: () => (
    <Tabs defaultValue="feed" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="feed">Feed</TabsTrigger>
        <TabsTrigger value="map">Map</TabsTrigger>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
      </TabsList>
      <TabsContent value="feed">
        <p className="p-4 text-sm">Feed content</p>
      </TabsContent>
      <TabsContent value="map">
        <p className="p-4 text-sm">Map content</p>
      </TabsContent>
      <TabsContent value="calendar">
        <p className="p-4 text-sm">Calendar content</p>
      </TabsContent>
    </Tabs>
  ),
}

export const Disabled: Story = {
  render: () => (
    <Tabs defaultValue="active" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="disabled" disabled>
          Disabled
        </TabsTrigger>
        <TabsTrigger value="other">Other</TabsTrigger>
      </TabsList>
      <TabsContent value="active">
        <p className="p-4 text-sm">Active tab content</p>
      </TabsContent>
      <TabsContent value="other">
        <p className="p-4 text-sm">Other tab content</p>
      </TabsContent>
    </Tabs>
  ),
}
