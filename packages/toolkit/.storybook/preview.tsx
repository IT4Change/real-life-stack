import './storybook.css'
import type { Preview } from '@storybook/react-vite'
import React from 'react'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      options: {
        light: { name: 'light', value: 'oklch(0.985 0.002 247.839)' },
        dark: { name: 'dark', value: 'oklch(0.21 0.034 264.665)' }
      }
    },
  },

  decorators: [
    (Story, context) => {
      const isDark = context.globals.backgrounds?.value === 'oklch(0.21 0.034 264.665)'
      return (
        <div className={`font-sans p-4 ${isDark ? 'dark' : ''}`}>
          <Story />
        </div>
      )
    },
  ],

  initialGlobals: {
    backgrounds: {
      value: 'light'
    }
  }
}

export default preview
