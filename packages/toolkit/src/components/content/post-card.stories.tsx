import type { Meta, StoryObj } from '@storybook/react-vite'
import React from 'react'
import { PostCard, type Post } from './post-card'

const meta: Meta<typeof PostCard> = {
  title: 'Content/PostCard',
  component: PostCard,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof PostCard>

const textPost: Post = {
  id: '1',
  author: { name: 'Anna Schmidt' },
  content: 'Wer hat Lust auf einen gemeinsamen Spaziergang im Park am Samstag? Treffpunkt wäre 14 Uhr am Eingang.',
  timestamp: 'vor 2 Stunden',
  likes: 5,
  comments: 3,
  type: 'text',
}

const eventPost: Post = {
  id: '2',
  author: { name: 'Klimagruppe Berlin' },
  content: 'Nächstes Treffen: Dienstag 19 Uhr im Gemeinschaftshaus. Thema: Planung der Frühjahrs-Pflanzaktion.',
  timestamp: 'vor 5 Stunden',
  likes: 12,
  comments: 8,
  type: 'event',
}

const requestPost: Post = {
  id: '3',
  author: { name: 'Thomas Müller' },
  content: 'Suche jemanden der mir beim Umzug nächste Woche helfen kann. Biete Pizza und Getränke!',
  timestamp: 'gestern',
  likes: 3,
  comments: 7,
  type: 'request',
}

export const Text: Story = {
  args: {
    post: textPost,
  },
}

export const Event: Story = {
  args: {
    post: eventPost,
  },
}

export const Request: Story = {
  args: {
    post: requestPost,
  },
}

export const WithAvatar: Story = {
  args: {
    post: {
      ...textPost,
      author: {
        name: 'Max Mustermann',
        avatar: 'https://github.com/shadcn.png',
      },
    },
  },
}

export const Feed: Story = {
  render: () => (
    <div className="space-y-4 max-w-lg">
      <PostCard post={textPost} />
      <PostCard post={eventPost} />
      <PostCard post={requestPost} />
    </div>
  ),
}
