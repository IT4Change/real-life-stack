import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const toolkitSrc = path.resolve(__dirname, '../../packages/toolkit/src')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE_PATH || '/',
  resolve: {
    alias: {
      '@real-life-stack/toolkit': toolkitSrc,
      '@': toolkitSrc,
    },
  },
})
