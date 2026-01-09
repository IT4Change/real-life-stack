import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const toolkitSrc = path.resolve(__dirname, '../../packages/toolkit/src')
const basePath = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: basePath,
  define: {
    'import.meta.env.VITE_BASE_PATH': JSON.stringify(basePath),
  },
  resolve: {
    alias: {
      '@real-life-stack/toolkit': toolkitSrc,
      '@': toolkitSrc,
    },
  },
})
